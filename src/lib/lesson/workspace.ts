// #6 — visual maths workspace model + inspector.
// Task type: "equal groups" (also reads as an array). The child builds N groups
// each holding M counters. The inspector is a *pure* function so the lesson
// engine (#7) and tests can reason about workspace state without any UI.

export type EqualGroupsTarget = { groups: number; perGroup: number };
export type WorkspaceStatus = 'correct' | 'partial' | 'incorrect';

export type Inspection = {
  status: WorkspaceStatus;
  observedGroups: number;
  total: number;
  expectedTotal: number;
  /** groups that hold exactly the target amount */
  correctGroups: number;
  target: EqualGroupsTarget;
};

/** Inspect equal-groups workspace state against a target. */
export function inspectEqualGroups(groups: number[], target: EqualGroupsTarget): Inspection {
  const observedGroups = groups.length;
  const total = groups.reduce((a, b) => a + b, 0);
  const expectedTotal = target.groups * target.perGroup;
  const correctGroups = groups.filter((g) => g === target.perGroup).length;

  let status: WorkspaceStatus;
  if (total === 0) {
    status = 'incorrect';
  } else if (
    observedGroups === target.groups &&
    groups.every((g) => g === target.perGroup)
  ) {
    status = 'correct';
  } else {
    status = 'partial';
  }

  return { status, observedGroups, total, expectedTotal, correctGroups, target };
}

/** A tutor-facing sentence that refers to what is visible in the workspace. */
export function describeWorkspace(ins: Inspection): string {
  const { observedGroups, target, total, expectedTotal } = ins;
  const g = (n: number) => `${n} group${n === 1 ? '' : 's'}`;

  if (ins.status === 'correct') {
    return `I can see ${g(observedGroups)} of ${target.perGroup} — that makes ${total}. Spot on!`;
  }
  if (observedGroups === 0 || total === 0) {
    return `Your workbook is empty — try making ${g(target.groups)} of ${target.perGroup}.`;
  }
  if (observedGroups < target.groups) {
    return `You've made ${g(observedGroups)} so far, but we need ${g(target.groups)} of ${target.perGroup}. Add another group?`;
  }
  if (observedGroups > target.groups) {
    return `That's ${g(observedGroups)} — a little too many. We only need ${g(target.groups)} of ${target.perGroup}.`;
  }
  // right number of groups, wrong counts
  return `You've got ${g(observedGroups)}, but they're not all ${target.perGroup}. You have ${total} counters and we want ${expectedTotal}. Check each group has ${target.perGroup}.`;
}
