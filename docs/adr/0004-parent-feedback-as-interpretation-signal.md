# Parent feedback as a low-weight interpretation signal

## Status

accepted — amends ADR-0002

## Context

Issue #12 lets parents correct and shape the weekly Digest (#11). The behavioural
/ learning-pattern layer will be wrong sometimes, and parent correction is the
trust mechanism. But ADR-0002 made the Learner Model an aggregate over
`sessionEvents` that is **recomputable from the event log**, and stated that
corrections "always point at the evidence trail" — they must not overwrite
structured evidence. The #12 issue text adds an apparent contradiction: feedback
is "used to improve future summaries **and learner-model confidence**." This ADR
resolves that contradiction without breaking recomputability, the humble-aggregate
property, or the PRD's no-labels promise. A reviewer/quality console (#13) was
originally coupled in; it is now a **temporary early-pilot concern** (tune, then
go review-free), so no permanent reviewer agent class is introduced.

## Decisions

1. **Feedback is a low-weight interpretation source, parallel to Session Events.**
   ADR-0002 decision #1 widened scope reads: the source of truth is the set of
   *structured interpretation events* — `sessionEvents` **plus** parent feedback
   (+ any short-lived early-pilot review actions). The Learner Model stays
   recomputable from this widened log via the same reducers. The original
   `sessionEvents` records are never mutated; feedback is a separate record.

2. **Feedback lives in its own table, not in `sessionEvents`.** Feedback records
   have no session/task context; cramming them into `sessionEvents` would stretch
   that term. A parallel `parentFeedback` table is read alongside the log by the
   reducers (model channel) and by Digest generation layer 1 (both channels).

3. **Two feedback channels.** Reactions are not uniform.
   - **Model channel** — truth-claims about accuracy: `sounds_right`,
     `doesnt_sound_right`. Requires an evidence target (a Pattern Signal, Skill
     State, or Shine candidate). Feeds the reducer as `source:'parent'`.
   - **Presentation channel** — preferences about *what is surfaced*:
     `useful`/`not_useful` (digest-level) and `want_less`/`want_more`
     (section/pattern-targeted). Never touches reducer confidence math; feeds
     Digest generation layer 1 only. A strong/repeated `want_less` on a pattern
     acts as a durable-but-decaying **suppression**.
   This split prevents a presentation preference ("less about fractions") from
   silently corrupting the model's accuracy.

4. **The parent pinch is source-scaled.** A model-channel disagreement's weight
   is scaled against the source of the target it corrects: strong against
   `model`-proposed patterns (effectively neutralizes a weak guess) and gentle
   against `deterministic` ones (barely dents observed data, so fresh evidence
   can re-raise it). The parent is authoritative over model guesses but only
   humbly disagreeing with data-derived signals. Implemented via the existing
   per-source weight/ceiling vocabulary.

5. **Channel-specific shelf life (decay asymmetry).**
   - **Model-channel feedback is all-time and does not decay.** A truth-claim
     about a child is durable; the parent should not fight the same correction
     weekly.
   - **Presentation-channel feedback decays** on the same schedule as skill
     confidence (the existing pure `decay()`, with a floor, lazy on read).
     Presentation prefs drift; a "less detail" from week 2 is not a permanent
     contract.

6. **Decaying suppressions trigger a visible re-consent, never a silent resurface.**
   When a presentation suppression of a pattern has decayed near floor *and* fresh
   evidence still triggers that pattern, the next Digest does not silently include
   it. Layer 1 marks the candidate `pendingReconsent`; layer 2 renders a gentle
   one-time question ("We're still seeing X — would you like to see it in future
   digests?"). Ignored prompts default back to suppressed. The model behind the
   scenes is unaffected — this is purely a surfacing/consent concern. This closes
   the "silent re-labelling" failure mode at exactly the seam it would otherwise
   leak through.

## Consequences

- Amends ADR-0002 decision #1: "one source of truth" is widened from
  `sessionEvents` to "structured interpretation events (session + parent feedback
  [+ transient early-pilot review])". Recomputability holds over the widened log.
- Adds `'parent'` to the per-source weight/ceiling vocabulary at a low cap; a
  single parent disagreement never zeroes a strong deterministic signal.
- Adds a `parentFeedback` table; the `digests` row from #11 is untouched (it
  already stores the audit trail: draft / guardrailedDraft / evidencePack /
  chosenCandidateId). No `visibleText` field is introduced — the reviewer-edit
  surface is deferred with #13.
- The review console (#13) is deferred, reviewer-free for #12. Any early-pilot
  review is the founder's eyes on CLI-generated output; the `status` field from
  #11 already provides the seam if a temporary gate is ever wanted.
- Keeps the PRD's no-labels promise honest: the model can keep a truthful pattern
  while the Digest never re-labels a child without fresh parent consent.
