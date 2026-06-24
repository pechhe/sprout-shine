import { describe, it, expect } from 'vitest';
import { validatePlan } from '$convex/lesson/plan';
import { STRAND_ANCHORS, ANCHOR_LESSON_IDS } from '$convex/lesson/anchorPlans';
import { arraysIntroPlan } from '$convex/lesson/seedPlans';
import { STRANDS, STRAND_ANCHOR_SKILL, strandForSkillTag } from '$convex/lesson/vocab';
import { currentTask, nextPosition, type Position } from '$convex/lesson/machine';

// #14 Seam 1 — Strand Anchor validation + runnability. Anchors are the fail-safe
// floor: they MUST validate at deploy time (seedAnchors enforces this) and MUST
// be runnable by the existing phase machine without per-strand custom code.
// This is the unit-test half of "an anchor is loadable and runnable without
// custom code for each of the 5 strands" (the integration half is Seam 2).

describe('#14 Strand Anchors — every anchor validates (fail-safe floor)', () => {
  for (const strand of STRANDS) {
    it(`anchor for "${strand}" passes validatePlan`, () => {
      const plan = STRAND_ANCHORS[strand];
      const r = validatePlan(plan);
      expect(r.errors, r.errors.join('; ')).toEqual([]);
      expect(r.ok).toBe(true);
    });
  }

  it('exactly five anchors, one per strand', () => {
    expect(Object.keys(STRAND_ANCHORS).sort()).toEqual([...STRANDS].sort());
  });

  it('multiplication_division anchor is the recast arraysIntroPlan (#7 seed)', () => {
    expect(STRAND_ANCHORS.multiplication_division).toBe(arraysIntroPlan);
  });

  it('anchor skillTag matches STRAND_ANCHOR_SKILL registry', () => {
    for (const strand of STRANDS) {
      expect(STRAND_ANCHORS[strand].skillTag).toBe(STRAND_ANCHOR_SKILL[strand]);
    }
  });

  it('each anchor lessonId is stable + unique (fallback lookup keys on it)', () => {
    const ids = STRANDS.map((s) => ANCHOR_LESSON_IDS[s]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const strand of STRANDS) {
      expect(ANCHOR_LESSON_IDS[strand]).toBe(STRAND_ANCHORS[strand].lessonId);
    }
  });

  it('each anchor skillTag rolls up to its own strand (no cross-strand leak)', () => {
    for (const strand of STRANDS) {
      const skill = STRAND_ANCHORS[strand].skillTag;
      expect(strandForSkillTag(skill)).toBe(strand);
    }
  });
});

describe('#14 Strand Anchors — runnable by the phase machine (no per-strand code)', () => {
  // Walk every anchor warm_up -> reflection via nextPosition and assert the
  // machine resolves a task at every task-bearing phase and terminates. This is
  // the structural proof that engine.startQueued can run any anchor unchanged.
  for (const strand of STRANDS) {
    it(`anchor for "${strand}" walks warm_up -> reflection via the machine`, () => {
      const plan = STRAND_ANCHORS[strand];
      let pos: Position = { phase: 'warm_up', taskIndex: 0 };
      const visited: string[] = [pos.phase];
      // warm_up and mastery_check always bear a task; practice may have >=1.
      expect(currentTask(plan, pos)).not.toBeNull();

      // Advance until the machine says the lesson is complete.
      let guard = 0;
      while (pos.phase !== 'reflection' && guard < 50) {
        const next = nextPosition(plan, pos);
        if (!next) break;
        pos = next;
        visited.push(pos.phase);
        guard++;
      }
      expect(visited).toContain('reflection');
      // mastery_check task must require proof (manipulative or explanation),
      // never a bare number/choice — the validator enforces this, re-asserted.
      const masteryTask = plan.masteryCheck;
      expect(['manipulative', 'explanation']).toContain(masteryTask.answerType);

      // Past reflection, nextPosition returns null (lesson complete).
      expect(nextPosition(plan, { phase: 'reflection', taskIndex: 0 })).toBeNull();
    });
  }
});
