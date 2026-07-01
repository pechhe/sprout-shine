# Weekly digest: structured evidence → constrained LLM → deterministic guardrail

## Status

accepted

## Context

Issue #11 requires a weekly parent digest built from structured evidence, not
transcripts, that is useful and restrained: cautious language, no labels, no
diagnosis, an evidence footer. The same tension recurs across the piece — the
PRD wants warm narrative ("not just what they got wrong, why they got stuck")
but also hard safety guarantees ("must not use labels such as gifted/lazy/ADHD").
A pure-template digest is lifeless; a free LLM draft is unsafe; we need both
warmth and restraint, from structured evidence only.

## Decisions

1. **Three-layer digest.** Layer 1 is a deterministic, week-scoped
   **Evidence Pack** (improved/tricky skills from the Learner Model, learning
   patterns, candidate shine moments, home-suggestion inputs). Layer 2 is a
   constrained GPT-5.5 draft over that pack, JSON-output, schema-requiring the
   canonical five sections. Layer 3 is a deterministic **guardrail** pass. Same
   "LLM proposes; the system disposes" pattern as the lesson engine (ADR-0001).

2. **Shine Moment drawn only from the evidence-pack's candidates.** Layer 1
   surfaces a ranked list (≈3); the LLM picks one by narrative judgment and
   references its `candidateId`; the guardrail rejects any shine moment not
   traceable to a candidate. Empty candidates → a gentle fallback, never a
   fabricated one. This is the same controlled-vocabulary discipline as
   misconceptions: the model picks, it never mints.

3. **Deterministic guardrail, not an LLM-as-judge.** Layer 3 is pure: a
   concept-level banned-label scan (case-insensitive, whole-word/diagnostic-phrase
   — even "not gifted" trips a flag because labelling either way is forbidden),
   a cautious-phrase presence check per section, and a footer injected by the
   guardrail (never by the LLM). A flagged section is regenerated once, then
   falls back to the plan's deterministic `parentInsight` template — restraint
   wins over richness when the LLM drifts.

4. **Lifecycle carries a status, defaulting visible for the concierge pilot.**
   Digests are generated as `status:'visible'` (so a founder-led pilot shows
   them immediately, per the founder's "heavy week-1 involvement"). The same
   `status` field is the seam #13's review console + gate inherit — #13 flips
   the default to `'draft'` behind its toggle; no schema retrofit.

5. **Manual generation now, disabled cron stub.** A `generateForWeek` action
   runs from the CLI during the pilot. A Convex cron registration is wired but
   feature-flagged off; enabling it is a deliberate flip tied to #13's gate.
   Generation is idempotent and non-destructive to visible/already-shown digests.

6. **Evidence pack persisted on the digest row, generated once per week.** The
   prior-week comparison ("what improved") is a diff against the
   end-of-prior-week levels frozen in that week's evidence pack — no separate
   snapshot table, no invertible-replay over the event log. The pack is also
   #13's "evidence used" record and #12's correction anchor.

## Consequences

- Excludes raw audio and full transcripts by construction (consent defaults
  off); the digest is "from structured evidence" because layer 1 can't see them.
- Reading a digest is cheap (one row, embedded pack); only generation touches
  the Learner Model.
- Week 1 of the pilot: a founder generates digests by hand and iterates; no
  in-app feedback buttons yet (those are #12, lifecycle `#11 → #12 → #13`).
- The guardrail is unit-testable (banned/cautious checks like `checkGuardrails`
  and `validatePlan`), with the template fallback as the safety floor.
