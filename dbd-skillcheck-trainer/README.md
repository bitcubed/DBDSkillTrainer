# DBD Skill-Check Trainer

A browser-based practice tool for Dead by Daylight skill checks — a
research-grounded coincidence-anticipation timing trainer with persistent
cross-session progress tracking.

Built per `../CLAUDE_CODE_PROJECT_SPEC.md` from the single-file reference
prototype `../dbd-skillcheck-trainer.html`. Game data verified against
deadbydaylight.wiki.gg (see `../COWORK_PROJECT_CONTEXT.md` §3). The
`warn`/`good`/`great` cues are the owner's embedded recordings (`src/assets/`); the
`fail` cue is synthesized, and **all visuals are original** canvas drawing. The audio
relaxation and its copyright caveat for the public deploy are documented in context §5.

## Run

```sh
npm install
npm run dev       # dev server
npm run build     # typecheck + static build → dist/
npm run preview   # serve the built dist/
```

## Verify

```sh
npm run typecheck
npm run lint
npm test          # Vitest, headless engine tests
npm run coverage
```

## Deploy

`dist/` is fully static (relative base path), so it works on GitHub Pages,
Netlify, Cloudflare Pages, or any file host. CI lives at
`../.github/workflows/ci.yml`: every push runs typecheck + lint + tests +
build; pushes to `main` deploy `dist/` to GitHub Pages (enable Pages →
Source: GitHub Actions in the repo settings).

## Layout

- `src/engine/` — framework-free game logic (constants are the verified
  source of truth; approximations are labeled in `APPROXIMATIONS`).
- `src/audio/` — cue audio: embedded warn/good/great recordings + synthesized fail.
- `src/render/` — dial, background-noise field, timing tape, palettes.
- `src/analytics/` — stats math, persistent history, charts, insights.
- `src/ui/` — controls, Program HUD, results, dashboard, guide.
- `tests/` — headless Vitest suites for the engine, program, stats,
  history, settings, and insights.

Storage: `localStorage` keys `dbdtrainer.settings.v1` and
`dbdtrainer.history.v1` (schema-versioned, capped at 500 records).

## Disclaimer

Unofficial, non-commercial fan project — **not affiliated with Behaviour
Interactive**. *Dead by Daylight* and its skill-check sounds are © Behaviour
Interactive Inc.; the embedded cue recordings (`src/assets/*.mp3`) are used for
non-commercial practice only and remain their owner's property (the `fail` cue
is synthesized; all visuals are original). Rights holders may request removal
via this repo's issues. Full text: [DISCLAIMER.md](../DISCLAIMER.md).
