import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx, MutationCtx } from './_generated/server';
import { currentTask, nextPosition, phaseContent, type Position } from './lesson/machine';
import { gradeTask, type Attempt } from './lesson/grade';
import { RULES, isMisconceptionTag, type Phase } from './lesson/vocab';
import type { LessonPlan, Task } from './lesson/plan';

// Strip a task down to what the client/model may see (no correct_state leaks of
// other tasks; the current task keeps its target so the Workspace can render).
function publicTask(task: Task | null) {
  if (!task) return null;
  return {
    id: task.id,
    prompt: task.prompt,
    answerType: task.answerType,
    manipulative: task.manipulative ?? null,
    choices: task.choices ?? null
  };
}

async function loadSessionPlan(
  ctx: QueryCtx | MutationCtx,
  sessionId: Id<'sessions'>
): Promise<{ session: Doc<'sessions'>; plan: LessonPlan; pos: Position }> {
  const session = await ctx.db.get(sessionId);
  if (!session) throw new Error('session not found');
  if (!session.lessonPlanId) throw new Error('session has no plan');
  const planDoc = await ctx.db.get(session.lessonPlanId);
  if (!planDoc) throw new Error('plan not found');
  const pos: Position = {
    phase: (session.phase ?? 'warm_up') as Phase,
    taskIndex: session.taskIndex ?? 0
  };
  return { session, plan: planDoc.plan as LessonPlan, pos };
}

function snapshot(session: Doc<'sessions'>, plan: LessonPlan) {
  const pos: Position = {
    phase: (session.phase ?? 'warm_up') as Phase,
    taskIndex: session.taskIndex ?? 0
  };
  const task = currentTask(plan, pos);
  return {
    sessionId: session._id,
    status: session.status,
    phase: pos.phase,
    taskIndex: pos.taskIndex,
    attempts: session.attempts ?? 0,
    hintLevel: session.hintLevel ?? 0,
    taskResolved: session.taskResolved ?? false,
    objective: plan.objective,
    content: phaseContent(plan, pos.phase),
    task: publicTask(task),
    practiceCount: plan.practice.length
  };
}

// Start an engine-driven session against the approved plan for a skill.
export const start = mutation({
  args: { childId: v.id('children'), skillTag: v.string(), mode: v.optional(v.string()) },
  handler: async (ctx, { childId, skillTag, mode = 'realtime' }) => {
    const planDoc = await ctx.db
      .query('lessonPlans')
      .withIndex('by_skill_status', (q) => q.eq('skillTag', skillTag).eq('status', 'approved'))
      .order('desc')
      .first();
    if (!planDoc) throw new Error(`no approved plan for skill "${skillTag}"`);
    const plan = planDoc.plan as LessonPlan;
    const sessionId = await ctx.db.insert('sessions', {
      childId,
      lessonId: plan.lessonId,
      lessonPlanId: planDoc._id,
      status: 'active',
      mode,
      phase: 'warm_up',
      taskIndex: 0,
      attempts: 0,
      hintLevel: 0,
      taskResolved: false,
      startedAt: Date.now()
    });
    await ctx.db.insert('sessionEvents', {
      sessionId,
      childId,
      type: 'session_start',
      meta: { lessonId: plan.lessonId, skillTag, mode },
      at: Date.now()
    });
    const session = (await ctx.db.get(sessionId))!;
    return snapshot(session, plan);
  }
});

export const state = query({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, { sessionId }) => {
    const { session, plan } = await loadSessionPlan(ctx, sessionId);
    return snapshot(session, plan);
  }
});

// TOOL: serve the next hint from the ladder. Cannot skip levels or exceed the
// ladder (deepest hint is a worked step authored in the plan).
export const requestHint = mutation({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, { sessionId }) => {
    const { session, plan, pos } = await loadSessionPlan(ctx, sessionId);
    const task = currentTask(plan, pos);
    if (!task) return { ok: false, reason: 'no task in this phase' };
    const level = Math.min((session.hintLevel ?? 0) + 1, task.hints.length);
    await ctx.db.patch(sessionId, { hintLevel: level });
    await ctx.db.insert('sessionEvents', {
      sessionId,
      childId: session.childId,
      type: 'hint_shown',
      meta: { taskId: task.id, level },
      at: Date.now()
    });
    return { ok: true, hint: task.hints[level - 1], level, deepest: level === task.hints.length };
  }
});

