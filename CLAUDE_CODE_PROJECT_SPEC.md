# DBD Skill-Check Trainer — Build Spec for Claude Code

**Goal:** turn the working single-file prototype (`dbd-skillcheck-trainer.html`) into a
proper, maintainable, tested, statically-deployable web app, and add the one capability
the prototype can't have: **persistent cross-session progress tracking + an analytics
dashboard.**

**Read first:** `COWORK_PROJECT_CONTEXT.md` (project background, locked decisions, the
verified game-data table) and the prototype HTML file (the reference implementation —
port its math and feel; don't reinvent them). This spec assumes both are provided.

---

## 0. Constraints (do not violate)

- **Audio (rule relaxed 2026-06-14 — see context §5).** The `warn`/`good`/`great` cues
  are the owner's embedded recordings (`src/assets/*.mp3`, bundled by Vite); the `fail`
  cue stays synthesized. The owner accepted the copyright caveat for the public deploy.
  **All visuals stay original** — no sprites, screenshots, art, or fonts (Canvas-drawn).
- **No framework lock-in for the game loop.** The dial/engine is plain TypeScript +
  Canvas. A framework is allowed *only* if you choose it for the dashboard (see §2); the
  engine must not depend on it.
- **Static deploy.** The output must run as static files (no server runtime required).
- **Preserve the verified-vs-approximated distinction.** Approximated/adapted values
  (warning lead, Lullaby scaling, BG visuals, unlimited storm) must remain labeled in the
  UI, and the footer must state the audio posture honestly (embedded recordings for
  warn/good/great, synthesized fail — see context §5).
- **Don't re-add Healing or Wiggle.**

---

## 1. Goals & non-goals

**Goals**
1. Faithfully reproduce the prototype's behavior, math, and feel.
2. Refactor the monolith into typed, unit-tested modules.
3. Add **persistent session history** (every run + every Program logged locally).
4. Add a **progression dashboard**: great-rate and ±SD over time, per-segment trends,
   personal bests.
5. Persist user settings (input mode, volume, last mode, etc.).
6. Keep it dependency-light and statically deployable.

**Non-goals**
- Online accounts, servers, multiplayer, leaderboards across users.
- Mobile-native apps (responsive web is enough).
- Re-deriving game constants (they're given in §6).

---

## 2. Tech stack (recommended)

- **Language:** TypeScript (strict mode).
- **Build/dev:** Vite.
- **Tests:** Vitest (+ `@vitest/coverage`). Pure logic must be unit-tested without a DOM.
- **UI:** vanilla DOM + Canvas for the engine, tape, dial, BG noise, and the dashboard
  charts (hand-rolled canvas charts keep it dependency-free). **React is optional** and
  only justified if the dashboard grows complex — if used, isolate it to the
  dashboard/analytics UI; the engine stays framework-free.
- **Persistence:** `localStorage` for settings + a capped session-history log; promote to
  **IndexedDB** only if history size becomes a concern (it won't for a while — each run is
  a few hundred bytes).
- **Lint/format:** ESLint + Prettier.
- **Deploy:** static (GitHub Pages / Netlify / Cloudflare Pages). Include a CI step that
  runs typecheck + tests + build.

If you deviate from this stack, keep these properties: typed, unit-testable pure logic,
no server runtime, no heavy deps.

---

## 3. Project structure

```
dbd-skillcheck-trainer/
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ src/
│  ├─ main.ts                  # bootstrap: build UI, wire engine ↔ DOM, start RAF loop
│  ├─ engine/
│  │  ├─ constants.ts          # SOURCE OF TRUTH: TYPES table, dial math consts, APPROXIMATIONS
│  │  ├─ types.ts              # shared types/enums
│  │  ├─ geometry.ts           # zone degrees, rotMs, deg↔screen, errMs, classify
│  │  ├─ skillCheck.ts         # spawn a check (position, direction, madness rolls)
│  │  ├─ session.ts            # run-loop state machine (idle/between/warn/active/cooldown) + pacing
│  │  ├─ perks.ts              # HF / StakeOut / Unnerving / Lullaby / Toolbox / Storm modifiers
│  │  └─ program.ts            # 5-min Program: segment defs + scheduler + per-segment stats
│  ├─ audio/
│  │  └─ synth.ts              # WebAudio: embedded warn/good/great recordings + synthesized fail
│  ├─ render/
│  │  ├─ dial.ts               # the dial (ring, zones, pointer)
│  │  ├─ bgNoise.ts            # animated background field
│  │  └─ tape.ts               # timing tape canvas
│  ├─ analytics/
│  │  ├─ stats.ts              # in-run stats; constant error (mean) + variable error (SD)
│  │  ├─ history.ts            # persistent session log (load/save/append/prune)
│  │  └─ charts.ts             # canvas charts for the dashboard
│  ├─ ui/
│  │  ├─ controls.ts           # tabs, pacing/input selects, chips, sliders, buttons
│  │  ├─ hud.ts                # Program HUD (segment, clock, progress)
│  │  ├─ results.ts            # end-of-Program breakdown table + coaching
│  │  ├─ dashboard.ts          # progression dashboard (history + charts + PBs)
│  │  └─ guide.ts              # sidebar guide content
│  └─ styles/
│     └─ main.css
└─ tests/
   ├─ geometry.test.ts
   ├─ skillCheck.test.ts
   ├─ session.test.ts
   ├─ perks.test.ts
   ├─ program.test.ts
   └─ stats.test.ts
```

---

## 4. Core types (starting point — refine as needed)

```ts
// engine/types.ts
export type Mode = 'gen' | 'doctor' | 'special';
export type SpecialId = 'ds' | 'oc1' | 'oc2' | 'oc3' | 'opp' | 'bnp' | 'snap';
export type Pacing = 'drill' | 'realistic';
export type InputMode = 'both' | 'mouse' | 'space';
export type Result = 'great' | 'good' | 'miss';
export type FailKind = 'early' | 'late' | 'nopress';

export interface CheckType {
  id: string;
  label: string;
  greatPct: number;   // % of circumference
  goodPct: number;    // 0 for great-only checks
  rotS: number;       // seconds per full rotation
  greatBonus: number; // +% progress on great (gen=1, great-only=0)
  failPct: number;    // progress lost on miss
  minPosDeg: number;  // earliest success-zone start (deg from 12 o'clock)
  triggerPctPerSec: number; // realistic-pacing odds
}

export interface SkillCheck {
  t0: number;          // performance.now() at spawn
  type: CheckType;
  dir: 1 | -1;         // 1 = clockwise; -1 = madness reverse
  cx: number; cy: number;   // dial center (madness may offset)
  zoneStartDeg: number;
  greatDeg: number;
  goodDeg: number;
  degPerMs: number;
  resolved: boolean;
}

export interface RunStats {
  great: number; good: number; miss: number;
  streak: number; best: number;
  errs: { ms: number; res: Result }[]; // signed ms from great-zone center (− early)
}

export interface SegmentResult {
  name: string;
  greats: number; goods: number; misses: number; hits: number;
  meanMs: number | null;  // constant error
  sdMs: number | null;    // variable error
}

export interface SessionRecord {
  id: string;              // uuid/timestamp
  startedAt: number;       // epoch ms
  kind: 'program' | 'freeplay';
  durationS: number;
  overall: { great: number; good: number; miss: number; greatRate: number; meanMs: number | null; sdMs: number | null };
  segments?: SegmentResult[];   // present for kind==='program'
  settingsSnapshot: Partial<Settings>;
}

export interface Settings {
  inputMode: InputMode;
  pacing: Pacing;
  volume: number;          // 0..1
  speedMul: number; zoneMul: number; warnLeadMs: number;
  bgNoise: boolean;
  lastMode: Mode; lastSpecial: SpecialId;
  reducedMotion: boolean;
  colorblindSafe: boolean;
}
```

---

## 5. Engine behavior (port from prototype — these are the rules)

**Geometry (`geometry.ts`)** — pure, fully unit-tested:
- `1% = 3.6°`. `zoneDegs(type, zoneMul, unnervingTier)` → `{ greatDeg, goodDeg }`, where
  Unnerving shrinks **good only** by `[0, .40, .50, .60][tier]`.
- `rotMs(type, speedMul, hfTokens)` → `rotS*1000 / ((1 + 0.04*hfTokens) * speedMul)`.
- `degPerMs = 360 / rotMs`.
- `errMs(travelDeg, check)` → signed ms from the **great-zone center** (negative = early).
- `classify(travelDeg, check)` → `'great' | 'good' | FailKind` based on where the pointer
  was at press time.

**Spawn (`skillCheck.ts`)**:
- Zone start = random in `[min(type.minPosDeg, maxStart), maxStart]`, where
  `maxStart = min(330, 360 - (greatDeg+goodDeg) - 4)`.
- Madness (mode `doctor`): equal-chance roll → off-centre / reversed / both. Off-centre
  must clamp to keep the dial on-canvas (`Math.max(0, …)` guards — see prototype).

**Session state machine (`session.ts`)**: phases `idle → between → warn → active →
cooldown`. 
- **Drill** pacing and great-only/Special checks and Storm: spawn back-to-back with short
  gaps.
- **Realistic** pacing: once per second, roll `triggerPctPerSec` (gen/doctor with Toolbox
  → 40), `+4*hfTokens` if Hyperfocus, `+10` if Unnerving; spawn on success.
- Miss → cooldown (3 s in realistic, ~0.9 s in drill) per `FAIL_PAUSE_MS`; Snap Out of It
  uses `SNAP_FAIL_PAUSE_MS` (2 s) in realistic pacing.
- Pressing with no active check does nothing (game behavior).
- Generator passive charge: 1 charge/s while repairing and not in cooldown; gen = 90
  charges.

**Perks (`perks.ts`)** — all the modifiers in §3 of the context doc. Key ones to test:
- Hyperfocus bonus uses tokens **held before** the current great (first check → no
  bonus); `mul = 1 + 0.30 * tokensBefore`; tokens cap at 6; reset on good/miss.
- Stake Out: good → great (+1% bonus), consumes 1 token; converted greats feed Hyperfocus;
  +1 token/15 s, max 4.
- Storm: only valid on gen/doctor; **unlimited** (miss costs progress, never blocks/ends);
  starts gen at 90%; loops the gen on completion *during a Program* so checks keep coming.

**Audio (`synth.ts`)**: the `warn`/`good`/`great` cues play the owner's embedded
recordings (`src/assets/*.mp3`, Vite-bundled); the `fail` cue stays synthesized (a
distorted low blast + noise burst). Respect volume; warn is silent when Lullaby ≥ 5.
(Rule relaxed 2026-06-14 — see context §5; the prototype uses HTMLAudioElement for the
same three files.)

**Render (`dial.ts`, `bgNoise.ts`, `tape.ts`)**: faithful dial (white ring, bright solid
great band at the leading edge, lighter outlined good band, red needle + hub); animated
BG field (dust/embers/blobs) on a layer **behind** the dial that never alters check
geometry; timing tape with to-scale great/good bands, signed-ms ticks, and avg ± SD
readout.

---

## 6. Source-of-truth constants (`constants.ts`)

Encode exactly this (verified against deadbydaylight.wiki.gg; re-verified 2026-06-10;
`1% = 3.6°`). Keep an `APPROXIMATIONS` block documenting non-official values.

```ts
export const DEG_PER_PCT = 3.6;
export const MAX_POS_DEG = 330;     // latest zone start (11 o'clock)
export const GEN_CHARGES = 90;      // 1 charge/sec solo
export const FAIL_PAUSE_MS = 3000;
export const SNAP_FAIL_PAUSE_MS = 2000; // Snap Out of It's fail cool-down (wiki, 2026-06-10); all others use FAIL_PAUSE_MS

export const TYPES: Record<string, CheckType> = {
  gen:  { id:'gen',  label:'Generator',       greatPct:3,  goodPct:13, rotS:1.1, greatBonus:1, failPct:10, minPosDeg:120, triggerPctPerSec:8 },
  ds:   { id:'ds',   label:'Decisive Strike', greatPct:7,  goodPct:0,  rotS:1.1, greatBonus:0, failPct:0,  minPosDeg:240, triggerPctPerSec:100 },
  oc1:  { id:'oc1',  label:'Overcharge I',    greatPct:7,  goodPct:0,  rotS:1.2, greatBonus:0, failPct:13, minPosDeg:120, triggerPctPerSec:100 },
  oc2:  { id:'oc2',  label:'Overcharge II',   greatPct:6,  goodPct:0,  rotS:1.1, greatBonus:0, failPct:14, minPosDeg:120, triggerPctPerSec:100 },
  oc3:  { id:'oc3',  label:'Overcharge III',  greatPct:5,  goodPct:0,  rotS:1.0, greatBonus:0, failPct:15, minPosDeg:120, triggerPctPerSec:100 },
  opp:  { id:'opp',  label:'Oppression',      greatPct:5,  goodPct:0,  rotS:1.0, greatBonus:0, failPct:10, minPosDeg:120, triggerPctPerSec:100 },
  bnp:  { id:'bnp',  label:'Brand New Part',  greatPct:7,  goodPct:0,  rotS:1.1, greatBonus:0, failPct:10, minPosDeg:120, triggerPctPerSec:100 },
  snap: { id:'snap', label:'Snap Out of It',  greatPct:12, goodPct:0,  rotS:1.2, greatBonus:0, failPct:25, minPosDeg:120, triggerPctPerSec:80 },
};

// Doctor/Madness uses the generator dial; the off-centre/reversed/both roll is a render+spawn behavior, not a separate TYPES row.

export const TOOLBOX_TRIGGER_PCT = 40;       // gen trigger/sec with a toolbox
export const HF_PER_TOKEN_SPEED = 0.04;      // +4% pointer speed / token
export const HF_PER_TOKEN_ODDS = 0.04;       // +4% trigger odds / token
export const HF_PER_TOKEN_BONUS = 0.30;      // +30% great-bonus / token (max tier)
export const HF_MAX_TOKENS = 6;
export const UNNERVING_GOOD_SHRINK = [0, 0.40, 0.50, 0.60]; // good-zone only
export const UNNERVING_ODDS = 0.10;
export const STAKEOUT_MAX = 4;
export const STAKEOUT_REGEN_MS = 15000;
export const STORM_START_FRACTION = 0.9;

export const APPROXIMATIONS = {
  warnLeadDefaultMs: 500,   // exact game value unpublished → slider
  lullabyScaling: 'linear', // per-token gong reduction; real values unpublished
  audio: 'embedded',        // warn/good/great recordings; fail synthesized (§5 relaxation)
  bgNoise: 'original',      // invented for training
  stormTiming: 'unlimited', // trainer never blocks the gen (game blocks 16/18/20s)
  inputLatency: 'browser ≠ in-game pipeline',
};
```

---

## 7. The 5-minute Program (`program.ts`)

Port the prototype's Program exactly. Segments (total = **300 s**):

| # | Name | Dur | Settings | Trains |
|---|---|---|---|---|
| 1 | Warm-up | 45 s | Generator, 1.0× speed, 1.0× zone, 500 ms warn | Find the rhythm |
| 2 | Overload | 75 s | Generator, **1.4× speed, 0.7× zone**, 350 ms warn | Harder than real |
| 3 | Varied | 75 s | rotate {Generator, Overcharge II @1.05×, Madness} every **7 s**, BG noise on | Contextual interference |
| 4 | Bias-fix | 45 s | Generator, 1.0×, 1.0×, 500 ms warn | Center your timing |
| 5 | Pressure | 60 s | **Merciless Storm** (continuous), 120 ms warn | Under fatigue |

Rules:
- Perks force **off** for the duration; the Program drives speed/zone/warn/mode/storm and
  **locks** the manual controls so the user can't desync it.
- The Varied segment rotates task type **only between checks**, never mid-check.
- During the Program, a completed Storm gen **loops back to 90%** so checks keep coming for
  the full 60 s.
- Capture **per-segment stats** by snapshotting cumulative counts + the timing-error array
  index at each segment boundary, then diffing. **Each segment must be finalized exactly
  once** — note the prototype had a double-finalize bug at the final boundary
  (`advanceSegment` finalizes the outgoing segment, then `endProgram` must **not**
  finalize again). Encode this as a regression test (§9).
- HUD shows `N/5 · NAME`, the segment's "trains" line (with the current rotated task during
  Varied), a segment progress bar, and a **total countdown clock** (remaining in current
  segment + sum of later segments).
- End screen: per-segment table (checks, great-rate, great/good/miss split, bias ± SD),
  an overall line, and a coaching note (call out the weakest segment by great-rate; tell
  the user which way to nudge timing if `|overall mean| > 12 ms`, else praise centering and
  point at the SD).

---

## 8. New features (beyond the prototype)

### 8.1 Persistent session history (`analytics/history.ts`)
- On the end of **every** run (free-play *and* Program), append a `SessionRecord` to
  `localStorage` (key e.g. `dbdtrainer.history.v1`). Cap at e.g. 500 records (prune
  oldest). Store a schema version for forward migration.
- Free-play runs should also be loggable — define "a run" as Start→Stop with ≥ N checks
  (e.g. 10) so trivial sessions don't pollute history.

### 8.2 Progression dashboard (`ui/dashboard.ts`, `analytics/charts.ts`)
A tab/panel showing trends **across** sessions (this is the whole point — §4 says
improvement is a between-session trend):
- **Great-rate over time** (line chart, per session; option to filter Program-only).
- **Variable error (±SD) over time** (line chart) — should trend **down**.
- **Constant error (avg bias) over time** — should hover near 0.
- **Per-segment trends** for Programs (small multiples or a selectable segment): great-rate
  and ±SD per segment over the last N programs.
- **Personal bests:** best great-rate, lowest ±SD, longest great streak, most Programs
  completed; and a current streak of consecutive days/sessions.
- A short auto-generated readout ("Your ±SD dropped 18ms over your last 10 sessions").
  Keep claims strictly computed from the data — no invented numbers.
- Charts are hand-rolled on canvas (consistent with the tape) unless React+a chart lib is
  chosen for the dashboard only.

### 8.3 Settings persistence (`ui/controls.ts` + `analytics/history.ts` or a small
`settings.ts`)
- Persist `Settings` (input mode, volume, last mode/special, slider values, BG noise,
  reducedMotion, colorblindSafe) and restore on load.

