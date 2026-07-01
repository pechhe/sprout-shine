// #14 — the pre-warm + fallback orchestrator. Near-pure policy: reads the
// Learner Model, runs the deterministic Strand Selector, and for each top
// candidate either (a) generates+validates a plan via the #7 pipeline, or (b)
// falls back to the Strand Anchor. Prunes the queuedPlans cache to the new top
// strands (a mastered skill's queued plan is dropped).
//
// Pre-warm is keyed by the Strand Selector's ranked output and holds the top
// PREWARM_CACHE_SIZE distinct-strand plans per child, so a redirection re-routes
// to an already-cached plan (near-instant) or falls back to the anchor. No
// synchronous generation on the eager session-start path: session-start reads
// the queued, validated plan and starts instantly into a Realtime tutor.
// Generation attempts + failures are logged as session events so #15's pilot
// dashboard can report the fallback rate.
//
// The orchestrator mutates Convex (queuedPlans, lessonPlans, sessionEvents) so it
// lives here in /convex, but its policy is a thin, reviewable seam over the pure
// selector — the logic that earns trust lives in selectStrand + validatePlan.

import { internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { ActionCtx } from './_generated/server';
import { api, internal } from './_generated/api';
import { validatePlan } from './lesson/plan';
import { STRAND_ANCHORS, ANCHOR_LESSON_IDS } from './lesson/anchorPlans';
import { PREWARM_CACHE_SIZE, type Strand } from './lesson/vocab';
import {
  selectStrand,
  STUCK_THRESHOLD_UNRESOLVED,
  type SelectorSkillState,
  type MasteryResult,
  type RankedCandidate
} from './lesson/strandSelector';

// --- read the Learner Model slice the selector needs ------------------------
// A focused projection of skillStates (NOT the full LearnerModelView, which also
// shapes parent phrases) so the selector's input contract stays structural.
// Exposed as an internal query so the prewarm action (which has no `db`) can
// gather the selector's inputs in one round-trip.
export const selectorSkills = internalQuery({
  args: { childId: v.id('children') },
  handler: async (ctx, { childId }): Promise<SelectorSkillState[]> => {
    const rows = await ctx.db
      .query('skillStates')
      .withIndex('by_child', (q) => q.eq('childId', childId))
      .collect();
    return rows.map((s) => ({
      skillTag: s.skillTag,
      level: s.level as SelectorSkillState['level'],
      levelScore: s.levelScore,
      confidence: s.confidence,
      evidenceCount: s.evidenceCount,
      lastSeen: s.lastSeen
    }));
  }
});

// Per-skill recent mastery outcomes + unresolved session counts, derived from
// the sessionEvents log so the selector has the recency + stuck signals it
// needs without a parallel staleness table.
export const masterySignals = internalQuery({
  args: { childId: v.id('children') },
  handler: async (
    ctx,
    { childId }
  ): Promise<{ recent: Record<string, MasteryResult[]>; unresolvedCounts: Record<string, number> }> => {
    const events = await ctx.db
      .query('sessionEvents')
      .withIndex('by_child', (q) => q.eq('childId', childId))
      .collect();
    events.sort((a, b) => a.at - b.at);

    const recent: Record<string, MasteryResult[]> = {};
    const unresolvedStreak: Record<string, number> = {};
    const unresolvedCounts: Record<string, number> = {};

    for (const ev of events) {
      if (ev.type !== 'mastery_result') continue;
      const m = ev.meta ?? {};
      const skillTag = typeof m.skillTag === 'string' ? m.skillTag : undefined;
      // Lesson engine mastery_result events (from #7 engine) carry only `result`
      // and take the plan's skillTag. Diagnostic mastery_result carries skillTag.
      const result = m.result as MasteryResult | undefined;
      if (!result || !skillTag) continue;

      (recent[skillTag] ??= []).push(result);
      if (result === 'unresolved') {
        unresolvedStreak[skillTag] = (unresolvedStreak[skillTag] ?? 0) + 1;
      } else {
        unresolvedStreak[skillTag] = 0;
      }
      // the current unresolved streak IS the count the selector uses for "stuck"
      unresolvedCounts[skillTag] = unresolvedStreak[skillTag] ?? 0;
    }
    return { recent, unresolvedCounts };
  }
});

// Resolve the plan id for one candidate: generate+validate, or fall back to
// the Strand Anchor. Logs the attempt + outcome as a session event for #15.
async function prepareCandidate(
  ctx: ActionCtx,
  childId: Id<'children'>,
  candidate: RankedCandidate,
  now: number
): Promise<{ planId: Id<'lessonPlans'>; source: 'generated' | 'anchor' } | null> {
  // Generate via the existing #7 pipeline (plans.generate -> insertDraft ->
  // validatePlan -> approve). It already retries once on validation failure
  // and returns { ok, planId } or { ok:false, errors }.
  const gen = await ctx.runAction(api.plans.generate, {
    skillTag: candidate.skillTag,
    ageBand: '7-10'
  });

  if (gen.ok && gen.planId) {
    await ctx.runMutation(api.plans.approve, { planId: gen.planId });
    await logPrewarmEvent(ctx, childId, {
      strand: candidate.strand,
      skillTag: candidate.skillTag,
      outcome: 'generated',
      now
    });
    return { planId: gen.planId, source: 'generated' };
  }

  // Fallback: the Strand Anchor for this strand. Anchors are seeded approved at
  // deploy time (seedAnchors), so this is a read, never a validation at fallback
  // time — the fail-safe is guaranteed valid.
  const anchor = await resolveAnchor(ctx, candidate.strand);
  await logPrewarmEvent(ctx, childId, {
    strand: candidate.strand,
    skillTag: candidate.skillTag,
    outcome: 'anchor_fallback',
    reason: 'validation_failed',
    errors: gen.errors ?? [],
    now
  });
  return anchor ? { planId: anchor, source: 'anchor' } : null;
}

// Fetch the seeded-approved Strand Anchor's planId by its stable lessonId.
async function resolveAnchor(
  ctx: ActionCtx,
  strand: Strand
): Promise<Id<'lessonPlans'> | null> {
  const lessonId = ANCHOR_LESSON_IDS[strand];
  const row = await ctx.runQuery(api.plans.list, {});
  // list returns all plans; find the approved anchor by lessonId.
  const anchor = row.find((p) => p.lessonId === lessonId && p.status === 'approved');
  return (anchor?._id as Id<'lessonPlans'>) ?? null;
}

// Log a prewarm_outcome event on the child's event ledger. #15's fallback-rate
// metric reads these (no bespoke counter; the event log is the correct home).
async function logPrewarmEvent(
  ctx: ActionCtx,
  childId: Id<'children'>,
  details: {
    strand: Strand;
    skillTag: string;
    outcome: 'generated' | 'anchor_fallback';
    reason?: string;
    errors?: string[];
    now: number;
  }
): Promise<void> {
  await ctx.runMutation(internal.prewarm.logEvent, {
    childId,
    type: 'prewarm_outcome',
    meta: {
      strand: details.strand,
      skillTag: details.skillTag,
      outcome: details.outcome,
      reason: details.reason,
      errors: details.errors
    },
    at: details.now
  });
}

// --- the pre-warm action (session-end / diagnostic-end hook) ---------------
// Runs the selector and primes the queuedPlans cache for the top N strands.
// Idempotent: prunes the cache to the new top strands each run. Safe to run at
// every session-end; cheap when the top strands are unchanged.
export const prewarm = internalAction({
  args: { childId: v.id('children') },
  handler: async (ctx, { childId }): Promise<{ ok: true; prepared: number; strands: string[] }> => {
    const now = Date.now();

    const [skills, signals] = await Promise.all([
      ctx.runQuery(internal.prewarm.selectorSkills, { childId }),
      ctx.runQuery(internal.prewarm.masterySignals, { childId })
    ]);
    const { recent, unresolvedCounts } = signals;

    // No skill states yet (e.g. pre-diagnostic) — nothing to pre-warm.
    if (skills.length === 0) {
      await ctx.runMutation(internal.prewarm.pruneCache, { childId, keepStrands: [], now });
      return { ok: true, prepared: 0, strands: [] };
    }

    const ranked = selectStrand({ skills, recentMasteryResults: recent, unresolvedCounts, now });

    // First-ever lesson (no prior lesson session): the diagnostic-end hook is
    // the trigger, and the selector runs from diagnostic skill estimates. The
    // ranked list drives the cache the same way.

    const top = ranked.slice(0, PREWARM_CACHE_SIZE);
    const preparedStrands: string[] = [];

    for (const candidate of top) {
      const prepared = await prepareCandidate(ctx, childId, candidate, now);
      if (!prepared) continue;
      preparedStrands.push(candidate.strand);
      await ctx.runMutation(internal.prewarm.upsertQueued, {
        childId,
        strand: candidate.strand,
        skillTag: candidate.skillTag,
        planId: prepared.planId,
        source: prepared.source,
        rank: candidate.rank,
        now
      });
    }

    // Prune: drop queued plans whose strand is no longer in the top set (a
    // mastered skill's queued plan is dropped).
    await ctx.runMutation(internal.prewarm.pruneCache, { childId, keepStrands: preparedStrands, now });

    return { ok: true, prepared: preparedStrands.length, strands: preparedStrands };
  }
});

// Prune the queuedPlans cache to the given strands. Rows for strands no longer
// in the top set are deleted. internalMutation so the action can call it.
export const pruneCache = internalMutation({
  args: { childId: v.id('children'), keepStrands: v.array(v.string()), now: v.number() },
  handler: async (ctx, { childId, keepStrands, now }) => {
    const rows = await ctx.db
      .query('queuedPlans')
      .withIndex('by_child', (q) => q.eq('childId', childId))
      .collect();
    const keep = new Set(keepStrands);
    for (const r of rows) {
      if (!keep.has(r.strand)) await ctx.db.delete(r._id);
    }
  }
});

// Upsert a queued plan row (one per child per strand).
export const upsertQueued = internalMutation({
  args: {
    childId: v.id('children'),
    strand: v.string(),
    skillTag: v.string(),
    planId: v.id('lessonPlans'),
    source: v.string(),
    rank: v.number(),
    now: v.number()
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('queuedPlans')
      .withIndex('by_child_strand', (q) => q.eq('childId', args.childId).eq('strand', args.strand))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        skillTag: args.skillTag,
        planId: args.planId,
        source: args.source,
        rank: args.rank,
        createdAt: existing.createdAt,
        generatedAt: args.now
      });
      return existing._id;
    }
    return await ctx.db.insert('queuedPlans', {
      childId: args.childId,
      strand: args.strand,
      skillTag: args.skillTag,
      planId: args.planId,
      source: args.source,
      rank: args.rank,
      createdAt: args.now,
      generatedAt: args.now
    });
  }
});

