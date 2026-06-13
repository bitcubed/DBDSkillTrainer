// Run-loop state machine: idle → between → warn → active → cooldown, plus
// pacing, perk token state, generator charge, and check resolution. This is a
// faithful port of the prototype's step()/press()/resolve() — DOM-free and
// driven by an external clock so it can be unit-tested headless.

import {
  COOLDOWN_REQUEUE_GAP_MS,
  DRILL_FAIL_PAUSE_MS,
  DRILL_GAP_MIN_MS,
  DRILL_GAP_RAND_MS,
  ERRS_CAP,
  FAIL_PAUSE_MS,
  GEN_CHARGES,
  SNAP_FAIL_PAUSE_MS,
  STAKEOUT_MAX,
  STAKEOUT_REGEN_MS,
  START_DELAY_MS,
  STORM_CHAIN_GAP_MS,
  STORM_START_FRACTION,
  TYPES,
} from './constants';
import { classify, errMs, rotMs, zoneDegs } from './geometry';
import {
  effectiveWarnLeadMs,
  gainHyperfocusToken,
  hyperfocusBonusMul,
  triggerOddsPct,
} from './perks';
import { spawnCheck } from './skillCheck';
import type {
  CheckType,
  FailKind,
  Mode,
  Pacing,
  Phase,
  PressOutcome,
  Result,
  RunStats,
  SkillCheck,
  SpecialId,
  UnnervingTier,
} from './types';

export function emptyRunStats(): RunStats {
  return { great: 0, good: 0, miss: 0, streak: 0, best: 0, errs: [] };
}

export interface ResolveEvent {
  /** What the press (or timeout) classified as, before Stake Out conversion. */
  rawKind: PressOutcome | 'nopress';
  /** Final result after Stake Out conversion. */
  result: Result;
  failKind: FailKind | null;
  travelDeg: number | null; // null for nopress
  errMs: number | null; // signed; null for nopress
  bonusPct: number; // progress bonus applied (already × HF multiplier), 0 if none
  failPct: number; // progress penalty applied (positive), 0 if none
  stakeOutConverted: boolean;
}

export interface SessionHooks {
  onWarn?: (now: number) => void;
  onSpawn?: (check: SkillCheck, now: number) => void;
  onResolve?: (ev: ResolveEvent, now: number) => void;
  /** Storm gen completed outside a Program — the session has stopped itself. */
  onStormComplete?: (checksHit: number, now: number) => void;
}

export interface StageSize {
  w: number;
  h: number;
}

export class Session {
  mode: Mode = 'gen';
  special: SpecialId = 'ds';
  pacing: Pacing = 'drill';

  running = false;
  phase: Phase = 'idle';
  nextAt = 0;
  warnAt = 0;
  check: SkillCheck | null = null;

  hyperfocus = false;
  hfTokens = 0;
  stakeOut = false;
  soTokens = STAKEOUT_MAX;
  unnerving: UnnervingTier = 0;
  lullaby = 0;
  toolbox = false;
  storm = false;

  speedMul = 1;
  zoneMul = 1;
  warnLeadMs = 500;
  dialScale = 1; // cosmetic dial size (slider); never affects timing/zone geometry

  charges = 0;
  stormCount = 0;
  stats: RunStats = emptyRunStats();
  /**
   * Monotone count of timing errors ever logged. Never reset — snapshot/diff
   * consumers (run logging, program segments) stay correct even after the
   * errs array hits its 200-entry cap and starts shifting.
   */
  errCountTotal = 0;

  /** Set by the ProgramController; alters cooldown requeue + storm completion. */
  programActive = false;

  private soNextAt = 0;
  private lastSecRoll = 0;
  private lastT = 0;

  constructor(
    private readonly stage: () => StageSize,
    private readonly rng: () => number = Math.random,
    private readonly hooks: SessionHooks = {},
  ) {}

