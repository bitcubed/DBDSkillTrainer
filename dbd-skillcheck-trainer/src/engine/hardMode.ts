// Hard Mode (divided-attention / killer-lookout) engine: a virtual 360° yaw you
// pan with the mouse/keys, and a killer that approaches over a window which you
// must "catch" by holding it within a central cone. Pure, headless, clock- and
// RNG-injected so it unit-tests without a DOM or render layer.
//
// All values are APPROXIMATED training knobs (see constants HARD_DEFAULTS), not
// game data. The killer is a generic original silhouette (see render/scene.ts).

import { HARD_DEFAULTS } from './constants';

export interface HardConfig {
  approachMs: number;
  catchConeDeg: number;
  catchDwellMs: number;
  fovDeg: number;
  panSensitivity: number;
  panMaxDegPerSec: number;
  panDeadzone: number;
  keyTurnDegPerSec: number;
  encounterMinMs: number;
  encounterMaxMs: number;
  missPenaltyPct: number;
  dangerCue: boolean;
  dangerCueIntensity: number;
}

export function defaultHardConfig(): HardConfig {
  return { ...HARD_DEFAULTS };
}

// ---- pure helpers ----

/** Normalize any angle to [0, 360). */
export function wrapYaw(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Signed shortest angular difference a−b, in [-180, 180]. */
export function angleDelta(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

/**
 * Screen X (0..width) for a world yaw given the current view yaw and FOV, or
 * null when the yaw is outside the visible FOV slice. Center maps to width/2.
 */
export function yawToScreenX(
  worldYaw: number,
  viewYaw: number,
  fovDeg: number,
  width: number,
): number | null {
  const d = angleDelta(worldYaw, viewYaw);
  if (Math.abs(d) > fovDeg / 2) return null;
  return (d / fovDeg + 0.5) * width;
}

/**
 * Pan velocity (deg/sec) from the mouse's horizontal position. `frac` is 0..1
 * across the stage width. A central deadzone reads as no pan; past it the speed
 * eases up (quadratic) toward panMaxDegPerSec at the edges. Sign: + turns right.
 */
export function panVelocity(frac: number, cfg: HardConfig): number {
  const x = Math.max(-1, Math.min(1, frac * 2 - 1)); // -1..1
  const dz = cfg.panDeadzone;
  let m = 0;
  if (x > dz) m = (x - dz) / (1 - dz);
  else if (x < -dz) m = (x + dz) / (1 - dz);
  const eased = Math.sign(m) * m * m; // finer control near center
  return eased * cfg.panMaxDegPerSec * cfg.panSensitivity;
}

interface Killer {
  yaw: number;
  spawnAt: number;
  dwellMs: number;
}

export interface HardEvents {
  onSpawn?: (killerYaw: number, now: number) => void;
  onSpotted?: (reactionMs: number, now: number) => void;
  onReached?: (now: number) => void;
}

export class HardMode {
  /** View-center yaw, [0, 360). */
  yaw = 0;
  cfg: HardConfig;

  // Cumulative resolved outcomes since start() (encounters = spotted + missed).
  spotted = 0;
  missed = 0;
  reactionMsSum = 0;

  private panVel = 0; // deg/s from the mouse
  private keyTurn = 0; // -1 | 0 | 1 from the keyboard fallback
  private killer: Killer | null = null;
  private nextSpawnAt = 0;
  private started = false;

  constructor(
    cfg: HardConfig = defaultHardConfig(),
    private readonly rng: () => number = Math.random,
    private readonly events: HardEvents = {},
  ) {
    this.cfg = cfg;
  }

  start(now: number): void {
    this.started = true;
    this.yaw = this.rng() * 360;
    this.killer = null;
    this.panVel = 0;
    this.keyTurn = 0;
    this.spotted = 0;
    this.missed = 0;
    this.reactionMsSum = 0;
    this.scheduleNext(now);
  }

  stop(): void {
    this.started = false;
    this.killer = null;
    this.panVel = 0;
    this.keyTurn = 0;
  }

  /** Zero the metrics without starting (clean slate before a Program). */
  resetMetrics(): void {
    this.spotted = 0;
    this.missed = 0;
    this.reactionMsSum = 0;
  }

  get running(): boolean {
    return this.started;
  }

  /** Mouse position 0..1 across the stage width drives pan velocity. */
  setMousePan(frac: number): void {
    this.panVel = panVelocity(frac, this.cfg);
  }

  /** Keyboard turn fallback: -1 left, +1 right, 0 none. */
  setKeyTurn(dir: number): void {
    this.keyTurn = dir < 0 ? -1 : dir > 0 ? 1 : 0;
  }

  private scheduleNext(now: number): void {
    const span = Math.max(0, this.cfg.encounterMaxMs - this.cfg.encounterMinMs);
    this.nextSpawnAt = now + this.cfg.encounterMinMs + this.rng() * span;
  }

  tick(now: number, dt: number): void {
    if (!this.started) return;
    // Advance the view yaw (mouse pan + keyboard turn).
    const turn = this.panVel + this.keyTurn * this.cfg.keyTurnDegPerSec;
    if (turn !== 0) this.yaw = wrapYaw(this.yaw + turn * dt);

    if (!this.killer) {
      if (now >= this.nextSpawnAt) {
        // Spawn well away from where you're currently looking so it must be found.
        const offset = 70 + this.rng() * 220; // 70°..290° from current view
        this.killer = { yaw: wrapYaw(this.yaw + offset), spawnAt: now, dwellMs: 0 };
        this.events.onSpawn?.(this.killer.yaw, now);
      }
      return;
    }

    const k = this.killer;
    const off = Math.abs(angleDelta(k.yaw, this.yaw));
    if (off <= this.cfg.catchConeDeg) k.dwellMs += dt * 1000;
    else k.dwellMs = 0;

    if (k.dwellMs >= this.cfg.catchDwellMs) {
      const reaction = now - k.spawnAt;
      this.spotted++;
      this.reactionMsSum += reaction;
      this.killer = null;
      this.scheduleNext(now);
      this.events.onSpotted?.(reaction, now);
    } else if (now - k.spawnAt >= this.cfg.approachMs) {
      this.missed++;
      this.killer = null;
      this.scheduleNext(now);
      this.events.onReached?.(now);
    }
  }

  // ---- render/read accessors (allocation-free) ----

  killerActive(): boolean {
    return this.killer !== null;
  }

  /** Killer's world yaw, or NaN when none is active. */
  killerYaw(): number {
    return this.killer ? this.killer.yaw : Number.NaN;
  }

  /** Approach progress 0 (just spawned) .. 1 (about to reach you). */
  killerProgress(now: number): number {
    if (!this.killer) return 0;
    return Math.max(0, Math.min(1, (now - this.killer.spawnAt) / this.cfg.approachMs));
  }

  /** How much of the catch dwell is filled, 0..1 (for a "catching…" indicator). */
  killerDwellFrac(): number {
    if (!this.killer) return 0;
    return Math.max(0, Math.min(1, this.killer.dwellMs / this.cfg.catchDwellMs));
  }

  // ---- metrics ----

  encounters(): number {
    return this.spotted + this.missed;
  }

  spottedRate(): number {
    const n = this.encounters();
    return n === 0 ? 0 : this.spotted / n;
  }

  avgReactionMs(): number | null {
    return this.spotted === 0 ? null : this.reactionMsSum / this.spotted;
  }
}
