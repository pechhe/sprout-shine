// #12 — Parent Feedback persistence + consent gate. The pure channel/source/
// decay/re-consent logic lives in ./lesson/feedback.ts; this file is the only
// thing that touches the `parentFeedback` table and the only thing that writes
// a parent-source update to the Learner Model. Model-channel feedback is a
// sibling source fed through the existing reducers (ADR-0002 #1 widened);
// presentation-channel feedback is read only by Digest generation layer 1.
//
// Consent gate: feedback honours `consents.settings.weeklyDigest`. A parent who
// has turned insights off cannot push back on a digest they can't see.

import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { isPatternTag } from './lesson/vocab';
import type { PatternSignalTag } from './lesson/vocab';
import {
  applySkillFeedback,
  makeParentPatternObservation,
  validateFeedback,
  channelForReaction,
  type ParentFeedbackRecord,
  type FeedbackReaction,
  type FeedbackSection
} from './lesson/feedback';
import {
  updatePatternSignal,
  decaySince,
  type PatternSignalInput,
  type PatternSignalResult
} from './lesson/learnerModel';

async function loadConsent(ctx: QueryCtx, childId: Id<'children'>) {
  return ctx.db
    .query('consents')
    .withIndex('by_child', (q) => q.eq('childId', childId))
    .unique();
}

// The target validator's controlled vocabulary lives in the pure module; here we
// only coerce the raw stored args into that typed shape.
type TargetShape =
  | { kind: 'digest' }
  | { kind: 'section'; section: FeedbackSection }
  | { kind: 'evidence'; section: FeedbackSection; targetRef: string };

const VALID_SECTIONS: FeedbackSection[] = ['improved', 'tricky', 'patterns', 'shine', 'home'];