### 8.4 Accessibility
- Respect `prefers-reduced-motion` (disable shake + BG noise animation; keep a static
  field).
- Full keyboard operability; visible focus rings.
- A **colorblind-safe** toggle (the great/good/miss colors must stay distinguishable —
  don't rely on red/green alone; use shape/position/brightness cues in the tape too).

---

## 9. Testing requirements (Vitest, no DOM for engine tests)

Pure-logic coverage is the point of the refactor. Minimum cases:

**geometry.test.ts**
- Gen great window ≈ **33 ms** at 1.1 s / 1.0× / 0 HF tokens; gen great deg = 10.8°, good =
  46.8°.
- `rotMs` scales: 6 HF tokens → `1100 / (1+0.24) = ~887 ms`; speedMul 1.4 → `~786 ms`.
- Unnerving III shrinks **good** by 60%, leaves **great** unchanged.
- `classify` boundaries: just-inside vs just-outside great; great→good transition;
  early/late/nopress.
- `errMs` sign convention: pressing before great-center is **negative**.

**skillCheck.test.ts**
- Zone start always within `[minPosDeg, maxStart]`; never overflows the dial.
- DS earliest = 240°; gen earliest = 120°; latest ≤ 330°.
- Madness produces all three variants over many rolls; off-centre center stays on-canvas
  for small viewports (no negative ranges).

**session.test.ts**
- Realistic trigger odds: with Toolbox, gen rolls at 40/sec; `+4*tokens` and `+10`
  Unnerving applied.
- Miss → cooldown of the right duration; press with no active check is a no-op.
- Gen charge accrues at 1/sec while repairing.

**perks.test.ts**
- Hyperfocus: first great of an action → no bonus; tokensBefore=6 → `mul=2.8` → gen great
  = +2.8%; good/miss resets tokens; cap at 6.
- Stake Out: good→great (+1% bonus), token decremented; converted great increments HF;
  regen +1/15 s capped at 4.
- Storm: a miss applies the progress penalty but does **not** set a blocked/ended state.

**program.test.ts**
- 5 segments, total duration 300 s; each segment applies the right speed/zone/mode/warn.
- Varied rotates task type every ~7 s and only between checks.
- **Regression:** running the full Program (driven with a fake clock) records **exactly 5**
  segment results — the last segment is finalized once, not twice (the double-finalize
  bug).
- Countdown clock at t=0 reads 5:00; after 50 s reads ~4:10 and the active segment is
  Overload (1.4× / 0.7×).
- Cancel mid-program cleanly clears active/running/storm.

**stats.test.ts**
- Constant error (mean) and variable error (SD) computed correctly for a known error array.
- `greatRate = great / (great+good+miss)`.
- History append/prune (cap respected; oldest dropped; schema version present); corrupt/
  missing storage handled gracefully (no crash → empty history).

Target: high coverage on `engine/`, `analytics/stats.ts`, `analytics/history.ts`,
`program.ts`. CI runs typecheck + tests + build.

---

## 10. Acceptance criteria

1. App builds and runs as static files (`vite build` → deployable `dist/`).
2. Every prototype mode/perk/slider/input works identically; the dial, tape, BG noise, and
   audio match the prototype's behavior and feel.
3. The 5-minute Program runs, locks controls, rotates the Varied segment, loops the Storm
   gen, and shows a correct per-segment breakdown — verified by the program tests.
4. Session history persists across reloads; the dashboard shows great-rate, ±SD, and bias
   trends plus personal bests, all computed from stored data.
5. Settings persist across reloads.
6. `prefers-reduced-motion` respected; colorblind-safe mode keeps results distinguishable;
   keyboard-operable with visible focus.
7. Verified-vs-approximated labeling preserved in the UI footer (warning lead, Lullaby
   scaling, audio posture [embedded warn/good/great recordings, synthesized fail], BG
   visuals, unlimited storm, browser-latency caveat).
8. No copyrighted **visual** assets anywhere; audio is the owner's embedded cue
   recordings (warn/good/great) with a synthesized fail, per the context §5 relaxation —
   the accepted copyright caveat for the public deploy.
9. Tests in §9 pass; typecheck clean; lint clean.

---

## 11. Migration notes

- Treat the single-file prototype as the behavioral spec. Port the math verbatim
  (geometry, perks, program), then add types and tests around it — don't "improve" the
  numbers.
- Suggested order: (1) scaffold Vite+TS+Vitest; (2) port `constants` + `geometry` +
  `stats` with tests; (3) port `skillCheck` + `session` + `perks` with tests; (4) port
  `program` with the regression test; (5) port render + audio + controls to get parity
  with the prototype; (6) add history + settings persistence; (7) build the dashboard;
  (8) accessibility pass; (9) CI + deploy.
- Keep a `CHANGELOG.md` and update `COWORK_PROJECT_CONTEXT.md`'s "current state" when parity
  is reached and when the dashboard ships.

### 11.1 Documented port divergences (parity build, 2026-06-11)

The stage-1–5 port reached prototype parity with these deliberate, audited
differences (engine math is otherwise verbatim — see `CHANGELOG.md`):

1. **Snap Out of It fail pause = 2 s** in realistic pacing (`SNAP_FAIL_PAUSE_MS`),
   per the 2026-06-10 wiki re-verification; the prototype used the generic 3 s.
2. **Dropped the prototype's unused `bpGreat` TYPES field** (dead data).
3. **Inline pacing literals → named constants** in `engine/constants.ts`
   (storm 120 ms lead, drill 900 ms fail pause, 250 ms storm gap, 500–1400 ms
   drill gap, 700/600/350/300 ms delays, 4° spawn margin, 200-entry errs cap) —
   values unchanged.
4. **Cosmetic dial additions** toward the in-game look, geometry untouched:
   darkened backdrop disc behind an active check, radial edge ticks bracketing
   the zones, short fading needle trail, brief result pulse on resolve.
5. **Keyboard a11y groundwork** (ahead of §8.4): focusable tabs/chips with
   Enter activation (Space stays reserved for the press), aria-labels on
   selects/sliders; chip activation guards against the Program lock and the
   disabled state. `prefers-reduced-motion` freezes the BG-noise field to a
   static scatter (§8.4 behavior, built early).
6. **Varied-segment slider readout** reflects the live rotation speed (1.05× on
   Overcharge II); the prototype's slider displayed the stale segment baseline.
7. **Dev-only `window.__trainer`** debug handle (absent from production builds).
8. The Program **does not force pacing to Drill** (prototype behavior preserved):
   gen segments run on realistic odds if Realistic was selected before starting.
   The pacing select is locked during the Program either way.

### 11.2 Documented divergences (stages 6–9 build, 2026-06-11)

9. **Program end/cancel restores the user's persisted settings** (speed/zone/
   warn/mode/special/BG noise) instead of leaving the final segment's values
   live, as the prototype did. With §8.3 persistence, the prototype behavior
   left the live state contradicting what a reload would restore.