// Log a prewarm event on the sessionEvents ledger.
export const logEvent = internalMutation({
  args: {
    childId: v.id('children'),
    type: v.string(),
    meta: v.any(),
    at: v.number()
  },
  handler: async (ctx, { childId, type, meta, at }) => {
    await ctx.db.insert('sessionEvents', { childId, type, meta, at });
  }
});

// --- the session-start read: resolve a queued, validated plan --------------
// No synchronous generation. Returns the rank-1 queued plan, or the strand's
// anchor if no queued plan exists yet (e.g. first lesson, pre-warm still running
// — session-start never blocks on generation).
export const resolveNext = query({
  args: { childId: v.id('children') },
  handler: async (ctx, { childId }): Promise<{
    planId: Id<'lessonPlans'> | null;
    strand: Strand | null;
    skillTag: string | null;
    source: 'queued' | 'anchor' | null;
  }> => {
    const queued = await ctx.db
      .query('queuedPlans')
      .withIndex('by_child', (q) => q.eq('childId', childId))
      .order('asc')
      .collect();
    const top = queued.sort((a, b) => a.rank - b.rank)[0];
    if (top) {
      return {
        planId: top.planId,
        strand: top.strand as Strand,
        skillTag: top.skillTag,
        source: 'queued'
      };
    }
    return { planId: null, strand: null, skillTag: null, source: 'anchor' };
  }
});