function coerceTarget(raw: unknown): TargetShape | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Record<string, unknown>;
  if (t.kind === 'digest') return { kind: 'digest' };
  if (t.kind === 'section') {
    const section = t.section as FeedbackSection;
    if (!VALID_SECTIONS.includes(section)) return null;
    return { kind: 'section', section };
  }
  if (t.kind === 'evidence') {
    const section = t.section as FeedbackSection;
    if (!VALID_SECTIONS.includes(section)) return null;
    if (typeof t.targetRef !== 'string') return null;
    return { kind: 'evidence', section, targetRef: t.targetRef };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Submit. Validates, persists the feedback record, and — for model-channel
// feedback — applies the source-scaled parent pinch to the matched Pattern
// Signal or Skill State via the existing reducers. Presentation-channel
// feedback only persists (layer 1 reads it later; it never touches confidence).
// ---------------------------------------------------------------------------

export const submit = mutation({
  args: {
    childId: v.id('children'),
    digestId: v.id('digests'),
    reaction: v.string(),
    target: v.any()
  },
  handler: async (
    ctx,
    { childId, digestId, reaction, target }
  ): Promise<{ ok: true } | { ok: false; reason: string }> => {
    // Consent gate — no feedback on a digest the parent opted out of.
    const consent = await loadConsent(ctx, childId);
    if (!consent?.settings.weeklyDigest) {
      return { ok: false, reason: 'weeklyDigest consent off' };
    }

    const coerced = coerceTarget(target);
    if (!coerced) return { ok: false, reason: 'invalid target' };
    const channel = channelForReaction(reaction as FeedbackReaction);

    const at = Date.now();
    const record: ParentFeedbackRecord = {
      childId,
      digestId,
      channel,
      reaction: reaction as FeedbackReaction,
      target: coerced,
      at
    };
    const v = validateFeedback(record);
    if (!v.ok) return { ok: false, reason: v.reason };

    await ctx.db.insert('parentFeedback', {
      childId,
      digestId,
      channel,
      reaction: record.reaction,
      target: coerced,
      at
    });

    // Model channel → apply the humble pinch through the reducer.
    if (channel === 'model' && coerced.kind === 'evidence') {
      if (coerced.section === 'patterns' && isPatternTag(coerced.targetRef)) {
        await applyPatternFeedback(ctx, childId, record.reaction, coerced.targetRef, at);
      } else if (coerced.section === 'improved' || coerced.section === 'tricky') {
        await applySkillFeedbackToState(ctx, childId, coerced.targetRef, record.reaction, at);
      }
    }

    return { ok: true };
  }
});

// Apply a model-channel pinch to one Pattern Signal. Folds the parent
// observation onto the (decayed) prior via the single shared reducer — the
// same function `refreshPatterns` uses — so recomputability holds.
async function applyPatternFeedback(
  ctx: MutationCtx,
  childId: Id<'children'>,
  reaction: FeedbackReaction,
  tag: PatternSignalTag,
  at: number
) {
  const row = await ctx.db
    .query('patternSignals')
    .withIndex('by_child_tag', (q) => q.eq('childId', childId).eq('tag', tag))
    .unique();

  const prior: PatternSignalInput | null = row
    ? {
        // Decay the stored confidence to `now` before folding (lazy read).
        score: row.score,
        confidence: decaySince(row.confidence, row.lastSeen, at),
        evidenceCount: row.evidenceCount,
        source: row.source as PatternSignalInput['source'],
        lastSeen: row.lastSeen
      }
    : null;

  const obs = makeParentPatternObservation(
    reaction as 'sounds_right' | "doesn't_sound_right",
    tag,
    at
  );
  const next: PatternSignalResult = updatePatternSignal(prior, obs);

  if (row) {
    await ctx.db.patch(row._id, {
      level: next.level,
      score: next.score,
      confidence: next.confidence,
      evidenceCount: next.evidenceCount,
      source: next.source,
      lastSeen: next.lastSeen,
      updatedAt: next.updatedAt
    });
  } else {
    await ctx.db.insert('patternSignals', {
      childId,
      tag,
      level: next.level,
      score: next.score,
      confidence: next.confidence,
      evidenceCount: next.evidenceCount,
      source: next.source,
      lastSeen: next.lastSeen,
      updatedAt: next.updatedAt
    });
  }
}

// Apply a model-channel pinch to one Skill State. Confidence-only; the level
// and levelScore are frozen (ADR-0002 #3 — the parent doubts the estimate, they
// do not assert a new level).
async function applySkillFeedbackToState(
  ctx: MutationCtx,
  childId: Id<'children'>,
  skillTag: string,
  reaction: FeedbackReaction,
  at: number
) {
  const row = await ctx.db
    .query('skillStates')
    .withIndex('by_child_skill', (q) => q.eq('childId', childId).eq('skillTag', skillTag))
    .unique();
  if (!row) return; // no skill state to doubt

  const reacted = applySkillFeedback(
    {
      level: row.level as 'emerging' | 'developing' | 'secure',
      levelScore: row.levelScore,
      // Decay the stored confidence to now before nudging (lazy read).
      confidence: decaySince(row.confidence, row.lastSeen, at),
      evidenceCount: row.evidenceCount,
      source: row.source,
      lastSeen: row.lastSeen
    },
    reaction as 'sounds_right' | "doesn't_sound_right",
    at
  );
  await ctx.db.patch(row._id, {
    confidence: reacted.confidence,
    source: reacted.source,
    lastSeen: reacted.lastSeen,
    updatedAt: at
    // level + levelScore deliberately untouched.
  });
}

// ---------------------------------------------------------------------------
// Read surface
// ---------------------------------------------------------------------------

/** All feedback for a child (layer 1 + the parent UI read their own reactions). */
export const listForChild = query({
  args: { childId: v.id('children') },
  handler: async (ctx, { childId }) =>
    ctx.db
      .query('parentFeedback')
      .withIndex('by_child', (q) => q.eq('childId', childId))
      .order('desc')
      .collect()
});

/** Feedback pinned to one digest (the parent UI shows earlier reactions). */
export const listForDigest = query({
  args: { childId: v.id('children'), digestId: v.id('digests') },
  handler: async (ctx, { childId, digestId }) =>
    ctx.db
      .query('parentFeedback')
      .withIndex('by_child_digest', (q) => q.eq('childId', childId).eq('digestId', digestId))
      .collect()
});
