# Changelog

## 0.2.5 — 2026-06-14 — Longer needle, idle dial preview, faster BG noise

### Changed
- **Needle reaches further past the ring.** The red "blood streak" now extends
  ~16px past the dial ring (was ~7), so it reads as a proper needle poking past
  the circle.
- **Idle dial preview.** When the trainer is stopped, a dimmed ring + center cue
  is shown so the **Dial size** slider's effect is visible before you start.
  During a run the dial still stays blank between checks (mirrors DBD).
- **Background noise is faster and more game-like.** The "BG Noise" field is now
  a denser, fast-drifting, flickering scatter with streaking warm sparks/embers
  (over the slow atmospheric blobs) — closer to reading a check against the
  in-game environment. Still toggled by the **BG Noise** chip and frozen to a
  static field under `prefers-reduced-motion`.

## 0.2.4 — 2026-06-14 — Smoother animation, tighter input timing, roomier layout

### Changed
- **Presses judged at the event's own timestamp.** Space/click now use
  `event.timeStamp` (when the key/button actually fired) instead of a
  `performance.now()` read inside the handler — removes dispatch jitter from the
  hit, which matters against the ~33 ms great window.
- **Render on the RAF presentation timestamp.** The frame loop uses the timestamp
  `requestAnimationFrame` passes in (one consistent clock per frame, aligned to
  when the frame is shown) rather than a fresh `performance.now()`.
- **Cheaper needle render.** The needle's trail ghosts draw without a drop shadow
  (`shadowBlur` is the costly per-frame op); only the live needle keeps its glow.
  Cuts per-frame stutter on lower-end GPUs; the live needle is unchanged.
- **Roomier layout.** Wider page (max-width 1200 → 1320 px), more vertical spacing
  between sections, larger slider/stat grids, and the trainer/guide split now
  stacks to a full-width single column at ≤1040 px (was 920) so it isn't cramped.

### Note
- The **dial-size slider** (0.5–1.3×, cosmetic — never affects timing/zones) was
  already present as of 0.2.3; verified it scales the dial as expected.

## 0.2.3 — 2026-06-14 — Real cue audio + 1:1 dial + check-only visibility

### Changed
- **Embedded the owner's recorded cues.** `warn`/`good`/`great` now play the
  bundled mp3 files (`src/assets/`, imported through Vite; HTMLAudioElement in the
  prototype) instead of synthesis - after two synthesis passes the owner opted for
  an exact match. `fail` stays synthesized. This relaxes the synth-only rule in
  context §5; the public build now ships game-derived audio (owner-accepted
  copyright caveat).
- **Dial slimmed to 1:1.** Thinner track ring, thinner success-zone band and
  shorter edge ticks, and a thinner tapered needle - matched to a zoomed in-game
  screenshot (it was reading too thick/large).
- **Dial shows only during a check.** The ring/zone/needle render only while a
  check is active and for ~100 ms after it resolves, then the canvas clears -
  mirroring DBD, where the skill-check circle is not on screen between checks.

## 0.2.2 — 2026-06-14 — Closer audio match + "blood streak" needle

### Changed
- **Cues re-fitted by spectrum, not by ear** (`audio/synth.ts`, prototype): each
  recording was STFT-analyzed for its per-band energy over the first 300 ms. The
  cues are now additive sine partials plus a short band-limited noise burst (the
  dense ~65-80% broadband attack the earlier pure-tone version missed). `good`
  and `great` are much brighter - their energy sits in 1.6-6 kHz, not the low
  body - matching the recordings. Per-band L1 error vs the recordings dropped
  ~249 -> ~35 points (`good` alone 154 -> 10). Synthesis only; no samples (§5).
- **Needle is now a tapered "blood streak"** (`render/dial.ts`, prototype): a
  double-pointed shape that tapers to a point and fades to transparent at both
  ends, fullest and opaque in the middle, with a soft red smear. Replaces the
  plain line + light tip marker; same thickness; honors reduced-motion.

