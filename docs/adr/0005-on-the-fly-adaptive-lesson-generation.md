# On-the-fly adaptive lesson generation, grounded in the Learner Model

## Status

accepted

## Context

Issue #14 (originally "20 authored lessons") was reframed in #20 as on-the-fly
lesson plan generation. A pre-generated, static content library would rebuild
the one-curriculum-fits-all model that adaptive learning exists to escape, and
would throw away the per-child investment in the Learner Model (#9/#10/#16:
`skillStates`, `patternSignals`) and the lesson-generation pipeline (#7:
`plans.generate` → `insertDraft` → `validatePlan` → `approve` → `approvedForSkill`).
We had to decide how a fresh, validated, adaptive plan is produced per child per
session **without** a child ever waiting or running an unvalidated plan, and
without re-authoring a static curriculum.

## Decisions

1. **Generate on the fly; no static library.** The #7 pipeline is reused
   unchanged. The single existing seed plan (`arraysIntroPlan`) is recast as the
   first of five Strand Anchors. There is no "20 authored lessons" content
   surface to maintain.

2. **Strand Selector — a pure, deterministic ranked list.** A new pure function
   `selectStrand(learnerModel, recentMasteryResults) → ranked candidate skills`,
   co-located with the #10 reducer logic, with explicit priorities (highest
   first): consolidation of a just-passed mastery, then the weakest active skill,
   with stuck skills deprioritised. It emits a **ranked list** so the pre-warm
   cache can hold the top 1–2 candidates and cover both "continue" and "switch"
   redirection paths. It never picks content — ADR-0001 holds: the validated plan
   is the guardrail, the selector only chooses the target.

3. **Selector thresholds are named, single-source constants** co-located with
   the `DECAY_*` constants: `STUCK_THRESHOLD_UNRESOLVED` (3),
   `ACTIVE_WINDOW_DAYS` (14), `CONSOLIDATION_LESSONS` (1). The just-passed
   recency check reuses the pure `decaySince`/`decay` clock (ADR-0002) rather
   than a parallel staleness check — staleness uses one mental model. These
   priors are expected to be revised after pilot feedback (recorded in code,
   not an ADR).

4. **Pre-warm at session-end, not session-start.** The next plan is generated in
   the background when a lesson or diagnostic session ends — when the Learner
   Model is freshest. Session-start reads the queued, validated plan and starts
   instantly into a Realtime tutor. No synchronous generation on the eager path.
   For the first-ever lesson, the diagnostic session-end is the hook that
   triggers the first pre-warm from the diagnostic's skill estimates.

5. **Strand Anchors are permanent, mandatory infrastructure — not sample
   content.** One hand-authored, always-validated gold plan per maths strand
   (number sense, multiplication & division, fractions, word problems,
   explaining an answer). They are the fail-safe floor (fallback when a generated
   plan fails `validatePlan`) and the known-good first lesson in a new strand.
   They are **not** retired when generation matures. Anchors are validated at
   deploy time (`seedAnchors`), never at fallback time, so the fail-safe is
   guaranteed valid.

6. **Fallback never blocks.** When a generated plan fails `validatePlan` after
   retry, the queued plan for that strand is the Strand Anchor. The child's
   session-start always resolves instantly to a validated plan. Generation
   attempts and failures are logged as `prewarm_outcome` session events so #15's
   pilot dashboard can report the fallback rate (no bespoke counter; the event
   log is the correct home).

7. **Parent input is deferred.** Structured parent input is an AI-conducted
   onboarding interview (the realisation of #2's intent), shipping as a separate
   future issue. Until then the Strand Selector works algorithmically from the
   Learner Model alone. When the interview ships, its Focus Strand overrides
   **only** the selector's #1 candidate; the ranked list and priorities stay
   stable.

8. **No labels, honour frustration behaviourally.** The generator's prompt
   enforces the no-labels/no-diagnoses discipline and anchors are authored
   label-free. The selector's stuck-rescue deprioritisation honours frustration
   behaviourally (it stops piling on a failing skill) without ever labelling the
   child.

## Consequences

- Adds a `queuedPlans` table (one row per child per strand, holding the
  pre-warmed plan id + source rank) and a Strand Selector module
  (`lesson/strandSelector.ts`) with the threshold constants.
- Adds five Strand Anchors (`lesson/anchorPlans.ts`) seeded approved via
  `prewarm.seedAnchors`; the existing `seedArrays` (#7) is subsumed as the
  multiplication & division anchor.
- Session-end (`sessions.end`) and diagnostic-end (`diagnostics.recordAttempt`)
  schedule the pre-warm action (`internal.prewarm.prewarm`) in the background.
- `engine.startQueued` resolves the queued plan (or anchor fallback) at
  session-start with no synchronous generation; the legacy `engine.start` (by
  skill tag) remains for explicit/diagnostic paths.
- Generation quality is verified at integration (reusing #7's verified
  generator), not unit-tested; the Strand Selector and the pre-warm/fallback
  policy are the unit-tested seams.
- See `docs/adr/0001-llm-driven-lessons-with-tool-gated-rules.md` (the validated
  plan is the guardrail), `docs/adr/0002-learner-model-aggregate.md` (the reducer
  the pre-warm reads from), and the glossary terms Strand Selector, Pre-warm,
  Strand Anchor in `CONTEXT.md`.
