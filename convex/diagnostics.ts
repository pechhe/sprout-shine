import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { gradeTask, type Attempt, type VerdictStatus } from './lesson/grade';
import { decideAttemptNudge, decideHelpNudge, isEmptyAttempt } from './lesson/nudge';
import { DIAGNOSTIC_ITEMS } from './lesson/diagnosticTasks';
import {
  estimateSkillFromDiagnostic,
  parentSkillView,
  closingFeedback,
  type SkillEstimate,
  type SkillLevel
} from './lesson/skillState';
import { RULES } from './lesson/vocab';
import type { MisconceptionTag } from './lesson/vocab';

function publicItem(i: number) {
  const item = DIAGNOSTIC_ITEMS[i];
  if (!item) return null;
  return {
    index: i,
    total: DIAGNOSTIC_ITEMS.length,
    label: item.label,
    skillTag: item.skillTag,
    prompt: item.task.prompt,
    answerType: item.task.answerType,
    manipulative: item.task.manipulative ?? null,
    hints: item.task.hints.length
  };
}

function snapshot(session: any) {
  const i = session.diagnosticTaskIndex ?? 0;
  const done = i >= DIAGNOSTIC_ITEMS.length;
  return {
    sessionId: session._id,
    status: session.status,
    itemIndex: i,
    total: DIAGNOSTIC_ITEMS.length,
    attempts: session.attempts ?? 0,
    hintLevel: session.hintLevel ?? 0,
    done,
    item: done ? null : publicItem(i)
  };
}

// #9 — start a diagnostic session (mirrors the engine session shape, mode realtime).
export const start = mutation({
  args: { childId: v.id('children') },
  handler: async (ctx, { childId }) => {
    const sessionId = await ctx.db.insert('sessions', {
      childId,
      lessonId: 'diagnostic',
      status: 'active',
      mode: 'realtime',
      diagnosticTaskIndex: 0,
      attempts: 0,
      hintLevel: 0,
      taskResolved: false,
      startedAt: Date.now()
    });
    await ctx.db.insert('sessionEvents', {
      sessionId,
      childId,
      type: 'session_start',
      meta: { lessonId: 'diagnostic' },
      at: Date.now()
    });
    const session = (await ctx.db.get(sessionId))!;
    return snapshot(session);
  }
});

export const state = query({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error('session not found');
    return snapshot(session);
  }
});

// Record the (now-again) strongest skill levels + humble parent phrases.
async function buildClosing(ctx: QueryCtx, childId: Id<'children'>) {
  const states = await ctx.db
    .query('skillStates')
    .withIndex('by_child', (q) => q.eq('childId', childId))
    .collect();
  const views = states.map((s) => ({
    skillTag: s.skillTag,
    level: s.level as SkillLevel,
    phrase: parentSkillView(s.skillTag, s.level as SkillLevel).phrase,
    levelScore: s.levelScore
  }));
  const strongest = states
    .map((s) => ({
      estimate: { level: s.level, levelScore: s.levelScore } as Pick<SkillEstimate, 'level' | 'levelScore'>,
      label: DIAGNOSTIC_ITEMS.find((d) => d.skillTag === s.skillTag)?.label ?? s.skillTag
    }))
    .sort((a, b) => b.estimate.levelScore - a.estimate.levelScore)
    .slice(0, 2);
  const labels = strongest.map((s) => s.label);
  const estimates = strongest.map((s) => ({
    level: s.estimate.level as SkillLevel,
    levelScore: s.estimate.levelScore,
    confidence: 0.5,
    evidenceCount: 1,
    misconceptions: []
  })) as SkillEstimate[];
  return { views, message: closingFeedback(estimates, labels) };
}

