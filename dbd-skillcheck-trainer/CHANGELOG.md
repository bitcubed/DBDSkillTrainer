# Changelog

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
