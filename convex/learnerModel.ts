// #10 — Learner Model persistence + read surface. The pure reducer lives in
// ./lesson/learnerModel.ts; this file is the only thing that touches the
// `skillStates` / `patternSignals` tables. Diagnostic (#9) and lesson (#7)
// evidence both flow through `applyOutcome` — one honest code path. The whole
// model is recomputable from the immutable `sessionEvents` log via `recompute`.
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { isPatternTag } from './lesson/vocab';
import { parentSkillView, type SkillLevel } from './lesson/skillState';
import type { PatternSignalTag } from './lesson/vocab';
import { makeParentPatternObservation, channelForReaction } from './lesson/feedback';
import type { ParentFeedbackRecord } from './lesson/feedback';
import {
  blendSkillState,
  decaySince,
  detectPatternObservations,
  foldPatternSignal,
  skillOutcomeFromEvent,
  updatePatternSignal,
  type PatternObservation,
  type PatternSignalResult,
  type SkillOutcome,
  type SkillStateResult
} from './lesson/learnerModel';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Apply one Skill Outcome to a child's Skill State. The single write path used
 * by both the diagnostic and the lesson engine. Folds staleness (decay) into
 * the prior confidence before blending, so a gap is persisted on write.
 */
export async function applyOutcome(
  ctx: MutationCtx,
  childId: Id<'children'>,
  outcome: SkillOutcome
): Promise<SkillStateResult> {
  const prior = await ctx.db
    .query('skillStates')
    .withIndex('by_child_skill', (q) => q.eq('childId', childId).eq('skillTag', outcome.skillTag))
    .unique();

  const priorResult: SkillStateResult | null = prior
    ? {
        level: prior.level as SkillLevel,
        levelScore: prior.levelScore,
        confidence: prior.confidence,
        evidenceCount: prior.evidenceCount,
        source: prior.source,
        lastSeen: prior.lastSeen,
        updatedAt: prior.updatedAt
      }
    : null;
  const next = blendSkillState(priorResult, outcome);

  if (prior) {
    await ctx.db.patch(prior._id, {
      level: next.level,
      levelScore: next.levelScore,
      confidence: next.confidence,
      evidenceCount: next.evidenceCount,
      lastSeen: next.lastSeen,
      source: next.source,
      updatedAt: next.updatedAt
    });
  } else {
    await ctx.db.insert('skillStates', {
      childId,
      skillTag: outcome.skillTag,
      level: next.level,
      levelScore: next.levelScore,
      confidence: next.confidence,
      evidenceCount: next.evidenceCount,
      lastSeen: next.lastSeen,
      misconceptions: [],
      source: next.source,
      updatedAt: next.updatedAt
    });
  }
  return next;
}

// Fetch a child's ordered session events (sorted by `at` for the reducers).
async function childEvents(ctx: QueryCtx | MutationCtx, childId: Id<'children'>) {
  const events = await ctx.db
    .query('sessionEvents')
    .withIndex('by_child', (q) => q.eq('childId', childId))
    .collect();
  return events.sort((a, b) => a.at - b.at);
}

/**
 * Recompute Pattern Signals for a child from the event log. Deterministic
 * detectors are authoritative where they exist; model proposals (from
 * `tag_pattern`) are folded at lower confidence. Upserts only — never deletes
 * (a stale signal decays on read; `recompute` is the explicit reset path).
 */
export async function refreshPatterns(
  ctx: MutationCtx,
  childId: Id<'children'>
): Promise<void> {
  const events = await childEvents(ctx, childId);

  // Deterministic observations over the log.
  const observations: PatternObservation[] = detectPatternObservations(events);
  // Model-proposed patterns from the `pattern_proposal` event stream.
  for (const ev of events) {
    if (ev.type !== 'pattern_proposal') continue;
    const tag = ev.meta?.tag as string | undefined;
    if (!tag || !isPatternTag(tag)) continue;
    observations.push({
      tag,
      supports: true,
      source: 'model',
      confidence: typeof ev.meta?.confidence === 'number' ? ev.meta.confidence : 0.25,
      timestamp: ev.at
    });
  }

  // #12 — model-channel parent feedback is a sibling interpretation source
  // (ADR-0004 #1): fold each doesnt_sound_right / sounds_right on a pattern as
  // a low-weight source:'parent' observation, in timestamp order with the rest.
  const feedback = await ctx.db
    .query('parentFeedback')
    .withIndex('by_child', (q) => q.eq('childId', childId))
    .collect();
  for (const fb of feedback) {
    if (channelForReaction(fb.reaction as ParentFeedbackRecord['reaction']) !== 'model') continue;
    const t = fb.target as { kind?: string; section?: string; targetRef?: string };
    if (t.kind !== 'evidence' || t.section !== 'patterns') continue;
    if (!t.targetRef || !isPatternTag(t.targetRef)) continue;
    observations.push(makeParentPatternObservation(fb.reaction as 'sounds_right' | "doesn't_sound_right", t.targetRef, fb.at));
  }
  // Deterministic order: fold in timestamp order so a recompute reproduces the
  // incremental write path regardless of source mixing.
  observations.sort((a, b) => a.timestamp - b.timestamp);

  // Group by tag and fold into one signal each.
  const byTag = new Map<PatternSignalTag, PatternObservation[]>();
  for (const obs of observations) {
    const arr = byTag.get(obs.tag) ?? [];
    arr.push(obs);
    byTag.set(obs.tag, arr);
  }

  const existing = await ctx.db
    .query('patternSignals')
    .withIndex('by_child', (q) => q.eq('childId', childId))
    .collect();
  const existingByTag = new Map(existing.map((e) => [e.tag, e]));

  for (const [tag, obs] of byTag) {
    // Fold in order; reflect the single shared folding function.
    let signal: PatternSignalResult | null = null;
    for (const o of obs) {
      signal = updatePatternSignal(
        signal
          ? {
              score: signal.score,
              confidence: signal.confidence,
              evidenceCount: signal.evidenceCount,
              source: signal.source,
              lastSeen: signal.lastSeen
            }
          : null,
        o
      );
    }
    if (!signal) continue;
    const row = existingByTag.get(tag);
    if (row) {
      await ctx.db.patch(row._id, {
        level: signal.level,
        score: signal.score,
        confidence: signal.confidence,
        evidenceCount: signal.evidenceCount,
        source: signal.source,
        lastSeen: signal.lastSeen,
        updatedAt: signal.updatedAt
      });
    } else {
      await ctx.db.insert('patternSignals', {
        childId,
        tag,
        level: signal.level,
        score: signal.score,
        confidence: signal.confidence,
        evidenceCount: signal.evidenceCount,
        lastSeen: signal.lastSeen,
        source: signal.source,
        updatedAt: signal.updatedAt
      });
    }
  }
}

