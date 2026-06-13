// The 5-minute guided Program: Warm-up → Overload → Varied → Bias-fix →
// Pressure (300s total). Structure follows the motor-learning principles in
// the guide: overload harder than real, contextual interference via task
// rotation, bias reading, then continuous pressure. The controller drives a
// Session with an external clock so it is fully testable headless.

import {
  GEN_CHARGES,
  SEGMENT_START_GAP_MS,
  STORM_START_FRACTION,
  VARIED_START_GAP_MS,
} from './constants';
import { errsSince, meanSd } from '../analytics/stats';
import type { Session } from './session';
import type { Mode, SegmentResult, SpecialId } from './types';

export type SegmentKind = 'gen' | 'rotate' | 'storm';

export interface ProgramSegment {
  name: string;
  trains: string;
  durS: number;
  kind: SegmentKind;
  speed: number;
  zone: number;
  warnMs: number;
  bg: boolean;
}

export const PROGRAM: readonly ProgramSegment[] = [
  { name: 'Warm-up',  trains: 'Find your rhythm',           durS: 45, kind: 'gen',    speed: 1.0, zone: 1.0, warnMs: 500, bg: false },
  { name: 'Overload', trains: 'Faster + smaller than real', durS: 75, kind: 'gen',    speed: 1.4, zone: 0.7, warnMs: 350, bg: false },
  { name: 'Varied',   trains: 'Contextual interference',    durS: 75, kind: 'rotate', speed: 1.0, zone: 1.0, warnMs: 500, bg: true },
  { name: 'Bias-fix', trains: 'Center your timing tape',    durS: 45, kind: 'gen',    speed: 1.0, zone: 1.0, warnMs: 500, bg: false },
  { name: 'Pressure', trains: 'Continuous under fatigue',   durS: 60, kind: 'storm',  speed: 1.0, zone: 1.0, warnMs: 120, bg: false },
];

export const PROGRAM_TOTAL_S = PROGRAM.reduce((a, s) => a + s.durS, 0); // 300

export interface VariedRot {
  mode: Mode;
  special: SpecialId | null;
  speed: number;
  label: string;
}

// The Varied segment cycles these every ~7s for high contextual interference.
export const VARIED_ROT: readonly VariedRot[] = [
  { mode: 'gen',     special: null,  speed: 1.0,  label: 'Generator' },
  { mode: 'special', special: 'oc2', speed: 1.05, label: 'Overcharge II' },
  { mode: 'doctor',  special: null,  speed: 1.0,  label: 'Madness' },
];

export const VARIED_SWITCH_MS = 7000;

interface StatsSnap {
  g: number;
  gd: number;
  m: number;
  e: number;
}

export interface ProgramHooks {
  /** A new segment was applied (UI: sync tabs/sliders, HUD). */
  onSegment?: (seg: ProgramSegment, idx: number, now: number) => void;
  /** The Varied segment rotated to a new task. */
  onVariedRot?: (rot: VariedRot, now: number) => void;
  /** Program ran to completion; per-segment results attached. */
  onComplete?: (segments: SegmentResult[], now: number) => void;
  /** Program was cancelled mid-run. */
  onCancel?: (now: number) => void;
  /** BG noise is a render-layer concern; the program toggles it per segment. */
  setBgNoise?: (on: boolean) => void;
}

export class ProgramController {
  active = false;
  segIdx = -1;
  segStart = 0;
  rotIdx = 0;
  rotAt = 0;
  segStats: SegmentResult[] = [];
  private snap: StatsSnap | null = null;

  constructor(
    private readonly session: Session,
    private readonly hooks: ProgramHooks = {},
  ) {}

  currentSegment(): ProgramSegment | null {
    return this.active && this.segIdx >= 0 ? (PROGRAM[this.segIdx] ?? null) : null;
  }

  currentRot(): VariedRot {
    return VARIED_ROT[this.rotIdx % VARIED_ROT.length]!;
  }

  segElapsedS(now: number): number {
    return (now - this.segStart) / 1000;
  }

  /** Remaining in the current segment + the sum of all later segments. */
  totalRemainS(now: number): number {
    const seg = PROGRAM[this.segIdx];
    if (!this.active || !seg) return 0;
    let later = 0;
    for (let i = this.segIdx + 1; i < PROGRAM.length; i++) later += PROGRAM[i]!.durS;
    return Math.max(0, later + (seg.durS - this.segElapsedS(now)));
  }

  start(now: number): void {
    // Clean slate; the Program forces perks off and drives all settings itself.
    this.session.running = true;
    this.session.resetStats();
    this.session.programActive = true;
    this.active = true;
    this.segIdx = -1;
    this.segStart = now;
    this.snap = null;
    this.segStats = [];
    this.rotIdx = 0;
    this.rotAt = 0;
    this.advanceSegment(now);
  }