  // ---- derived state ----
  activeType(): CheckType {
    // gen + doctor both run on the generator dial
    return this.mode === 'special' ? TYPES[this.special] : TYPES.gen;
  }
  isRepair(): boolean {
    return this.mode === 'gen' || this.mode === 'doctor';
  }
  perksApply(): boolean {
    return this.isRepair();
  }
  /** Storm only makes sense on the repair-style dials, not Specials. */
  stormOn(): boolean {
    return this.storm && this.isRepair();
  }
  effectiveHfTokens(): number {
    return this.hyperfocus && this.perksApply() ? this.hfTokens : 0;
  }
  effectiveUnnerving(): UnnervingTier {
    return this.perksApply() ? this.unnerving : 0;
  }
  currentRotMs(): number {
    return rotMs(this.activeType(), this.speedMul, this.effectiveHfTokens());
  }
  currentZoneDegs(): { greatDeg: number; goodDeg: number } {
    return zoneDegs(this.activeType(), this.zoneMul, this.effectiveUnnerving());
  }

  // ---- control ----
  start(now: number): void {
    this.running = true;
    this.hfTokens = 0;
    this.soTokens = STAKEOUT_MAX;
    this.soNextAt = now + STAKEOUT_REGEN_MS;
    // Merciless Storm begins at 90% gen progress (its real trigger point); otherwise from 0.
    if (this.stormOn()) {
      this.charges = GEN_CHARGES * STORM_START_FRACTION;
      this.stormCount = 0;
    } else {
      this.charges = 0;
    }
    this.lastSecRoll = now;
    this.queueNext(now, START_DELAY_MS);
  }

  stop(): void {
    this.running = false;
    this.phase = 'idle';
  }

  resetStats(): void {
    this.stats = emptyRunStats();
  }

  queueNext(now: number, delayMs: number): void {
    this.phase = 'between';
    this.nextAt = now + delayMs;
  }

  /** A press with no active check does nothing (game behavior). */
  press(now: number): void {
    if (!this.running) return;
    const c = this.check;
    if (this.phase === 'active' && c && !c.resolved) {
      const travel = (now - c.t0) * c.degPerMs;
      this.resolve(classify(travel, c), travel, now);
    }
  }

  tick(now: number): void {
    const dt = this.lastT ? (now - this.lastT) / 1000 : 0;
    this.lastT = now;
    if (!this.running) return;

    // Passive charge gain while repairing (1 charge/s solo), paused in cooldown.
    if (this.isRepair() && this.phase !== 'cooldown') {
      this.charges = Math.min(GEN_CHARGES, this.charges + dt);
      if (this.stormOn() && this.charges >= GEN_CHARGES) {
        if (this.programActive) {
          // During the Program, loop the gen back to 90% so checks keep coming.
          this.charges = GEN_CHARGES * STORM_START_FRACTION;
        } else {
          this.running = false;
          this.phase = 'idle';
          this.hooks.onStormComplete?.(this.stormCount, now);
        }
      }
    }

    // Stake Out token regen: +1 / 15s, max 4.
    if (this.stakeOut && now >= this.soNextAt) {
      this.soTokens = Math.min(STAKEOUT_MAX, this.soTokens + 1);
      this.soNextAt = now + STAKEOUT_REGEN_MS;
    }

    if (this.phase === 'between') {
      if (this.pacing === 'drill' || this.stormOn() || this.mode === 'special') {
        if (now >= this.nextAt) this.beginWarn(now);
      } else if (now - this.lastSecRoll >= 1000) {
        // Realistic pacing: roll the trigger odds once per second.
        this.lastSecRoll = now;
        const odds = triggerOddsPct(this.activeType(), {
          isRepair: this.isRepair(),
          toolbox: this.toolbox,
          hyperfocus: this.hyperfocus,
          hfTokens: this.hfTokens,
          unnervingTier: this.unnerving,
        });
        if (this.rng() * 100 < odds) this.beginWarn(now);
      }
    } else if (this.phase === 'warn') {
      if (now >= this.warnAt) this.spawn(now);
    } else if (this.phase === 'active') {
      const c = this.check;
      if (c) {
        const travel = (now - c.t0) * c.degPerMs;
        if (travel >= c.zoneStartDeg + c.greatDeg + c.goodDeg) this.resolve('nopress', null, now);
      }
    } else if (this.phase === 'cooldown') {
      if (now >= this.nextAt) {
        if (this.pacing === 'drill' || this.mode === 'special' || this.programActive) {
          this.queueNext(now, COOLDOWN_REQUEUE_GAP_MS);
        } else {
          this.phase = 'between';
          this.lastSecRoll = now;
        }
      }
    }
  }

