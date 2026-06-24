# LLM-driven lessons via OpenAI Realtime, constrained by deterministic tool-gated rules

## Status

accepted

## Context

The lesson engine (#7) could be fully deterministic (human-authored scripts +
validators) or LLM-driven. We chose **LLM-driven**: the model both generates
Lesson Plans and runs the live tutoring conversation. The risk with LLM-driven
tutoring is bad pedagogy, unsafe content, and the model "teaching" outside the
lesson. We need the flexibility and scalability of generation without giving up
control over structure, correctness, and safety.

## Decision

- **The LLM proposes; the system disposes.** The model never directly mutates
  lesson state or declares correctness.
- **Live tutoring runs on the OpenAI Realtime model** (speech-to-speech +
  function-calling). It is the only voice path — there is no Web Speech fallback.
- **Plan generation and other text LLM work use GPT-5.5.** Plans are validated
  against a schema/rulebook, persisted in Convex, and reused via a
  `draft → approved → live` gate (human review = #13). Sessions only run
  `approved` plans.
- **Guardrails bite on state and data, not on intercepting speech.** Every state
  change is a tool call handled by a Convex mutation that validates against the
  rules and returns authoritative data:
  - `request_hint` returns the next Hint Ladder step from the plan (enforces
    ladder order + no early answer-reveal),
  - `advance_phase` is rejected unless the current task is resolved,
  - the **Verdict** for an attempt is computed by deterministic validators
    (workspace inspectors, `parseNumber`); the model reacts but cannot override it.
- **Tutor Move protocol is Realtime-forward-compatible function-calling**, so the
  same engine works under Realtime now and could be driven by a text model.

## Consequences

- We cannot hard-reject an individual spoken sentence, but the high-stakes
  invariants (phase order, correctness, answer-reveal) are all behind tools and
  data we control server-side in Convex.
- Carries OpenAI Realtime lock-in for the voice path; mitigated by keeping the
  engine and Tutor Move contract provider-agnostic.
- `explanation` answers are captured as evidence, not deterministically graded.