10. **Run-logging rules** (§8.1 refinements): free-play runs need ≥10 checks;
    cancelled Programs are not logged; **Reset mid-run discards** the pre-reset
    stretch unlogged (reset = "wipe it"); closing the tab mid-run logs the run
    via a `pagehide` flush. A record's `bestStreak` is the session's
    best-so-far at run end, not isolated to the run.
11. **Program segment error stats use a monotone error counter** (not array
    indices) so per-segment mean/SD stay correct if a Program exceeds the
    200-entry timing-error buffer. The prototype's index snapshots could
    mis-window in that case; persisting the numbers made it worth fixing.
12. **Space is claimed only while a session is running.** While idle, Space
    behaves natively (activates focused buttons, opens selects). The prototype
    swallowed Space unconditionally outside mouse-only input.
13. The mode tabs use **radio semantics** (`role="radiogroup"`/`radio` +
    `aria-checked`); chips are `role="button"` + `aria-pressed`, with the
    Program lock reported via `aria-disabled` and enforced on the keyboard
    path (native `disabled` on Start/Reset).
14. Stored history/settings are **validated on load**: shape-corrupt records
    are dropped (never crash the dashboard); settings clamp per-field to the
    slider ranges with enum checks, so removed features can't resurface via
    storage.

### 11.3 Hard Mode (added 2026-06-14)

