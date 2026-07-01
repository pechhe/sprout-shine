import { describe, it, expect } from 'vitest';
import {
  inspectArray,
  inspectEqualGroups,
  inspectNumberLine,
  inspectFractionBars,
  gradeTask
} from '$convex/lesson/grade';
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

describe('inspectNumberLine', () => {
  const target = { min: 0, max: 10, step: 1, answer: 7 };
  it('correct placement', () => {
    expect(inspectNumberLine(7, target).status).toBe('correct');
  });
  it('no marker is incorrect', () => {
    expect(inspectNumberLine(null, target).status).toBe('incorrect');
  });
  it('one tick off -> off_by_one', () => {
    const v = inspectNumberLine(8, target);
    expect(v.status).toBe('partial');
    expect(v.misconception).toBe('off_by_one');
  });
  it('far off -> partial, no tag', () => {
    const v = inspectNumberLine(2, target);
    expect(v.status).toBe('partial');
    expect(v.misconception).toBeUndefined();
  });
  it('fractional steps: one step off -> off_by_one', () => {
    const t = { min: 0, max: 1, step: 0.25, answer: 0.75 };
    expect(inspectNumberLine(0.75, t).status).toBe('correct');
    expect(inspectNumberLine(0.5, t).misconception).toBe('off_by_one');
  });
});

describe('inspectFractionBars', () => {
  const target = { parts: 4, shaded: 3 };
  it('correct', () => {
    expect(inspectFractionBars({ parts: 4, shaded: 3 }, target).status).toBe('correct');
  });
  it('nothing shaded is incorrect', () => {
    expect(inspectFractionBars({ parts: 4, shaded: 0 }, target).status).toBe('incorrect');
  });
  it('wrong split -> counting_slip', () => {
    const v = inspectFractionBars({ parts: 5, shaded: 3 }, target);
    expect(v.status).toBe('partial');
    expect(v.misconception).toBe('counting_slip');
  });
  it('right split, one piece off -> off_by_one', () => {
    const v = inspectFractionBars({ parts: 4, shaded: 2 }, target);
    expect(v.status).toBe('partial');
    expect(v.misconception).toBe('off_by_one');
  });
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