  // ---- internals ----
  private beginWarn(now: number): void {
    this.phase = 'warn';
    this.warnAt = now + effectiveWarnLeadMs(this.warnLeadMs, this.lullaby, this.stormOn());
    this.hooks.onWarn?.(now);
  }

  private spawn(now: number): void {
    const { w, h } = this.stage();
    this.check = spawnCheck(now, this.activeType(), {
      zoneMul: this.zoneMul,
      unnervingTier: this.effectiveUnnerving(),
      speedMul: this.speedMul,
      hfTokens: this.effectiveHfTokens(),
      madness: this.mode === 'doctor',
      w,
      h,
      dialScale: this.dialScale,
      rng: this.rng,
    });
    this.phase = 'active';
    this.hooks.onSpawn?.(this.check, now);
  }

  private addProgress(pct: number): void {
    if (!this.isRepair() || !pct) return;
    this.charges = Math.max(0, Math.min(GEN_CHARGES, this.charges + (pct / 100) * GEN_CHARGES));
  }

  private resolve(kind: PressOutcome | 'nopress', travel: number | null, now: number): void {
    const c = this.check;
    if (!c) return;
    c.resolved = true;

    // Stake Out: a Good is consumed into a Great (+1% bonus) and feeds Hyperfocus.
    const converted = kind === 'good' && this.stakeOut && this.soTokens > 0 && this.perksApply();
    if (converted) this.soTokens--;

    const type = c.type;
    let result: Result;
    let bonusPct = 0;
    let failPct = 0;

    if (kind === 'great' || converted) {
      result = 'great';
      this.stats.great++;
      this.stats.streak++;
      this.stats.best = Math.max(this.stats.best, this.stats.streak);
      // HF bonus uses tokens held *before* this great (first check of an action gets no bonus).
      const tokensBefore = this.effectiveHfTokens();
      if (this.hyperfocus && this.perksApply()) this.hfTokens = gainHyperfocusToken(this.hfTokens);
      const bonus = converted ? 1 : type.greatBonus;
      bonusPct = bonus * hyperfocusBonusMul(tokensBefore);
      this.addProgress(bonusPct);
    } else if (kind === 'good') {
      result = 'good';
      this.stats.good++;
      this.stats.streak = 0;
      this.hfTokens = 0;
    } else {
      result = 'miss';
      this.stats.miss++;
      this.stats.streak = 0;
      this.hfTokens = 0;
      failPct = type.failPct;
      this.addProgress(-failPct);
    }

    let err: number | null = null;
    if (travel != null && kind !== 'nopress') {
      err = errMs(travel, c);
      this.stats.errs.push({ ms: err, res: result });
      this.errCountTotal++;
      if (this.stats.errs.length > ERRS_CAP) this.stats.errs.shift();
    }

    // What happens next.
    if (this.stormOn()) {
      // Unlimited-timing storm (APPROXIMATED — the game blocks the gen 16/18/20s):
      // chain continuously regardless of result. A miss costs progress (already
      // applied above) but never blocks or ends the session.
      if (result === 'great' || result === 'good') this.stormCount++;
      this.queueNext(now, STORM_CHAIN_GAP_MS);
    } else if (kind === 'early' || kind === 'late' || kind === 'nopress') {
      // Snap Out of It uses its verified 2s fail pause; everything else 3s (realistic).
      const pause =
        this.pacing === 'realistic'
          ? type.id === 'snap'
            ? SNAP_FAIL_PAUSE_MS
            : FAIL_PAUSE_MS
          : DRILL_FAIL_PAUSE_MS;
      this.phase = 'cooldown';
      this.nextAt = now + pause;
    } else if (this.pacing === 'drill') {
      this.queueNext(now, DRILL_GAP_MIN_MS + this.rng() * DRILL_GAP_RAND_MS);
    } else {
      this.phase = 'between';
      this.nextAt = now;
      this.lastSecRoll = now;
    }

    this.hooks.onResolve?.(
      {
        rawKind: kind,
        result,
        failKind: kind === 'early' || kind === 'late' || kind === 'nopress' ? kind : null,
        travelDeg: travel,
        errMs: err,
        bonusPct,
        failPct,
        stakeOutConverted: converted,
      },
      now,
    );
  }
}
