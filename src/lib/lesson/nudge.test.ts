import { describe, it, expect } from 'vitest';
import {
  decideAttemptNudge,
  decideHelpNudge,
  isEmptyAttempt,
  type AttemptNudgeInput
} from '$convex/lesson/nudge';

const base: AttemptNudgeInput = {
  verdict: 'incorrect',
  misconception: null,
  attempts: 1,
  maxAttempts: 3,
  hintLevel: 0,
  submittedEmpty: false
};

describe('#8 decideAttemptNudge — scenarios', () => {
  it('1. correct answer -> praise', () => {
    const n = decideAttemptNudge({ ...base, verdict: 'correct' });
    expect(n.kind).toBe('praise');
    expect(n.reason).toBe('correct');
  });

  it('2. close wrong answer (partial, attempt 1) -> are_you_sure, no hint served', () => {
    const n = decideAttemptNudge({ ...base, verdict: 'partial', attempts: 1 });
    expect(n.kind).toBe('are_you_sure');
    expect(n.reason).toBe('close_wrong');
    expect(n.serveHintLevel).toBeUndefined();
  });

  it('3. overconfident wrong answer (incorrect, non-empty, attempt 1) -> encourage_retry', () => {
    const n = decideAttemptNudge({ ...base, verdict: 'incorrect', attempts: 1, submittedEmpty: false });
    expect(n.kind).toBe('encourage_retry');
    expect(n.reason).toBe('overconfident_wrong');
  });

  it("3b. skipped step (incorrect + empty, attempt 1) -> are_you_sure (skipped), not encourage_retry", () => {
    const n = decideAttemptNudge({ ...base, verdict: 'incorrect', attempts: 1, submittedEmpty: true });
    expect(n.kind).toBe('are_you_sure');
    expect(n.reason).toBe('skipped_step');
  });

  it("4. repeated failure (attempt 2, frustrated) -> work_together, NEVER are_you_sure", () => {
    const n = decideAttemptNudge({ ...base, verdict: 'partial', attempts: 2 });
    expect(n.kind).toBe('work_together');
    expect(n.kind).not.toBe('are_you_sure');
    expect(n.reason).toBe('repeated_failure');
  });

  it("4b. at max attempts -> work_together (not are_you_sure)", () => {
    const n = decideAttemptNudge({ ...base, verdict: 'incorrect', attempts: 3 });
    expect(n.kind).toBe('work_together');
    expect(n.reason).toBe('repeated_failure');
  });

  it('captured (explanation) -> praise', () => {
    const n = decideAttemptNudge({ ...base, verdict: 'captured' });
    expect(n.kind).toBe('praise');
  });
});

describe('#8 decideHelpNudge — child requests help', () => {
  it('5. fresh task, first help -> small are_you_sure nudge BEFORE a hint', () => {
    const n = decideHelpNudge({ attempts: 0, maxAttempts: 3, hintLevel: 0, hintCount: 3 });
    expect(n.kind).toBe('are_you_sure');
    expect(n.reason).toBe('small_nudge_first');
    expect(n.serveHintLevel).toBeUndefined(); // no ladder hint served yet
  });

  it('5b. help after a wrong attempt -> serve next ladder hint', () => {
    const n = decideHelpNudge({ attempts: 1, maxAttempts: 3, hintLevel: 0, hintCount: 3 });
    expect(n.kind).toBe('give_hint');
    expect(n.serveHintLevel).toBe(1);
  });

  it('5c. help when frustrated -> work_together (deeper worked step), not are_you_sure', () => {
    const n = decideHelpNudge({ attempts: 2, maxAttempts: 3, hintLevel: 1, hintCount: 3 });
    expect(n.kind).toBe('work_together');
    expect(n.kind).not.toBe('are_you_sure');
    expect(n.serveHintLevel).toBe(3); // deepest
  });
});

describe('isEmptyAttempt', () => {
  it('empty array (no counters) -> true (skipped step)', () => {
    expect(isEmptyAttempt({ kind: 'array', rows: [0, 0] })).toBe(true);
    expect(isEmptyAttempt({ kind: 'array', rows: [] })).toBe(true);
    expect(isEmptyAttempt({ kind: 'array', rows: [3, 3] })).toBe(false);
  });
  it('null numeric -> true', () => {
    expect(isEmptyAttempt({ kind: 'numeric', value: null })).toBe(true);
    expect(isEmptyAttempt({ kind: 'numeric', value: 12 })).toBe(false);
  });
});