// --- humble, parent-facing phrases for Pattern Signals (no diagnosis) ---
const PATTERN_PHRASES_PRESENT: Record<string, string> = {
  benefits_from_visuals: 'seems to thrive when they can see and move the maths',
  rushes_when_confident: 'sometimes rushes when feeling confident',
  persists_after_hint: 'keeps trying after a nudge — real persistence',
  avoids_explaining: 'still growing in confidence explaining their thinking',
  responds_to_story_context: 'responds well to stories and characters',
  loses_focus_on_long_explanation: 'does better with shorter explanations'
};

export type SkillStateView = {
  skillTag: string;
  level: SkillLevel;
  levelScore: number;
  confidence: number;
  evidenceCount: number;
  lastSeen: number;
  source: string;
  phrase: string;
  stale: boolean;
};

export type PatternSignalView = {
  tag: string;
  level: 'present' | 'absent';
  score: number;
  confidence: number;
  evidenceCount: number;
  lastSeen: number;
  source: string;
  phrase: string | null;
  stale: boolean;
};

export type LearnerModelView = {
  skills: SkillStateView[];
  patterns: PatternSignalView[];
};

/**
 * The single read consumed by lesson selection (future) and the weekly digest
 * (#11). Applies decay lazily on read (level never decays). Phrases stay humble
 * — never a score or a diagnosis.
 */
export const read = query({
  args: { childId: v.id('children') },
  handler: async (ctx, { childId }): Promise<LearnerModelView> => {
    const now = Date.now();
    const skills = await ctx.db
      .query('skillStates')
      .withIndex('by_child', (q) => q.eq('childId', childId))
      .collect();
    const patterns = await ctx.db
      .query('patternSignals')
      .withIndex('by_child', (q) => q.eq('childId', childId))
      .collect();

    const skillViews: SkillStateView[] = skills
      .map((s) => {
        const level = s.level as SkillLevel;
        const conf = decaySince(s.confidence, s.lastSeen, now);
        return {
          skillTag: s.skillTag,
          level,
          levelScore: s.levelScore,
          confidence: conf,
          evidenceCount: s.evidenceCount,
          lastSeen: s.lastSeen,
          source: s.source,
          phrase: parentSkillView(s.skillTag, level).phrase,
          stale: (now - s.lastSeen) / DAY_MS > 14
        };
      })
      .sort((a, b) => b.confidence - a.confidence);

    const patternViews: PatternSignalView[] = patterns
      .map((p) => ({
        tag: p.tag,
        level: p.level as 'present' | 'absent',
        score: p.score,
        confidence: decaySince(p.confidence, p.lastSeen, now),
        evidenceCount: p.evidenceCount,
        lastSeen: p.lastSeen,
        source: p.source,
        phrase: p.level === 'present' ? PATTERN_PHRASES_PRESENT[p.tag] ?? null : null,
        stale: (now - p.lastSeen) / DAY_MS > 14
      }))
      .sort((a, b) => b.confidence - a.confidence);

    return { skills: skillViews, patterns: patternViews };
  }
});

/**
 * Full rebuild of the Learner Model from the immutable sessionEvents log — the
 * property parent corrections (#12) and admin review (#13) rely on. Deletes and
 * re-derives both skillStates and patternSignals.
 */
export const recompute = mutation({
  args: { childId: v.id('children') },
  handler: async (ctx, { childId }) => {
    const events = await childEvents(ctx, childId);

    // --- skillStates: fold resolved task_attempt outcomes in order ---
    const folded = new Map<string, SkillStateResult>();
    for (const ev of events) {
      const outcome = skillOutcomeFromEvent(ev);
      if (!outcome) continue;
      const prev = folded.get(outcome.skillTag) ?? null;
      folded.set(outcome.skillTag, blendSkillState(prev, outcome));
    }
    const existingSkills = await ctx.db
      .query('skillStates')
      .withIndex('by_child', (q) => q.eq('childId', childId))
      .collect();
    for (const s of existingSkills) await ctx.db.delete(s._id);
    for (const [skillTag, result] of folded) {
      await ctx.db.insert('skillStates', {
        childId,
        skillTag,
        level: result.level,
        levelScore: result.levelScore,
        confidence: result.confidence,
        evidenceCount: result.evidenceCount,
        lastSeen: result.lastSeen,
        misconceptions: [],
        source: result.source,
        updatedAt: result.updatedAt
      });
    }

    // --- patternSignals: refresh from the log (deterministic + model) ---
    await refreshPatterns(ctx, childId);
    return { ok: true, skills: folded.size };
  }
});

// Re-export the pure folding helper for convenience (engine/diagnostics use it
// via applyOutcome, but tests/inspector may want the raw blend).
export { blendSkillState, foldPatternSignal };
