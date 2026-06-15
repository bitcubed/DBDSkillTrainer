# DBD Skill-Check Trainer

Read in this order before doing anything:

1. `COWORK_PROJECT_CONTEXT.md` — what this project is, locked decisions, and the verified game-data table (§3 is authoritative; last re-verified against deadbydaylight.wiki.gg on 2026-06-10).
2. `CLAUDE_CODE_PROJECT_SPEC.md` — the build contract: architecture, constants, program design, tests, acceptance criteria.
3. `dbd-skillcheck-trainer/src/` — **the source of truth** (Vite + strict TypeScript port). Build all features here.
4. `dbd-skillcheck-trainer.html` — the original single-file prototype, now a **frozen legacy reference** (last synced 2026-06-14, before Hard Mode). Good for the original math/feel, but it is **not** kept in sync with the port — don't assume parity for anything added after 2026-06-14, and don't port new features back into it unless the owner asks.

Hard constraints (full list in context doc §5):

- Audio: the `warn`/`good`/`great` cues are the owner's embedded recordings (rule relaxed 2026-06-14 — see context §5, incl. the accepted copyright caveat for the public deploy); the `fail` cue stays synthesized. Visuals stay original (Canvas-drawn; no sprites/screenshots/fonts — the Hard Mode killer is a generic, IP-safe original silhouette).
- Approximated values stay labeled in the UI (warning lead, Lullaby scaling, unlimited storm, browser-latency caveat, Hard Mode tunables).
- Don't re-add Healing or Wiggle.
- Static deploy; the engine stays framework-free TypeScript + Canvas (no new deps).

Scaffold the app into a `dbd-skillcheck-trainer/` subfolder per spec §3, leaving these docs at the root. If scope or architecture changes during the build, update the spec and context doc so they never drift from the code.