**Hard Mode** is an invented divided-attention / killer-lookout drill — a new
`Mode` (`'hard'`) AND a 6th "Lookout" Program segment. It is additive; the base
game engine math/feel is unchanged.

- **Architecture.** Pure first-person camera (360° `yaw` + clamped up/down
  `pitch`) + killer state machine + catch math in `engine/hardMode.ts` (clock- and
  RNG-injected, fully unit-tested: `tests/hardMode.test.ts`); original color-graded
  2.5D Canvas panorama + generic killer in `render/scene.ts`; mode wiring, input
  (pointer-lock FPS mouse-look + edge-pan fallback + ◄►▲▼/WASD/Q-E keys + Space),
  and the killer↔progress penalty in `main.ts`. No new dependencies; the engine
  stays framework-free TS + Canvas.
- **Look controls.** Primary input is **pointer-lock FPS mouse-look**: clicking
  the scene captures/contains the cursor and raw mouse movement drives the view
  (`applyLook(dYaw, dPitch)`, deg/px = `HARD_LOOK_DEG_PER_PX × panSensitivity`);
  ESC frees it. Fallbacks: position-based **edge-pan** when the pointer isn't
  locked (touch / unsupported), and keyboard yaw (◄►/A-D/Q-E) + pitch (▲▼/W-S),
  velocity-applied in `tick`. Pitch is clamped to ±`pitchMaxDeg`; the render
  shifts the whole scene vertically by pitch.