  tick(now: number): void {
    if (!this.active || this.segIdx < 0) return;
    const seg = PROGRAM[this.segIdx];
    if (!seg) return;
    if (this.segElapsedS(now) >= seg.durS) {
      this.advanceSegment(now);
    } else if (
      seg.kind === 'rotate' &&
      now - this.rotAt >= VARIED_SWITCH_MS &&
      this.session.phase !== 'active'
    ) {
      // Rotate task type only BETWEEN checks, never mid-check.
      this.applyVariedRot(this.rotIdx + 1, now);
    }
  }

  cancel(now: number): void {
    this.active = false;
    this.session.programActive = false;
    this.session.running = false;
    this.session.phase = 'idle';
    this.session.check = null;
    this.session.storm = false;
    this.hooks.onCancel?.(now);
  }

  private applySegment(seg: ProgramSegment, idx: number, now: number): void {
    const s = this.session;
    // Base settings common to every segment.
    s.speedMul = seg.speed;
    s.zoneMul = seg.zone;
    s.warnLeadMs = seg.warnMs;
    this.hooks.setBgNoise?.(seg.bg);
    // Perks force off for the duration.
    s.unnerving = 0;
    s.hyperfocus = false;
    s.stakeOut = false;
    s.lullaby = 0;
    s.toolbox = false;
    s.hfTokens = 0;
    // Mode / storm per segment kind.
    if (seg.kind === 'storm') {
      s.mode = 'gen';
      s.storm = true;
    } else if (seg.kind === 'rotate') {
      s.storm = false;
      this.applyVariedRot(0, now);
    } else {
      s.mode = 'gen';
      s.storm = false;
    }
    // Fresh dial for the segment.
    s.charges = s.stormOn() ? GEN_CHARGES * STORM_START_FRACTION : 0;
    s.phase = 'idle';
    s.check = null;
    s.queueNext(now, SEGMENT_START_GAP_MS);
    this.hooks.onSegment?.(seg, idx, now);
  }

  private applyVariedRot(idx: number, now: number): void {
    const rot = VARIED_ROT[idx % VARIED_ROT.length]!;
    this.rotIdx = idx;
    this.rotAt = now;
    const s = this.session;
    s.mode = rot.mode;
    if (rot.special) s.special = rot.special;
    s.speedMul = rot.speed;
    s.phase = 'idle';
    s.check = null;
    s.queueNext(now, VARIED_START_GAP_MS);
    this.hooks.onVariedRot?.(rot, now);
  }

  private snapStats(): StatsSnap {
    const st = this.session.stats;
    // The error snapshot uses the session's monotone counter, not an array
    // index — indices slide once the errs array hits its cap mid-Program.
    return { g: st.great, gd: st.good, m: st.miss, e: this.session.errCountTotal };
  }

  /** Diff cumulative stats against the snapshot taken at the segment boundary. */
  private finalizeSegment(): void {
    if (this.segIdx < 0 || !this.snap) return;
    const seg = PROGRAM[this.segIdx];
    if (!seg) return;
    const st = this.session.stats;
    const s = this.snap;
    const errs = errsSince(st.errs, this.session.errCountTotal, s.e);
    const greats = st.great - s.g;
    const goods = st.good - s.gd;
    const misses = st.miss - s.m;
    const { mean, sd } = meanSd(errs);
    this.segStats.push({
      name: seg.name,
      greats,
      goods,
      misses,
      hits: greats + goods + misses,
      meanMs: mean,
      sdMs: sd,
    });
  }

  private advanceSegment(now: number): void {
    this.finalizeSegment();
    this.segIdx++;
    if (this.segIdx >= PROGRAM.length) {
      this.endProgram(now);
      return;
    }
    const seg = PROGRAM[this.segIdx]!;
    this.segStart = now;
    this.snap = this.snapStats();
    this.applySegment(seg, this.segIdx, now);
  }

  private endProgram(now: number): void {
    // advanceSegment() already finalized the segment we're leaving before it
    // detected we're past the end — finalizing again here was the prototype's
    // double-finalize bug (regression-tested in tests/program.test.ts).
    this.active = false;
    this.session.programActive = false;
    this.session.running = false;
    this.session.phase = 'idle';
    this.session.check = null;
    this.session.storm = false;
    this.hooks.setBgNoise?.(false);
    this.hooks.onComplete?.(this.segStats.slice(), now);
  }
}

/** mm:ss with ceiling seconds, e.g. 300 → "5:00", 249.2 → "4:10". */
export function fmtClock(totalS: number): string {
  const s = Math.max(0, Math.ceil(totalS));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
