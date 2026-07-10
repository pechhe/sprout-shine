import { describe, it, expect } from 'vitest';
import { inspectArray, inspectEqualGroups, gradeTask } from '$convex/lesson/grade';
import { arraysIntroPlan } from '$convex/lesson/seedPlans';

describe('inspectArray', () => {
  const target = { rows: 3, columns: 4 };
  it('correct array', () => {
    expect(inspectArray([4, 4, 4], target).status).toBe('correct');
  });
  it('empty is incorrect', () => {
    expect(inspectArray([], target).status).toBe('incorrect');
  });
  it('swapped rows/cols -> rows_columns_confused', () => {
    const v = inspectArray([3, 3, 3, 3], target); // 4 rows of 3
    expect(v.status).toBe('partial');
    expect(v.misconception).toBe('rows_columns_confused');
  });
  it('unequal rows -> unequal_groups', () => {
    expect(inspectArray([4, 3, 4], target).misconception).toBe('unequal_groups');
  });
  it('right shape, miscount -> counting_slip', () => {
    // 3 rows but each 5 (equal, wrong count) is not target -> counting_slip
    expect(inspectArray([5, 5, 5], target).misconception).toBe('counting_slip');
  });
});

describe('inspectEqualGroups', () => {
  const target = { groups: 4, perGroup: 6 };
  it('correct', () => expect(inspectEqualGroups([6, 6, 6, 6], target).status).toBe('correct'));
  it('partial', () => expect(inspectEqualGroups([6, 6], target).status).toBe('partial'));
});

describe('gradeTask', () => {
  it('grades a manipulative array task from the plan', () => {
    const task = arraysIntroPlan.practice[0]; // 3 x 4
    expect(gradeTask(task, { kind: 'array', rows: [4, 4, 4] }).status).toBe('correct');
    expect(gradeTask(task, { kind: 'array', rows: [4, 4] }).status).toBe('partial');
  });
  it('captures explanation without grading', () => {
    const task = { ...arraysIntroPlan.warmUp, answerType: 'explanation' as const };
    expect(gradeTask(task, { kind: 'explanation', text: 'because rows' }).status).toBe('captured');
  });
});
