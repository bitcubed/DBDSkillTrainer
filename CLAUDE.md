# DBD Skill-Check Trainer

Read in this order before doing anything:

1. `COWORK_PROJECT_CONTEXT.md` — what this project is, locked decisions, and the verified game-data table (§3 is authoritative; last re-verified against deadbydaylight.wiki.gg on 2026-06-10).
2. `CLAUDE_CODE_PROJECT_SPEC.md` — the build contract: architecture, constants, program design, tests, acceptance criteria.
3. `dbd-skillcheck-trainer.html` — the working single-file prototype and behavioral reference. Port its math and feel verbatim; don't reinvent or "improve" the numbers.

Hard constraints (full list in context doc §5):

- No copyrighted DBD assets, ever — audio stays synthesized, visuals stay original.
- Approximated values stay labeled in the UI (warning lead, Lullaby scaling, unlimited storm, browser-latency caveat).
- Don't re-add Healing or Wiggle.
- Static deploy; the engine stays framework-free TypeScript + Canvas.

Scaffold the app into a `dbd-skillcheck-trainer/` subfolder per spec §3, leaving these docs at the root. If scope or architecture changes during the build, update the spec and context doc so they never drift from the code.
