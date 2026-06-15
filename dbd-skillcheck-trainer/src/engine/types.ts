// Shared types/enums for the engine. See CLAUDE_CODE_PROJECT_SPEC.md §4.

export type Mode = 'gen' | 'doctor' | 'special' | 'hard';
export type SpecialId = 'ds' | 'oc1' | 'oc2' | 'oc3' | 'opp' | 'bnp' | 'snap';
export type CheckId = 'gen' | SpecialId;
export type Pacing = 'drill' | 'realistic';
export type InputMode = 'both' | 'mouse' | 'space';
export type Result = 'great' | 'good' | 'miss';
export type FailKind = 'early' | 'late' | 'nopress';
export type Phase = 'idle' | 'between' | 'warn' | 'active' | 'cooldown';
export type UnnervingTier = 0 | 1 | 2 | 3;

/** Where the pointer was at press time, before Stake Out conversion. */
export type PressOutcome = 'great' | 'good' | 'early' | 'late';

export interface CheckType {
  id: CheckId;
  label: string;
  greatPct: number; // % of circumference
  goodPct: number; // 0 for great-only checks
  rotS: number; // seconds per full rotation
  greatBonus: number; // +% progress on great (gen=1, great-only=0)
  failPct: number; // progress lost on miss
  minPosDeg: number; // earliest success-zone start (deg from 12 o'clock)
  triggerPctPerSec: number; // realistic-pacing odds
}

export interface SkillCheck {
  t0: number; // performance.now() at spawn
  type: CheckType;
  dir: 1 | -1; // 1 = clockwise; -1 = madness reverse
  cx: number;
  cy: number; // dial center (madness may offset)
  zoneStartDeg: number;
  greatDeg: number;
  goodDeg: number;
  degPerMs: number;
  resolved: boolean;
}

export interface TimingErr {
  ms: number; // signed ms from great-zone center (− early)
  res: Result;
}

export interface RunStats {
  great: number;
  good: number;
  miss: number;
  streak: number;
  best: number;
  errs: TimingErr[];
}

export interface SegmentResult {
  name: string;
  greats: number;
  goods: number;
  misses: number;
  hits: number;
  meanMs: number | null; // constant error
  sdMs: number | null; // variable error
  // Hard Mode ("Lookout" segment) only — killer-spotting outcome:
  killerEncounters?: number;
  killerSpotted?: number;
}

export interface SessionRecord {
  id: string; // uuid/timestamp
  startedAt: number; // epoch ms
  kind: 'program' | 'freeplay';
  durationS: number;
  overall: {
    great: number;
    good: number;
    miss: number;
    greatRate: number;
    meanMs: number | null;
    sdMs: number | null;
    bestStreak: number; // best great streak at the time the run ended
    // Hard Mode metrics (history schema v2+; absent on pre-v2 / non-hard runs):
    killerEncounters?: number;
    killerSpotted?: number;
    killerSpottedRate?: number; // 0..1
    avgReactionMs?: number | null;
  };
  segments?: SegmentResult[]; // present for kind==='program'
  settingsSnapshot: Partial<Settings>;
}

export interface Settings {
  inputMode: InputMode;
  pacing: Pacing;
  volume: number; // 0..1
  speedMul: number;
  zoneMul: number;
  warnLeadMs: number;
  dialScale: number; // cosmetic dial-size multiplier
  bgNoise: boolean;
  lastMode: Mode;
  lastSpecial: SpecialId;
  reducedMotion: boolean;
  colorblindSafe: boolean;
  // Hard Mode tunables (all APPROXIMATED training knobs, not game values):
  hardApproachMs: number;
  hardCatchConeDeg: number;
  hardEncounterMinS: number;
  hardEncounterMaxS: number;
  hardMissPenaltyPct: number;
  hardPanSensitivity: number;
  hardDangerCue: boolean;
  hardDangerCueIntensity: number;
}