## 0.2.1 — 2026-06-14 — Audio + dial tuned to real references

### Changed
- **Synthesized cues retuned** (`audio/synth.ts`, prototype `metalPartial`
  recipes): the owner supplied three real skill-check recordings (check-appears
  / good / great). Per context §5 they were used as *references only* — no
  samples are embedded or shipped. Each cue's partials, attack, and decay were
  re-derived from the recordings' measured spectra: `warn` is now a ~1.1 kHz
  metallic bell with inharmonic partials and a soft swell; `great` a ~2 kHz
  "shing" over a 1.1 kHz body with high shimmer and a longer ring; `good` a
  darker, shorter ~520 Hz confirm, kept clearly distinct from `great`.
- **Dial center input cue** (`render/dial.ts`, prototype `draw`): the center now
  draws the in-game keybind prompt — a "Space" key chip, switching to a mouse
  glyph with the left button lit when the input mode is click-only (`both` shows
  Space). Added a light needle-tip marker. All original Canvas, matched to a
  mid-check screenshot; no assets used. `inputMode` is now threaded into
  `DialState` from `main.ts`.

## 0.2.0 — 2026-06-11 — History, dashboard, accessibility, CI (spec §11 stages 6–9)

### Added
- **Persistent session history** (`analytics/history.ts`, `analytics/runLog.ts`):
  every run logged to `localStorage` (`dbdtrainer.history.v1`, schema-versioned,
  capped at 500 records, oldest pruned). Free-play runs log on Stop with ≥10
  checks; Programs log on completion with per-segment results; a `pagehide`
  flush catches tab closes mid-run. Shape-corrupt records are dropped on load.
- **Settings persistence** (`settings.ts`): input mode, pacing, volume, sliders,
  BG noise, last mode/special, reduced-motion and colorblind-safe toggles —
  validated and clamped per-field on load (`dbdtrainer.settings.v1`).
- **Progression dashboard** (`ui/dashboard.ts`, `analytics/charts.ts`,
  `analytics/insights.ts`): hand-rolled canvas line charts for great-rate, ±SD
  (variable error), and avg bias (constant error) across sessions, with an
  all/program/freeplay filter; per-segment Program trends; personal bests
  (best rate, lowest ±SD, longest streak, programs done, sessions, day streak);
  and a strictly-computed trend readout.
- **Accessibility pass**: reduced motion respected from both the OS preference
  and a manual toggle (shake, BG-noise field frozen static, needle trail,
  result pulse, smooth scrolls); colorblind-safe palette (fail red → blue) with
  shape-encoded tape ticks (great = tall, good = short, miss = short + square
  foot) so results never rely on hue alone; keyboard operability everywhere
  (Enter activates tabs/chips; Space stays reserved for the press while
  running); radio semantics on the mode tabs, `aria-pressed`/`aria-disabled`
  on chips, native `disabled` on Start/Reset during the Program lock.
- **CI + deploy** (`../.github/workflows/ci.yml`): typecheck + lint + tests +
  build on every push/PR; GitHub Pages deploy of `dist/` from main. README
  with run/verify/deploy instructions.
- 43 new tests (118 total): history append/prune/corrupt (incl. shape-corrupt
  records), settings round-trip/clamps/boundaries, insights PBs/day-streak
  (month/year/DST windows)/readout claims, `errsSince` cap windowing, and
  headless RunLogger coverage (free-play ≥10 logged, 9 not, consecutive-run
  windowing, full Program logs 5 segments).

### Fixed (found by the stage-6–8 adversarial audit)
- Shape-corrupt history records could crash the dashboard on open.
- `dayStreak` mis-bucketed days across DST transitions in UTC+12/+13 timezones.
- The Program lock was keyboard-bypassable on the Start button.
- Program end/cancel left live state (speed/zone/warn/mode/BG noise)
  contradicting persisted settings — now restored from settings.