// Seed (idempotently) all five Strand Anchors as approved, validated at deploy
// time — the fail-safe floor. The existing seedArrays (#7) is the multiplication
// & division anchor; this authors the four new ones and validates every anchor.
export const seedAnchors = mutation({
  args: {},
  handler: async (ctx) => {
    const seeded: string[] = [];
    for (const strand of Object.keys(STRAND_ANCHORS) as Strand[]) {
      const plan = STRAND_ANCHORS[strand];
      const { ok, errors } = validatePlan(plan);
      if (!ok) throw new Error(`anchor invalid for strand ${strand}: ${errors.join(', ')}`);
      const existing = await ctx.db
        .query('lessonPlans')
        .withIndex('by_lessonId', (q) => q.eq('lessonId', plan.lessonId))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          status: 'approved',
          plan,
          approvedAt: Date.now()
        });
        seeded.push(plan.lessonId);
        continue;
      }
      await ctx.db.insert('lessonPlans', {
        lessonId: plan.lessonId,
        skillTag: plan.skillTag,
        title: plan.title,
        status: 'approved',
        plan,
        generatedBy: 'hand-authored',
        createdAt: Date.now(),
        approvedAt: Date.now()
      });
      seeded.push(plan.lessonId);
    }
    return { ok: true as const, seeded };
  }
});

// Re-export the selector + threshold constants for convenience (engine + tests).
export { selectStrand, STUCK_THRESHOLD_UNRESOLVED, PREWARM_CACHE_SIZE };
