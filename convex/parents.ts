import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// #2 — find-or-create a parent identified by an opaque client key (no auth yet).
export const ensure = mutation({
  args: { parentKey: v.string() },
  handler: async (ctx, { parentKey }) => {
    const existing = await ctx.db
      .query('parents')
      .withIndex('by_parentKey', (q) => q.eq('parentKey', parentKey))
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert('parents', {
      parentKey,
      isGuardian: false,
      createdAt: Date.now()
    });
  }
});

// #2 — record guardian confirmation + basic contact details.
export const confirmGuardian = mutation({
  args: {
    parentKey: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string())
  },
  handler: async (ctx, { parentKey, name, email }) => {
    const parent = await ctx.db
      .query('parents')
      .withIndex('by_parentKey', (q) => q.eq('parentKey', parentKey))
      .unique();
    const id =
      parent?._id ??
      (await ctx.db.insert('parents', { parentKey, isGuardian: false, createdAt: Date.now() }));
    await ctx.db.patch(id, { isGuardian: true, name, email });
    return id;
  }
});

// Read the full parent + child + consent state for the dashboard.
export const dashboard = query({
  args: { parentKey: v.string() },
  handler: async (ctx, { parentKey }) => {
    const parent = await ctx.db
      .query('parents')
      .withIndex('by_parentKey', (q) => q.eq('parentKey', parentKey))
      .unique();
    if (!parent) return null;
    const children = await ctx.db
      .query('children')
      .withIndex('by_parent', (q) => q.eq('parentId', parent._id))
      .collect();
    const child = children[0] ?? null;
    let interview = null;
    let consent = null;
    if (child) {
      interview = await ctx.db
        .query('interviews')
        .withIndex('by_child', (q) => q.eq('childId', child._id))
        .unique();
      consent = await ctx.db
        .query('consents')
        .withIndex('by_child', (q) => q.eq('childId', child._id))
        .unique();
    }
    return { parent, child, interview, consent };
  }
});

// #22 — minimal child-profile read for the parent-interview token action. The
// interviewer needs the child's nickname to ground the conversation; it does not
// need the whole dashboard graph.
export const childForInterview = query({
  args: { childId: v.id('children') },
  handler: async (ctx, { childId }) => {
    const child = await ctx.db.get(childId);
    if (!child) return null;
    return { _id: child._id, nickname: child.nickname, age: child.age };
  }
});