// Record a diagnostic attempt. Grades deterministically, auto-advances on
// resolve (correct OR max attempts), writes the initial skillState estimate.
export const recordAttempt = mutation({
  args: { sessionId: v.id('sessions'), attempt: v.any() },
  handler: async (ctx, { sessionId, attempt }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error('session not found');
    const i = session.diagnosticTaskIndex ?? 0;
    const item = DIAGNOSTIC_ITEMS[i];
    if (!item) return { ok: false, reason: 'diagnostic complete' };

    const verdict = gradeTask(item.task, attempt as Attempt);
    const attempts = (session.attempts ?? 0) + 1;
    const correct = verdict.status === 'correct' || verdict.status === 'captured';
    const maxReached = attempts >= RULES.maxAttempts;
    const resolved = correct || maxReached;

    const nudge = decideAttemptNudge({
      verdict: verdict.status,
      misconception: verdict.misconception ?? null,
      attempts,
      maxAttempts: RULES.maxAttempts,
      hintLevel: session.hintLevel ?? 0,
      submittedEmpty: isEmptyAttempt(attempt as Attempt)
    });

    await ctx.db.patch(sessionId, { attempts, taskResolved: resolved });
    await ctx.db.insert('sessionEvents', {
      sessionId,
      childId: session.childId,
      type: 'task_attempt',
      meta: { skillTag: item.skillTag, taskId: item.task.id, status: verdict.status, attempts, observed: verdict.observed },
      at: Date.now()
    });
    if (verdict.misconception) {
      await ctx.db.insert('sessionEvents', {
        sessionId,
        childId: session.childId,
        type: 'misconception',
        meta: { tag: verdict.misconception, source: 'validator', skillTag: item.skillTag, confidence: 0.9 },
        at: Date.now()
      });
    }

    if (!resolved) {
      return { ok: true, verdict: verdict.status, misconception: verdict.misconception ?? null, attempts, resolved: false, nudgeKind: nudge.kind, nudgeReason: nudge.reason, coachInstruction: nudge.coachInstruction };
    }

    // Resolved -> write/replace the skill-state estimate and advance.
    const estimate = estimateSkillFromDiagnostic(
      { verdict: verdict.status as VerdictStatus, attempts, hintUsed: (session.hintLevel ?? 0) > 0, resolved },
      verdict.misconception as MisconceptionTag | null
    );
    const existing = await ctx.db
      .query('skillStates')
      .withIndex('by_child_skill', (q) => q.eq('childId', session.childId).eq('skillTag', item.skillTag))
      .first();
    if (existing) {
      // keep higher-confidence evidence if somehow present
      await ctx.db.patch(existing._id, {
        level: estimate.level,
        levelScore: estimate.levelScore,
        confidence: Math.max(existing.confidence, estimate.confidence),
        evidenceCount: existing.evidenceCount + 1,
        lastSeen: Date.now(),
        misconceptions: estimate.misconceptions,
        source: 'diagnostic',
        updatedAt: Date.now()
      });
    } else {
      await ctx.db.insert('skillStates', {
        childId: session.childId,
        skillTag: item.skillTag,
        level: estimate.level,
        levelScore: estimate.levelScore,
        confidence: estimate.confidence,
        evidenceCount: 1,
        lastSeen: Date.now(),
        misconceptions: estimate.misconceptions,
        source: 'diagnostic',
        updatedAt: Date.now()
      });
    }
    await ctx.db.insert('sessionEvents', {
      sessionId,
      childId: session.childId,
      type: 'mastery_result',
      meta: { skillTag: item.skillTag, level: estimate.level, confidence: estimate.confidence },
      at: Date.now()
    });

    // Advance to the next diagnostic item (auto-advance on resolve keeps the
    // diagnostic short and guarantees completion well under 15 minutes).
    const nextI = i + 1;
    if (nextI >= DIAGNOSTIC_ITEMS.length) {
      await ctx.db.patch(sessionId, { status: 'ended', endedAt: Date.now(), diagnosticTaskIndex: nextI });
      const closing = await buildClosing(ctx, session.childId);
      await ctx.db.insert('sessionEvents', {
        sessionId,
        childId: session.childId,
        type: 'session_end',
        meta: { closing: closing.message },
        at: Date.now()
      });
      return { ok: true, done: true, closing: closing.message, views: closing.views, skillEstimate: estimate };
    }
    await ctx.db.patch(sessionId, { diagnosticTaskIndex: nextI, attempts: 0, hintLevel: 0, taskResolved: false });
    await ctx.db.insert('sessionEvents', {
      sessionId,
      childId: session.childId,
      type: 'phase_change',
      meta: { from: item.skillTag, to: DIAGNOSTIC_ITEMS[nextI].skillTag },
      at: Date.now()
    });
    const updated = (await ctx.db.get(sessionId))!;
    return { ok: true, resolved: true, nudgeKind: nudge.kind, nudgeReason: nudge.reason, coachInstruction: nudge.coachInstruction, skillEstimate: estimate, next: snapshot(updated).item };
  }
});

// #8 nudge/hint logic reused for the diagnostic so it feels consistent.
export const requestHint = mutation({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error('session not found');
    const item = DIAGNOSTIC_ITEMS[session.diagnosticTaskIndex ?? 0];
    if (!item) return { ok: false, reason: 'diagnostic complete' };
    const decision = decideHelpNudge({
      attempts: session.attempts ?? 0,
      maxAttempts: RULES.maxAttempts,
      hintLevel: session.hintLevel ?? 0,
      hintCount: item.task.hints.length
    });
    let hint: string | null = null;
    let level = session.hintLevel ?? 0;
    if (decision.serveHintLevel) {
      level = decision.serveHintLevel;
      await ctx.db.patch(sessionId, { hintLevel: level });
      hint = item.task.hints[level - 1] ?? null;
      await ctx.db.insert('sessionEvents', {
        sessionId,
        childId: session.childId,
        type: 'hint_shown',
        meta: { taskId: item.task.id, level },
        at: Date.now()
      });
    } else {
      await ctx.db.insert('sessionEvents', {
        sessionId,
        childId: session.childId,
        type: 'nudge_shown',
        meta: { kind: decision.kind, reason: decision.reason },
        at: Date.now()
      });
    }
    return { ok: true, nudgeKind: decision.kind, coachInstruction: decision.coachInstruction, hint, level };
  }
});

// #9 — parent-facing, humble skill snapshot (no harsh scores or labels).
export const skillSnapshot = query({
  args: { childId: v.id('children') },
  handler: async (ctx, { childId }) => (await buildClosing(ctx, childId)).views
});
