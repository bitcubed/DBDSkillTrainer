# DBD Skill-Check Trainer — Cowork Project Context

> Paste this into the Cowork project's instructions/context (or keep it as the
> root context file). It tells any Claude instance picking up this project what
> it is, what already exists, the decisions that are locked, and the source-of-truth
> game data so nothing has to be re-derived.

---

## 1. What this project is

A browser-based **practice tool for Dead by Daylight skill checks**. A DBD skill
check is a quick-time event: a pointer sweeps clockwise around a dial and you press
when it's inside a "success zone." Hitting the narrow leading **great** band gives
bonus progress; the wider **good** band is neutral; missing penalizes progress.

The tool's purpose is not just to mimic the game but to **train the underlying skill
efficiently**. A skill check is, in motor-learning terms, a *coincidence-anticipation
timing* (CAT) task — the same thing labs measure with a Bassin timer. The whole design
is built around what the research says actually improves that skill (see §4).

Owner: Jonah (plays DBD; wants an accurate, research-grounded trainer he can drill with).

---

## 2. Current state (what already exists)

**Update 2026-06-11 — ALL spec §11 stages (1–9) complete.** The port lives in
`dbd-skillcheck-trainer/` (Vite + strict TypeScript + Vitest; engine is
framework-free TS + Canvas). Stages 1–5: typed engine modules, synthesized
audio, dial/BG-noise/tape renderers, full UI wiring, and the 5-minute
Program — engine math verified line-by-line against the prototype by a
5-agent parity audit. Stages 6–9: **persistent session history** (every
free-play run ≥10 checks + every Program, `localStorage`, schema-versioned,
capped at 500), **settings persistence**, the **progression dashboard**
(great-rate / ±SD / bias trends across sessions, program-segment trends,
personal bests, day streak, computed trend readout — the §6 roadmap goal),
the **accessibility pass** (reduced motion incl. manual override,
colorblind-safe palette with shape-encoded tape ticks, full keyboard
operability, ARIA), and **CI + GitHub Pages deploy**
(`.github/workflows/ci.yml`). 118 unit tests passing; typecheck/lint clean;
`vite build` emits a static `dist/`. A second 5-agent audit reviewed the new
stages; all confirmed findings fixed. Deliberate divergences are documented
in spec §11.1–11.2 and `dbd-skillcheck-trainer/CHANGELOG.md`. Remaining to
ship publicly: `git init` + push to a GitHub repo with Pages enabled (CI does
the rest).

A **working single-file HTML/Canvas/JS prototype** exists:
`dbd-skillcheck-trainer.html` (vanilla JS, no dependencies, no build step, no
external assets). It runs by opening in a browser. It is the **reference
implementation** — the source of truth for behavior, math, and feel, and is
kept at the repo root alongside the port.

What the prototype currently does:

- **Modes:** Generator, Doctor (Madness — off-centre / reversed / both, equal odds),
  and Special (Decisive Strike, Overcharge I–III, Oppression, Brand New Part, Snap Out
  of It).
- **Pacing:** Drill (back-to-back checks) and Realistic (per-second trigger rolls at
  real game odds).
- **Perks as toggles:** Hyperfocus, Stake Out, Unnerving Presence (I/II/III),
  Lullaby (0–5), Toolbox, and Merciless Storm (continuous-check overlay, unlimited
  timing).
- **Background noise toggle:** drifting dust / embers / sweeping blobs behind the dial,
  to practice reading checks against a moving field.
- **Sliders:** pointer speed, zone size, warning-gong lead time, volume.
- **Input options:** Space, left-click anywhere, or both.
- **Timing tape:** plots every press as a signed-ms tick against a to-scale great/good
  band, with a live avg ± SD readout. This is the core feedback instrument (constant
  error = your average offset; variable error = your spread).
- **Synthesized audio:** metallic gong (warning), bright ding (great), dull confirm
  (good), explosion stinger (fail). Synthesized, **not** the game's audio (see §5).
- **5-minute guided Program** (the ▶ button): auto-runs a timed 5-segment routine
  (Warm-up → Overload → Varied → Bias-fix → Pressure), with an on-screen HUD and an
  end-of-run per-segment breakdown (great-rate + timing bias ± SD per segment, plus a
  coaching note).
- **Sidebar guide:** explains the research and the regimen.

---

## 3. Source-of-truth game data (verified)

These were verified against the official wiki (deadbydaylight.wiki.gg "Skill Checks")
during the build. **Re-verified 2026-06-10** — all values below confirmed unchanged; one
correction found: Snap Out of It's fail cool-down is **2 s** (all other checks use the
generic 3 s pause). **1% of the dial = 3.6°.** Zone sizes below are % of dial
circumference. `rot` = seconds for one full pointer rotation. Pointer starts at 12
o'clock and moves clockwise (Madness can reverse). Success-zone start spawns no earlier
than 4 o'clock (120°) — except Decisive Strike, earliest 8 o'clock (240°) — and no later
than 11 o'clock (330°).

| Check | Great | Good | rot (s) | Great bonus | Fail | Trigger/s | Notes |
|---|---|---|---|---|---|---|---|
| Generator | 3% (10.8°) | 13% (46.8°) | 1.1 | +1% | −10% | 8% (40% w/ toolbox) | Most common |
| Decisive Strike | 7% (25.2°) | — | 1.1 | — | none | always | Great-only; earliest 8 o'clock |
| Overcharge I | 7% | — | 1.2 | — | −13% | always | Great-only |
| Overcharge II | 6% | — | 1.1 | — | −14% | always | Great-only |
| Overcharge III | 5% | — | 1.0 | — | −15% | always | Great-only |
| Oppression | 5% | — | 1.0 | — | −10% | always | Great-only |
| Brand New Part | 7% | — | 1.1 | — | −10% | always | Great-only |
| Snap Out of It | 12% | — | 1.2 | — | −25% | 80% | Doctor; great-only; 2 s fail pause |

