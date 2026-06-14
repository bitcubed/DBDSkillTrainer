// SOURCE OF TRUTH — verified against deadbydaylight.wiki.gg "Skill Checks"
// (re-verified 2026-06-10). See COWORK_PROJECT_CONTEXT.md §3. 1% of the dial = 3.6°.
// Do not change these numbers without re-verifying against the wiki and updating
// the context doc.

import type { CheckId, CheckType } from './types';

export const DEG_PER_PCT = 3.6;
export const MAX_POS_DEG = 330; // latest zone start (11 o'clock)
export const GEN_CHARGES = 90; // 1 charge/sec solo
export const FAIL_PAUSE_MS = 3000;
export const SNAP_FAIL_PAUSE_MS = 2000; // Snap Out of It's fail cool-down (wiki, 2026-06-10); all others use FAIL_PAUSE_MS

export const TYPES: Record<CheckId, CheckType> = {
  gen:  { id: 'gen',  label: 'Generator',       greatPct: 3,  goodPct: 13, rotS: 1.1, greatBonus: 1, failPct: 10, minPosDeg: 120, triggerPctPerSec: 8 },
  ds:   { id: 'ds',   label: 'Decisive Strike', greatPct: 7,  goodPct: 0,  rotS: 1.1, greatBonus: 0, failPct: 0,  minPosDeg: 240, triggerPctPerSec: 100 },
  oc1:  { id: 'oc1',  label: 'Overcharge I',    greatPct: 7,  goodPct: 0,  rotS: 1.2, greatBonus: 0, failPct: 13, minPosDeg: 120, triggerPctPerSec: 100 },
  oc2:  { id: 'oc2',  label: 'Overcharge II',   greatPct: 6,  goodPct: 0,  rotS: 1.1, greatBonus: 0, failPct: 14, minPosDeg: 120, triggerPctPerSec: 100 },
  oc3:  { id: 'oc3',  label: 'Overcharge III',  greatPct: 5,  goodPct: 0,  rotS: 1.0, greatBonus: 0, failPct: 15, minPosDeg: 120, triggerPctPerSec: 100 },
  opp:  { id: 'opp',  label: 'Oppression',      greatPct: 5,  goodPct: 0,  rotS: 1.0, greatBonus: 0, failPct: 10, minPosDeg: 120, triggerPctPerSec: 100 },
  bnp:  { id: 'bnp',  label: 'Brand New Part',  greatPct: 7,  goodPct: 0,  rotS: 1.1, greatBonus: 0, failPct: 10, minPosDeg: 120, triggerPctPerSec: 100 },
  snap: { id: 'snap', label: 'Snap Out of It',  greatPct: 12, goodPct: 0,  rotS: 1.2, greatBonus: 0, failPct: 25, minPosDeg: 120, triggerPctPerSec: 80 },
};

// Doctor/Madness uses the generator dial; the off-centre/reversed/both roll is a
// render+spawn behavior, not a separate TYPES row.

export const TOOLBOX_TRIGGER_PCT = 40; // gen trigger/sec with a toolbox
export const HF_PER_TOKEN_SPEED = 0.04; // +4% pointer speed / token
export const HF_PER_TOKEN_ODDS = 0.04; // +4% trigger odds / token
export const HF_PER_TOKEN_BONUS = 0.3; // +30% great-bonus / token (max tier)
export const HF_MAX_TOKENS = 6;
export const UNNERVING_GOOD_SHRINK = [0, 0.4, 0.5, 0.6] as const; // good-zone only
export const UNNERVING_ODDS = 0.1;
export const STAKEOUT_MAX = 4;
export const STAKEOUT_REGEN_MS = 15000;
export const STORM_START_FRACTION = 0.9;

// --- Pacing/timing constants, lifted verbatim from the prototype's inline
// literals (trainer pacing, not game data) ---
export const STORM_WARN_LEAD_MS = 120; // storm chains fast; long leads would break the ~0.9s/check cadence
export const DRILL_FAIL_PAUSE_MS = 900; // shortened fail pause in drill pacing
export const STORM_CHAIN_GAP_MS = 250; // gap between chained storm checks
export const DRILL_GAP_MIN_MS = 500; // drill pacing: 500–1400ms between checks
export const DRILL_GAP_RAND_MS = 900;
export const START_DELAY_MS = 700; // delay after pressing Start
export const COOLDOWN_REQUEUE_GAP_MS = 300; // post-cooldown gap (drill/special/program)
export const SEGMENT_START_GAP_MS = 600; // delay when a program segment begins
export const VARIED_START_GAP_MS = 350; // delay when the Varied segment rotates task
export const ZONE_SPAWN_MARGIN_DEG = 4; // keep zone end clear of 12 o'clock
export const ERRS_CAP = 200; // timing-error ring buffer size

export const APPROXIMATIONS = {
  warnLeadDefaultMs: 500, // exact game value unpublished → slider
  lullabyScaling: 'linear', // per-token gong reduction; real values unpublished
  audio: 'embedded recordings (warn/good/great); synthesized fail', // §5 relaxation 2026-06-14
  bgNoise: 'original', // invented for training
  stormTiming: 'unlimited', // trainer never blocks the gen (game blocks 16/18/20s)
  inputLatency: 'browser ≠ in-game pipeline',
} as const;
