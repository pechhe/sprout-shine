// Pure lesson phase-machine. Decides the current task and the next phase. The
// engine (convex/engine.ts) owns persistence + verdicts; this file owns ordering.

import { PHASE_ORDER, type Phase } from './vocab';
import type { LessonPlan, Task } from './plan';

export type Position = { phase: Phase; taskIndex: number };

/** The task the child must resolve at this position, or null for narration phases. */
export function currentTask(plan: LessonPlan, pos: Position): Task | null {
  switch (pos.phase) {
    case 'warm_up':
      return plan.warmUp;
    case 'practice':
      return plan.practice[pos.taskIndex] ?? null;
    case 'mastery_check':
      return plan.masteryCheck;
    default:
      return null; // concept, worked_example, reflection
  }
}

/** Narration / non-task content for a phase. */
export function phaseContent(plan: LessonPlan, phase: Phase) {
  switch (phase) {
    case 'concept':
      return { kind: 'concept' as const, text: plan.concept };
    case 'worked_example':
      return { kind: 'worked_example' as const, text: plan.workedExample.narration, demo: plan.workedExample.demo };
    case 'reflection':
      return { kind: 'reflection' as const, prompt: plan.reflection.prompt, choices: plan.reflection.choices };
    default:
      return null;
  }
}

/** Next position, or null when the lesson is complete. */
export function nextPosition(plan: LessonPlan, pos: Position): Position | null {
  if (pos.phase === 'practice' && pos.taskIndex < plan.practice.length - 1) {
    return { phase: 'practice', taskIndex: pos.taskIndex + 1 };
  }
  const i = PHASE_ORDER.indexOf(pos.phase);
  const next = PHASE_ORDER[i + 1] as Phase | undefined;
  if (!next) return null; // past reflection -> end
  return { phase: next, taskIndex: 0 };
}
