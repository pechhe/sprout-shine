import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { validateInterviewResult, type InterviewResult } from './lesson/interview';
import { STRAND_LABELS, type SkillStrand } from './lesson/vocab';

// #22 — the Parent Interview store, realising issue #2's "parent interview"
// intent (the placeholder form is gone). The record is populated ONLY by the
// tool-gated submitInterviewResult mutation the interviewer calls during the
// Realtime conversation; model proposes, system disposes (ADR-0001). One row
// per child, upserted on re-interview. focusStrand is nullable — null means
// "the selector decides", a graceful completion outcome.

// Normalize the validated result to the DB row shape: schema stores focusStrand as
// `v.optional(v.string())` (string | undefined), but the validator models it as
// `SkillStrand | null`. null means "selector decides" and is stored as undefined;
// the read query maps it back to null. One boundary, one direction.
function toRow(value: InterviewResult) {
  return {
    focusStrand: value.focusStrand ?? undefined,
    findsEasy: value.findsEasy,
    avoids: value.avoids,
    whenStuck: value.whenStuck,
    triedBefore: value.triedBefore,
    wantToUnderstand: value.wantToUnderstand
  };
}

export const SUBMIT_ARGS = {
  childId: v.id('children'),
  focusStrand: v.union(v.string(), v.null()),
  findsEasy: v.string(),
  avoids: v.string(),
  whenStuck: v.string(),
  triedBefore: v.string(),
  wantToUnderstand: v.string()
} as const;

// TOOL: submit the interview result. Validates against SKILL_STRANDS +
// checkGuardrails; on pass upserts the row, on failure returns feedback without
// writing. Null focusStrand succeeds (not an error). Mirrors the
// tag_misconception / recordAttempt Realtime-tool-gated mutation pattern.
export const submitInterviewResult = mutation({
  args: SUBMIT_ARGS,
  handler: async (
    ctx,
    { childId, focusStrand, findsEasy, avoids, whenStuck, triedBefore, wantToUnderstand }
  ) => {
    const result = validateInterviewResult({
      focusStrand: focusStrand as string | null,
      findsEasy,
      avoids,
      whenStuck,
      triedBefore,
      wantToUnderstand
    });
    if (!result.ok) return result; // tell the interviewer what to fix; no write
    const value = result.value;

    const existing = await ctx.db
      .query('interviews')
      .withIndex('by_child', (q) => q.eq('childId', childId))
      .unique();
    const focusStrandValue = value.focusStrand;
    if (existing) {
      await ctx.db.patch(existing._id, { ...toRow(value), updatedAt: Date.now() });
      return { ok: true as const, saved: true, _id: existing._id };
    }
    const _id = await ctx.db.insert('interviews', {
      childId,
      ...toRow(value),
      updatedAt: Date.now()
    });
    return { ok: true as const, saved: true, _id };
  }
});

// PARTICIPATION-BASED COMPLETION: the parent is never trapped behind a voice
// conversation. Ended-early, disconnect, or instant bail all write whatever was
// captured — including a null focusStrand (selector decides). This is the
// "ended early / abandoned" path: it always succeeds and never blocks the
// child's first lesson.
export const endInterviewEarly = mutation({
  args: {
    childId: v.id('children'),
    focusStrand: v.optional(v.union(v.string(), v.null())),
    findsEasy: v.optional(v.string()),
    avoids: v.optional(v.string()),
    whenStuck: v.optional(v.string()),
    triedBefore: v.optional(v.string()),
    wantToUnderstand: v.optional(v.string())
  },
  handler: async (ctx, input) => {
    // Coerce through the same validator so even an early-end can't smuggle a
    // minted strand or a label past the guardrail; blanks are valid.
    const result = validateInterviewResult({
      focusStrand: input.focusStrand ?? null,
      findsEasy: input.findsEasy ?? '',
      avoids: input.avoids ?? '',
      whenStuck: input.whenStuck ?? '',
      triedBefore: input.triedBefore ?? '',
      wantToUnderstand: input.wantToUnderstand ?? ''
    });
    const value = result.ok ? result.value : { focusStrand: null, findsEasy: '', avoids: '', whenStuck: '', triedBefore: '', wantToUnderstand: '' };

    const existing = await ctx.db
      .query('interviews')
      .withIndex('by_child', (q) => q.eq('childId', input.childId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...toRow(value), updatedAt: Date.now() });
      return { ok: true as const, _id: existing._id };
    }
    const _id = await ctx.db.insert('interviews', {
      childId: input.childId,
      ...toRow(value),
      updatedAt: Date.now()
    });
    return { ok: true as const, _id };
  }
});

// Read the stored interview for a child (the Focus Strand the Strand Selector
// #14 reads, and the dashboard's founder-eyeball surface #22 story 23).
export const forChild = query({
  args: { childId: v.id('children') },
  handler: async (ctx, { childId }) => {
    const row = await ctx.db
      .query('interviews')
      .withIndex('by_child', (q) => q.eq('childId', childId))
      .unique();
    if (!row) return null;
    return {
      focusStrand: (row.focusStrand ?? null) as SkillStrand | null,
      focusLabel: row.focusStrand ? STRAND_LABELS[row.focusStrand as SkillStrand] ?? null : null,
      findsEasy: row.findsEasy,
      avoids: row.avoids,
      whenStuck: row.whenStuck,
      triedBefore: row.triedBefore,
      wantToUnderstand: row.wantToUnderstand,
      updatedAt: row.updatedAt
    };
  }
});

// Internal helper for the realtime token action: load the stored context to
// ground a re-interview conversation in what was said before.
export async function loadInterview(ctx: QueryCtx, childId: Id<'children'>) {
  return await ctx.db
    .query('interviews')
    .withIndex('by_child', (q) => q.eq('childId', childId))
    .unique();
}