- **Killer state machine.** `idle → approaching → caught | reached`. Caught =
  reticle on the killer in **both** axes — yaw within `catchConeDeg` AND pitch
  within `catchPitchTolDeg` of the (ground-standing) killer — held for ≥
  `catchDwellMs` (records reaction time); reached = the `approachMs` window elapses
  uncaught (counts as a miss + a `missPenaltyPct` gen-progress hit + a scare; the
  run continues).
- **Tunables** (APPROXIMATED — labeled in the UI footer + a Hard-Mode settings
  panel, persisted in `Settings`): approachMs (~3000), catchConeDeg (~15),
  catchDwellMs (~180, fixed), catchPitchTolDeg (~12, fixed), pitchMaxDeg (~38,
  fixed), fovDeg (~90, fixed), look sensitivity, invert-Y, encounter min/max gap
  (~8–20s), missPenaltyPct (~5), danger-cue on/off + intensity.
- **Divergences (documented):**
  - **Centered dial.** Hard Mode runs centered generator checks (Doctor
    off-centre suppressed), so the dial HUD overlays the scene at screen center.
  - **Input setting honored.** Hard Mode obeys the Input dropdown like every other
    mode (Space / Left click / Both). A stage left-click ALSO (re)captures the
    pointer for FPS look, so one click both looks and hits.
  - **In-sim Start + immersive chrome.** Start lives on an in-stage overlay box
    (shown when idle); clicking it runs the session and captures the mouse in one
    gesture (the external Start button is hidden when idle, serving as Stop while
    running). A bottom-right toggle gives **in-window fullscreen** (the stage goes
    `position:fixed; inset:0`; `sizeCanvas()` fills the viewport and `body` scroll is
    suppressed), a top-left indicator shows **Esc to exit**, and Esc releases the
    pointer + collapses fullscreen. The dial radius is clamped (≤112px), so the HUD
    stays sane at any size.
  - **Decorative color grade.** The scene's brighter overcast-autumn palette
    (slate-blue→warm-hazy sky gradient, diffuse overcast light, warm amber/umber
    ground, olive foliage + hazy treeline silhouettes, warm ember ground glow,
    light warm vignette, warm killer backlight) is atmosphere only — result meaning
    still rides `ResultPalette` and the killer reads by shape + bright outline, so
    it doesn't encode information by hue.
- **Analytics.** History schema bumped to **v2** with optional killer metrics
  (`killerEncounters`, `killerSpotted`, `killerSpottedRate`, `avgReactionMs` on
  `overall`; `killerEncounters`/`killerSpotted` on the Lookout `SegmentResult`).
  Additive + backward-compatible: v1 records lack the fields and still load. The
  dashboard adds a Killer-spotted-rate trend + a "Best spotted rate" personal best
  when Hard Mode runs exist.
- **Accessibility.** Reduced motion cuts the scare shake/flash and steps the
  approach; the killer reads by shape + bright outline (not red hue alone) and
  uses the colorblind-safe danger color; the ◄►▲▼ / A-D / W-S / Q-E keys keep it
  fully keyboard-operable (no pointer lock required). Base modes remain usable
  without a mouse.
- **Source of truth.** The port (`src/`) is now authoritative; the single-file
  `dbd-skillcheck-trainer.html` prototype is a frozen legacy reference and does
  **not** include Hard Mode (see CLAUDE.md).
