// Deterministic Verdicts. The LLM never decides correctness — these pure
// functions do. Each returns a status plus, when wrong, a controlled-vocabulary
// misconception tag derived from the observed state.

import type { MisconceptionTag } from './vocab';
import type { Task } from './plan';

export type VerdictStatus = 'correct' | 'partial' | 'incorrect' | 'captured';

export type Verdict = {
  status: VerdictStatus;
  misconception?: MisconceptionTag;
  observed?: unknown;
  expected?: unknown;
};

// --- array: rows of counters vs rows x columns target ---
export function inspectArray(rows: number[], target: { rows: number; columns: number }): Verdict {
  const total = rows.reduce((a, b) => a + b, 0);
  const expectedTotal = target.rows * target.columns;
  const observed = { rows: rows.length, perRow: rows };
  const expected = { rows: target.rows, columns: target.columns };

  const allEqual = rows.length > 0 && rows.every((r) => r === rows[0]);
  const correct = rows.length === target.rows && rows.every((r) => r === target.columns);
  const swapped =
    rows.length === target.columns && rows.length > 0 && rows.every((r) => r === target.rows);

  if (correct) return { status: 'correct', observed, expected };
  if (total === 0) return { status: 'incorrect', observed, expected };

  let misconception: MisconceptionTag | undefined;
  if (swapped) misconception = 'rows_columns_confused';
  else if (!allEqual) misconception = 'unequal_groups';
  else if (rows.length === target.rows && total !== expectedTotal) misconception = 'counting_slip';

  return { status: 'partial', misconception, observed, expected };
}

// --- equal groups: N groups each holding M ---
export function inspectEqualGroups(
  groups: number[],
  target: { groups: number; perGroup: number }
): Verdict {
  const total = groups.reduce((a, b) => a + b, 0);
  const expectedTotal = target.groups * target.perGroup;
  const observed = { groups: groups.length, counts: groups };
  const expected = { groups: target.groups, perGroup: target.perGroup };

  const allEqual = groups.length > 0 && groups.every((g) => g === groups[0]);
  const correct = groups.length === target.groups && groups.every((g) => g === target.perGroup);

  if (correct) return { status: 'correct', observed, expected };
  if (total === 0) return { status: 'incorrect', observed, expected };

  let misconception: MisconceptionTag | undefined;
  if (!allEqual) misconception = 'unequal_groups';
  else if (groups.length === target.groups && total !== expectedTotal) misconception = 'counting_slip';

  return { status: 'partial', misconception, observed, expected };
}

export type Attempt =
  | { kind: 'array'; rows: number[] }
  | { kind: 'equal_groups'; groups: number[] }
  | { kind: 'numeric'; value: number | null }
  | { kind: 'choice'; choice: string }
  | { kind: 'explanation'; text: string };

/** Grade an attempt against a task. Authoritative Verdict for the engine. */
export function gradeTask(task: Task, attempt: Attempt): Verdict {
  switch (attempt.kind) {
    case 'array':
      if (task.manipulative?.kind !== 'array') return { status: 'incorrect' };
      return inspectArray(attempt.rows, task.manipulative);
    case 'equal_groups':
      if (task.manipulative?.kind !== 'equal_groups') return { status: 'incorrect' };
      return inspectEqualGroups(attempt.groups, task.manipulative);
    case 'numeric':
      if (attempt.value === null) return { status: 'incorrect' };
      return attempt.value === task.numericAnswer
        ? { status: 'correct', observed: attempt.value }
        : { status: 'incorrect', observed: attempt.value, expected: task.numericAnswer };
    case 'choice':
      return attempt.choice === task.choiceAnswer
        ? { status: 'correct', observed: attempt.choice }
        : { status: 'incorrect', observed: attempt.choice, expected: task.choiceAnswer };
    case 'explanation':
      // not deterministically graded — captured as evidence
      return { status: 'captured', observed: attempt.text };
  }
}
