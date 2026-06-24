// #22 — the Parent Interview trust-bearing layer: a pure validator for the
// `submit_interview_result` tool call. The model proposes; the system disposes
// (ADR-0001). On pass the row is upserted; on failure the interviewer is told
// what to fix and the conversation continues — the model never writes a row the
// validator rejects. Tested at Seam 1 (interview.test.ts); conduct is verified
// at integration by inspecting the persisted result.

import { SKILL_STRANDS, isSkillStrand, type SkillStrand } from './vocab';
import { guardrailed } from './guardrail';

// The five free-text context fields retained from the placeholder form (#2),
// repurposed as the structured outputs the conversation elicits and stores.
export const INTERVIEW_FIELDS = [
  'findsEasy',
  'avoids',
  'whenStuck',
  'triedBefore',
  'wantToUnderstand'
] as const;
export type InterviewField = (typeof INTERVIEW_FIELDS)[number];

export type InterviewResult = {
  /** null means "the selector decides" — a valid, graceful outcome. */
  focusStrand: SkillStrand | null;
  findsEasy: string;
  avoids: string;
  whenStuck: string;
  triedBefore: string;
  wantToUnderstand: string;
};

export type ValidationResult =
  | { ok: true; value: InterviewResult }
  | { ok: false; feedback: string };

const FIELD_HINTS: Record<InterviewField, string> = {
  findsEasy: 'what your child finds easy',
  avoids: 'what they tend to avoid',
  whenStuck: 'what happens when they get stuck',
  triedBefore: 'what you have already tried',
  wantToUnderstand: 'what you most want to understand'
};

/**
 * Validate an interviewer-proposed interview result.
 *
 * Rules (all server-enforced, the model cannot bypass them):
 *  - focusStrand ∈ SKILL_STRANDS, OR null (selector decides).
 *  - the five free-text fields pass the no-labels guardrail.
 *
 * Free-text fields are optional in spirit (a parent may say little), so empty
 * strings pass. Only banned-label/diagnosis content is rejected — the model is
 * told to rephrase without labels and try again.
 */
export function validateInterviewResult(input: {
  focusStrand?: string | null;
  findsEasy?: string;
  avoids?: string;
  whenStuck?: string;
  triedBefore?: string;
  wantToUnderstand?: string;
}): ValidationResult {
  // Coerce missing fields to '' so a partial proposal is still checkable; the
  // conversation is participation-based, so blanks are legitimate.
  const findsEasy = input.findsEasy ?? '';
  const avoids = input.avoids ?? '';
  const whenStuck = input.whenStuck ?? '';
  const triedBefore = input.triedBefore ?? '';
  const wantToUnderstand = input.wantToUnderstand ?? '';

  // focusStrand: must be a known strand, or explicitly null/absent.
  // A string that is *not* a strand is a hard reject — the model can't mint one.
  if (input.focusStrand != null && input.focusStrand !== '' && !isSkillStrand(input.focusStrand)) {
    return {
      ok: false,
      feedback: `The focus area "${input.focusStrand}" isn't one of the options. Use one of: ${SKILL_STRANDS.join(
        ', '
      )}. If the parent has no preference, set focusStrand to null.`
    };
  }
  const focusStrand: SkillStrand | null =
    input.focusStrand && isSkillStrand(input.focusStrand) ? input.focusStrand : null;

  // Guardrail each free-text field. The first tripped field is named back to
  // the interviewer so it can rephrase without labels/diagnoses.
  for (const field of INTERVIEW_FIELDS) {
    const text = { findsEasy, avoids, whenStuck, triedBefore, wantToUnderstand }[field];
    if (text && guardrailed(text)) {
      return {
        ok: false,
        feedback: `Please rephrase "${FIELD_HINTS[field]}" without labels or diagnoses (for example avoid words like dyscalculic, gifted, or lazy). Describe the specific maths behaviour instead, then call submit_interview_result again.`
      };
    }
  }

  return {
    ok: true,
    value: { focusStrand, findsEasy, avoids, whenStuck, triedBefore, wantToUnderstand }
  };
}