// TOOL: record an attempt. Server computes the Verdict deterministically — the
// model never owns correctness. Forces resolution after maxAttempts.
export const recordAttempt = mutation({
  args: { sessionId: v.id('sessions'), attempt: v.any() },
  handler: async (ctx, { sessionId, attempt }) => {
    const { session, plan, pos } = await loadSessionPlan(ctx, sessionId);
    const task = currentTask(plan, pos);
    if (!task) return { ok: false, reason: 'no task in this phase' };

    const verdict = gradeTask(task, attempt as Attempt);
    const attempts = (session.attempts ?? 0) + 1;
    const correct = verdict.status === 'correct';
    const maxReached = attempts >= RULES.maxAttempts;
    const resolved = correct || maxReached;

    await ctx.db.patch(sessionId, { attempts, taskResolved: resolved });
    await ctx.db.insert('sessionEvents', {
      sessionId,
      childId: session.childId,
      type: 'task_attempt',
      meta: { taskId: task.id, status: verdict.status, attempts, observed: verdict.observed },
      at: Date.now()
    });
    if (verdict.misconception) {
      await ctx.db.insert('sessionEvents', {
        sessionId,
        childId: session.childId,
        type: 'misconception',
        meta: { taskId: task.id, tag: verdict.misconception, source: 'validator', confidence: 0.9 },
        at: Date.now()
      });
    }
    if (pos.phase === 'mastery_check' && resolved) {
      await ctx.db.patch(sessionId, { masteryResult: correct ? 'passed' : 'unresolved' });
      await ctx.db.insert('sessionEvents', {
        sessionId,
        childId: session.childId,
        type: 'mastery_result',
        meta: { result: correct ? 'passed' : 'unresolved' },
        at: Date.now()
      });
    }
    return {
      ok: true,
      verdict: verdict.status,
      misconception: verdict.misconception ?? null,
      attempts,
      resolved,
      forcedWorkedStep: !correct && maxReached
    };
  }
});

// TOOL: model proposes a misconception (controlled vocab, lower confidence).
export const tagMisconception = mutation({
  args: { sessionId: v.id('sessions'), tag: v.string() },
  handler: async (ctx, { sessionId, tag }) => {
    if (!isMisconceptionTag(tag)) return { ok: false, reason: 'unknown misconception tag' };
    const { session, pos } = await loadSessionPlan(ctx, sessionId);
    await ctx.db.insert('sessionEvents', {
      sessionId,
      childId: session.childId,
      type: 'misconception',
      meta: { tag, source: 'model', confidence: 0.4, phase: pos.phase },
      at: Date.now()
    });
    return { ok: true };
  }
});

// TOOL: advance to the next phase/task. Rejected if the current task is unresolved.
export const advancePhase = mutation({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, { sessionId }) => {
    const { session, plan, pos } = await loadSessionPlan(ctx, sessionId);
    const task = currentTask(plan, pos);
    if (task && !(session.taskResolved ?? false)) {
      return { ok: false, reason: 'current task not resolved' };
    }
    const next = nextPosition(plan, pos);
    if (!next) {
      await ctx.db.patch(sessionId, { status: 'ended', endedAt: Date.now() });
      await ctx.db.insert('sessionEvents', {
        sessionId,
        childId: session.childId,
        type: 'session_end',
        meta: { durationMs: Date.now() - session.startedAt },
        at: Date.now()
      });
      return { ok: true, done: true };
    }
    await ctx.db.patch(sessionId, {
      phase: next.phase,
      taskIndex: next.taskIndex,
      attempts: 0,
      hintLevel: 0,
      taskResolved: false
    });
    await ctx.db.insert('sessionEvents', {
      sessionId,
      childId: session.childId,
      type: 'phase_change',
      meta: { from: pos.phase, to: next.phase, taskIndex: next.taskIndex },
      at: Date.now()
    });
    const updated = (await ctx.db.get(sessionId))!;
    return { ok: true, ...snapshot(updated, plan) };
  }
});