- Program segment error stats could mis-window past the 200-entry errs cap —
  now tracked with a monotone counter.
- Perk chips could stay visually "on" (and report `aria-pressed=true`) after
  the Program forced perks off — chip state now derives from the session.
- Trend readout deltas now come from rounded endpoints (no "up 1 pts
  (50% → 50%)" contradictions) and describe the same filtered records the
  charts show.

## 0.1.0 — 2026-06-10 — Prototype parity (spec §11 stages 1–5)

Port of `dbd-skillcheck-trainer.html` (the single-file reference prototype) into a
typed, tested, statically-deployable Vite + TypeScript project. Behavior, math, and
feel ported verbatim; engine is framework-free TS + Canvas.

### Added
- **Scaffold:** Vite 6 + TypeScript (strict, `noUncheckedIndexedAccess`) + Vitest 3
  + ESLint/Prettier. `npm run build` emits a static `dist/`.
- **Engine** (`src/engine/`): `constants.ts` (spec §6 verbatim, incl. the
  `APPROXIMATIONS` block), `types.ts`, `geometry.ts` (zones, rotation, classify,
  errMs), `skillCheck.ts` (spawn + Madness rolls, injectable RNG), `session.ts`
  (idle→between→warn→active→cooldown state machine, pacing, perk token state, gen
  charge, resolution), `perks.ts` (Hyperfocus / Stake Out / Unnerving / Lullaby /
  Toolbox / Storm modifiers), `program.ts` (5-segment 300s Program + per-segment
  stats, single-finalize).
- **Audio** (`src/audio/synth.ts`): synthesized gong / great ding / good confirm /
  fail stinger — ported WebAudio synthesis, not game audio.
- **Render** (`src/render/`): dial, animated BG-noise field, timing tape.
- **UI** (`src/ui/`): controls wiring, Program HUD, end-of-Program results +
  coaching, guide sidebar, verified-vs-approximated footer.
- **Tests:** 75 Vitest cases across geometry / stats / spawn / session / perks /
  program, incl. the double-finalize regression (a full fake-clock Program run
  records exactly 5 segment results).

### Changed vs. prototype (intentional, documented)
- Snap Out of It fail pause is **2s** in realistic pacing (`SNAP_FAIL_PAUSE_MS`),
  per the 2026-06-10 wiki re-verification; the prototype used the generic 3s.
- Dropped the prototype's unused `bpGreat` field from the TYPES table.
- The prototype's inline pacing literals (storm 120ms lead, drill 900ms fail pause,
  250ms storm gap, 500–1400ms drill gap, 700/600/350/300ms delays) are now named
  constants in `constants.ts` — values unchanged.
- Cosmetic-only dial additions toward the in-game look (geometry untouched):
  darkened backdrop disc behind an active check, crisp radial edge ticks bracketing
  the zones, a short fading needle trail, and a brief result pulse on resolve.
- Dev-only `window.__trainer` debug handle (stripped from production builds).
- Keyboard accessibility groundwork (ahead of the spec §8.4 pass): tabs/chips are
  focusable and Enter-activatable (Space stays reserved for the skill-check press),
  selects/sliders have aria-labels. Chip activation is guarded against the Program
  lock and the disabled state (the pointer-events-only lock of the prototype
  doesn't cover keyboards) — caught by the post-port parity audit.
- `prefers-reduced-motion` freezes the BG-noise field to a static scatter (the
  spec §8.4 behavior, built early); the prototype only disabled the fail shake.
- During the Varied Program segment, the speed-slider readout reflects the actual
  rotation speed (e.g. 1.05× on Overcharge II); the prototype left it at 1.00×.

### Not yet built (post-parity roadmap, spec §8)
- Persistent session history, progression dashboard, settings persistence,
  accessibility pass (reduced-motion BG-freeze groundwork is in), CI + deploy.
