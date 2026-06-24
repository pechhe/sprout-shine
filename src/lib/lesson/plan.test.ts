import { describe, it, expect } from 'vitest';
import { validatePlan, type LessonPlan } from '$convex/lesson/plan';
import { arraysIntroPlan } from '$convex/lesson/seedPlans';

describe('validatePlan', () => {
  it('accepts the canonical arrays plan', () => {
    const r = validatePlan(arraysIntroPlan);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('rejects an unknown skillTag', () => {
    const bad = { ...arraysIntroPlan, skillTag: 'not_a_skill' } as unknown as LessonPlan;
    expect(validatePlan(bad).ok).toBe(false);
  });

  it('rejects a hint ladder that is too short', () => {
    const bad: LessonPlan = {
      ...arraysIntroPlan,
      practice: [{ ...arraysIntroPlan.practice[0], hints: ['only one'] }]
    };
    expect(validatePlan(bad).errors.some((e) => e.includes('hints'))).toBe(true);
  });

  it('rejects a mastery check that only needs a number', () => {
    const bad: LessonPlan = {
      ...arraysIntroPlan,
      masteryCheck: {
        id: 'm',
        prompt: 'what is 4x5?',
        answerType: 'numeric',
        numericAnswer: 20,
        hints: ['a', 'b'],
        misconceptions: []
      }
    };
    expect(validatePlan(bad).errors.some((e) => e.includes('proof'))).toBe(true);
  });

  it('rejects unknown misconception tags', () => {
    const bad: LessonPlan = {
      ...arraysIntroPlan,
      practice: [{ ...arraysIntroPlan.practice[0], misconceptions: ['made_up_tag'] }]
    };
    expect(validatePlan(bad).errors.some((e) => e.includes('unknown misconception'))).toBe(true);
  });
});
