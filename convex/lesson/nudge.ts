// #8 — adaptive hint & "are you sure?" nudge logic. Pure and testable: the model
// proposes the chat, but the *kind* of nudge is decided here so it is controllable
// and never nags. See ADR-0001 (engine owns pedagogical state and data).

import type { MisconceptionTag } from './vocab';
import type { VerdictStatus } from './grade';

export type NudgeKind =
  | 'praise' // correct — move on
  | 'are_you_sure' // close / skipped step — gentle probe, no answer leaked
  | 'encourage_retry' // confidently wrong — slow them down
  | 'give_hint' // serve the next ladder hint
  | 'work_together'; // frustrated/repeated failure — supportive, no "are you sure?"

export type NudgeDecision = {
  kind: NudgeKind;
  reason: string;
  /** Instruction the model follows when reacting to this turn. */
  coachInstruction: string;
  /** Ladder hint level to serve (1-based), if any. Absent = no hint served yet. */
  serveHintLevel?: number;
};

// A wrong attempt is "frustrated" once it has failed twice (repeated failure):
// then we suppress "are you sure?" and switch to warm, supportive coaching.
const FRUSTRATED_AT = 2;

export type AttemptNudgeInput = {
  verdict: VerdictStatus;
  misconception?: MisconceptionTag | null;
  attempts: number; // including the one just graded
  maxAttempts: number;
  hintLevel: number;
  submittedEmpty: boolean; // child checked without building/saying anything
};

/** Decide how to coach after a graded attempt. */
export function decideAttemptNudge(input: AttemptNudgeInput): NudgeDecision {
  const { verdict, attempts, maxAttempts, hintLevel, submittedEmpty } = input;
  const frustrated = attempts >= FRUSTRATED_AT;

  if (verdict === 'correct' || verdict === 'captured') {
    return {
      kind: 'praise',
      reason: 'correct',
      coachInstruction:
        'Praise the work briefly and specifically, then call advance_phase to move on.'
    };
  }

  if (frustrated || attempts >= maxAttempts) {
    return {
      kind: 'work_together',
      reason: 'repeated_failure',
      coachInstruction:
        "The child has struggled repeatedly and may be frustrated. Be warm and supportive — do NOT use 'are you sure?'. Call request_hint to get a worked step and read it gently together. Do NOT just state the final answer."
    };
  }

  // Not frustrated, attempt 1:
  if (verdict === 'partial') {
    return {
      kind: 'are_you_sure',
      reason: 'close_wrong',
      coachInstruction:
        "The child is very close. Use a gentle 'are you sure?' check — point at the small thing to fix without giving the answer. Do NOT reveal the answer."
    };
  }
  if (submittedEmpty) {
    return {
      kind: 'are_you_sure',
      reason: 'skipped_step',
      coachInstruction:
        "The child checked without building anything. Gently prompt them to start building before checking again. Do NOT reveal the answer."
    };
  }
  return {
    kind: 'encourage_retry',
    reason: 'overconfident_wrong',
    coachInstruction:
      "The child is confidently wrong. Slow them down with a calm prompt to re-check their rows — without revealing the answer."
  };
}

export type HelpNudgeInput = {
  attempts: number;
  maxAttempts: number;
  hintLevel: number; // ladder hints already served
  hintCount: number; // total hints on the ladder
};

/** Decide what to do when the child requests help. Offers a small nudge before
 *  escalating to a full hint (unless frustrated). */
export function decideHelpNudge(input: HelpNudgeInput): NudgeDecision {
  const { attempts, maxAttempts, hintLevel, hintCount } = input;
  const frustrated = attempts >= FRUSTRATED_AT;

  if (frustrated || attempts >= maxAttempts) {
    return {
      kind: 'work_together',
      reason: 'help_when_frustrated',
      serveHintLevel: hintCount, // deepest = worked step
      coachInstruction:
        "The child is frustrated and asking for help. Be supportive — do NOT use 'are you sure?'. Read the worked step together; do NOT just state the final answer."
    };
  }

  // Small nudge first: fresh task, no hint yet, no wrong attempts — probe before
  // giving a real hint.
  if (hintLevel === 0 && attempts === 0) {
    return {
      kind: 'are_you_sure',
      reason: 'small_nudge_first',
      coachInstruction:
        "Before giving a hint, offer a small nudge: invite the child to take one more careful look. Do NOT reveal the answer or the hint yet."
    };
  }

  // Escalate to the next ladder hint.
  const level = Math.min(hintLevel + 1, hintCount);
  return {
    kind: 'give_hint',
    reason: 'serve_next_hint',
    serveHintLevel: level,
    coachInstruction:
      'Read the provided hint warmly, in your own words if you like. Do NOT go beyond it or reveal the final answer.'
  };
}

// Was the attempt effectively empty? (used to detect a skipped step.)
export function isEmptyAttempt(attempt: {
  kind: string;
  rows?: number[];
  groups?: number[];
  value?: number | null;
  choice?: string;
  text?: string;
}): boolean {
  switch (attempt.kind) {
    case 'array':
      return (attempt.rows ?? []).reduce((a, b) => a + b, 0) === 0;
    case 'equal_groups':
      return (attempt.groups ?? []).reduce((a, b) => a + b, 0) === 0;
    case 'numeric':
      return attempt.value === null || attempt.value === undefined;
    case 'choice':
      return !attempt.choice;
    case 'explanation':
      return !attempt.text?.trim();
    default:
      return false;
  }
}
