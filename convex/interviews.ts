import { mutation } from './_generated/server';
import { v } from 'convex/values';

// #2 — save / update the parent interview for a child.
export const save = mutation({
  args: {
    childId: v.id('children'),
    findsEasy: v.string(),
    avoids: v.string(),
    whenStuck: v.string(),
    triedBefore: v.string(),
    wantToUnderstand: v.string()
  },
  handler: async (ctx, { childId, ...answers }) => {
    const existing = await ctx.db
      .query('interviews')
      .withIndex('by_child', (q) => q.eq('childId', childId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...answers, updatedAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert('interviews', { childId, ...answers, updatedAt: Date.now() });
  }
});
