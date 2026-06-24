# Learner model as a humble, decaying aggregate over session events

## Status

accepted

## Context

Issue #10 requires a persistent learner model that "captures working hypotheses
about skills, misconceptions, motivation, friction, and strengths without
turning them into fixed labels or diagnoses." #9 created a `skillStates` table
written directly by the diagnostic. We had to decide how the model is
structured, how it updates from lessons, how staleness is handled, and how
behavioral (pattern) signals are detected — all in a way that stays genuinely
humble.

## Decisions

1. **Aggregate, not primary store.** `sessionEvents` is the single append-only
   source of truth. `skillStates` and `patternSignals` are derived aggregates
   updated by pure functions, never an independent record of fact. The
   diagnostic's bespoke direct writes (#9) are removed so all evidence flows
   through one reducer. This lets parent corrections (#12) and review (#13)
   always point at the evidence trail.

2. **Incremental weighted blend, per-outcome.**
   `updateSkillState(prior, outcome) → SkillState` blends a prior score and an
   outcome score, weighted by outcome type — mastery first-try (2) > practice
   first-try (1) > hinted/retried (0.5) > diagnostic (0.5). Confidence grows
   slowly and is capped per data point so a single event never hardens a
   hypothesis into a fact. The no-prior (diagnostic) case is a degenerate of
   the same function.

3. **Confidence decays over time; level never silently downgrades.** A pure
   `decay(conf, daysSince)` shrinks confidence after a ~2-week grace window
   (≈0.85 at 14d, 0.7 at 28d, 0.5 at 56d, floor 0.25), computed lazily on read
   and persisted on the next write. Level labels are frozen until new evidence
   contradicts them — a child is never told they "forgot" something untested.

4. **Hybrid Pattern Signal detection.** Behavioral detectors
   (`persists_after_hint`, `rushes_when_confident`, `avoids_explaining`,
   `benefits_from_visuals`) are deterministic over the event log and stored at
   high confidence where they exist; the Realtime model may propose a pattern
   via a controlled-vocabulary `tag_pattern` tool, stored at lower confidence
   with `source:"model"`. Both share the same storage shape.

## Consequences

- Enriches lesson Session Events with `skillTag`, `phase`, `hintUsed`, and
  `answerType`; the reducer treats pre-#10 events (lacking these fields) as
  skipped — no historical migration is performed.
- Introduces a `patternSignals` table parallel to `skillStates`.
- Adds a Realtime tool (`tag_pattern`) alongside `tag_misconception`, with the
  same controlled-vocabulary discipline.
- The model is recomputable from the event log at any time, which is the
  property corrections and review rely on.