Other verified facts:
- Generator = **90 charges**, 1 charge/sec solo repair. The great window on a gen check
  works out to **~33 ms**.
- Failed check = **−10% progress + ~3 s interaction pause** (Snap Out of It: **2 s**).
- **Hyperfocus:** +1 token per great while repairing/healing (max 6). Each token gives
  **+4% trigger odds AND +4% pointer speed**, and **+30% great-bonus per token** at max
  tier (great bonus × (1 + 0.30 × tokens *held before this great*)). Tokens reset on a
  good/fail. The **first** check of an action gets no bonus.
- **Unnerving Presence:** +10% trigger odds; shrinks the **good zone only** by
  **40/50/60%** (I/II/III). Great zone unaffected. No longer affects DS.
- **Stake Out:** a good is consumed into a great (+1% bonus); greats consume nothing.
  +1 token / 15 s in the terror radius (max 4). Stake-Out-converted greats **do** feed
  Hyperfocus.
- **Merciless Storm:** triggers at 90% gen progress, then chains checks continuously.
  (In the actual game, a fail blocks the gen 16/18/20 s — see §5 for how the trainer
  deviates.)
- **Madness (Doctor):** equal-chance roll among off-centre / reversed (CCW) / both.

---

## 4. Design principles (the research, applied)

These are not decoration — they shaped the feature set and the Program. A skill check is
a CAT task, and the motor-learning literature on CAT, contextual interference, and
practice distribution maps directly onto it:

1. **Contextual interference.** Varied/random practice (changing speed, zone, task type)
   loses to blocked repetition *during* a session but wins decisively on retention and
   transfer. → The Program's "Varied" segment rotates task type; the sliders and BG-noise
   toggle exist to vary conditions.
2. **Distributed > massed.** Short, spaced sessions beat one long grind. → The Program is
   5 minutes and meant to be run 3–4×/week, with progress tracked *across* sessions.
3. **Overload then calibrate.** Briefly training harder than real makes the real thing
   feel slow. → The "Overload" segment (1.4× speed, 0.7× zone).
4. **Feedback specificity — constant vs. variable error.** CAT research separates a
   *systematic* timing offset (fixable: just shift earlier/later) from *inconsistency*
   (only reduced by reps). → The timing tape and the Program breakdown report both
   (avg = constant error; ±SD = variable error).
5. **Anticipate, don't react.** A ~33 ms great window is tighter than human reaction time
   (~200 ms+); you must pre-plan the press from the zone's position and use the gong as a
   rhythm cue, not see-then-decide. → The warning-lead slider lets you wean off the audio.

---

## 5. Locked decisions / constraints

- **No copyrighted assets, ever.** No DBD audio files, sprites, fonts, or art. All
  sounds are synthesized to *resemble* the character of the real ones; all visuals are
  original. This is non-negotiable and must carry into the full project.
- **The trainer deliberately deviates from the game in a few places, and labels them:**
  - Merciless Storm runs **unlimited** here — a miss costs progress but never blocks the
    gen or ends the run, so you can drill the continuous cadence indefinitely.
  - **Warning-gong lead time** is a slider (default 500 ms); the game's exact value is
    unpublished.
  - **Lullaby per-token scaling** is a linear approximation (real per-token values
    unpublished).
  - **Browser input latency ≠ in-game input pipeline.** The tool builds the read,
    rhythm, and timing-bias awareness; exact timing should be calibrated in a DBD custom
    match. This caveat must stay visible in the UI.
- **Healing and Wiggle were intentionally removed.** Don't re-add them without a reason.
- Game numbers change with patches. The constants in §3 were correct as of the build; if
  work resumes much later, re-verify against the wiki before trusting them.

---

## 6. Roadmap — what's next

Ship the prototype's behavior into a **real, maintainable, testable project** with the
one capability the in-chat prototype can't have: **persistent cross-session progress
tracking and an analytics dashboard.** That's the single most valuable addition, because
§4.2 and §4.4 say improvement is a *between-session* trend (great-rate climbing, ±SD
shrinking) — and the prototype forgets everything on reload.

The detailed engineering spec for this lives in **`CLAUDE_CODE_PROJECT_SPEC.md`**, which
should be handed to Claude Code along with the prototype file as the reference
implementation.

---

## 7. How to work in this project (for Claude in Cowork)

Your role here is the knowledge-work / project-management layer around the build:

- **Maintain this context file and the spec** as decisions evolve. When something is
  decided, record it in §5 and update the spec.
- **Keep the verified-data table (§3) authoritative.** If a number is ever changed,
  note the source and date.
- **Coordinate with Claude Code:** the spec is the contract. If Claude Code proposes a
  change to scope or architecture, reconcile it here first so the two documents never
  drift.
- **Track open questions and a decision log** (add a §8 if useful) rather than letting
  choices live only in chat history.
- **Don't silently re-add removed features** (Healing/Wiggle) or weaken the
  no-copyrighted-assets rule.
- When asked to summarize progress or hand off, lean on §2 (current state) and §6
  (roadmap) so a fresh session can get oriented fast.
