import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// #5 — start a lesson session and record the session_start event.
export const start = mutation({
  args: {
    childId: v.id('children'),
    lessonId: v.string(),
    mode: v.string()
  },
  handler: async (ctx, { childId, lessonId, mode }) => {
    const sessionId = await ctx.db.insert('sessions', {
      childId,
      lessonId,
      status: 'active',
      mode,
      startedAt: Date.now()
    });
    await ctx.db.insert('sessionEvents', {
      sessionId,
      childId,
      type: 'session_start',
      meta: { lessonId, mode },
      at: Date.now()
    });
    return sessionId;
  }
});

// #5 — record a single session event (turn, repeat, guardrail…).
export const recordEvent = mutation({
  args: {
    sessionId: v.id('sessions'),
    childId: v.id('children'),
    type: v.string(),
    role: v.optional(v.string()),
    text: v.optional(v.string()),
    meta: v.optional(v.any())
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('sessionEvents', { ...args, at: Date.now() });
  }
});

// #15 — emit a `digest_opened` engagement signal when a parent opens their
// weekly digest. Keyed by digestId so "digest views" can be counted. No
// lesson session is involved, so sessionId is omitted (it is optional on the
// event ledger for exactly this case). This is the single write #15 introduces;
// the metrics dashboard itself is read-only.
export const recordDigestOpen = mutation({
  args: { childId: v.id('children'), digestId: v.id('digests') },
  handler: async (ctx, { childId, digestId }) => {
    await ctx.db.insert('sessionEvents', {
      childId,
      type: 'digest_opened',
      meta: { digestId },
      at: Date.now()
    });
    return { ok: true as const };
  }
});

// #5 — end a session and record the session_end event.
export const end = mutation({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session || session.status === 'ended') return;
    await ctx.db.patch(sessionId, { status: 'ended', endedAt: Date.now() });
    await ctx.db.insert('sessionEvents', {
      sessionId,
      childId: session.childId,
      type: 'session_end',
      meta: { durationMs: Date.now() - session.startedAt },
      at: Date.now()
    });
  }
});

// Read a session with its events (used for review later).
export const withEvents = query({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return null;
    const events = await ctx.db
      .query('sessionEvents')
      .withIndex('by_session', (q) => q.eq('sessionId', sessionId))
      .collect();
    return { session, events };
  }
});
