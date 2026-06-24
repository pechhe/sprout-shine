import { mutation } from './_generated/server';
import { v } from 'convex/values';

// #2 — create (or replace) the single child profile for a parent.
export const upsertProfile = mutation({
  args: {
    parentId: v.id('parents'),
    nickname: v.string(),
    age: v.number(),
    schoolYear: v.optional(v.string()),
    mathsConfidence: v.string(),
    mainConcern: v.optional(v.string()),
    enjoys: v.optional(v.string()),
    frustrations: v.optional(v.string()),
    preferredTone: v.optional(v.string())
  },
  handler: async (ctx, { parentId, ...profile }) => {
    const existing = await ctx.db
      .query('children')
      .withIndex('by_parent', (q) => q.eq('parentId', parentId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, profile);
      return existing._id;
    }
    return await ctx.db.insert('children', { parentId, ...profile, createdAt: Date.now() });
  }
});

// #4 — save tutor style + learning preferences from child onboarding.
export const completeOnboarding = mutation({
  args: {
    childId: v.id('children'),
    tutorStyle: v.string(),
    prefs: v.object({ pace: v.string(), hints: v.string(), likes: v.string() })
  },
  handler: async (ctx, { childId, tutorStyle, prefs }) => {
    await ctx.db.patch(childId, { tutorStyle, prefs, onboardedAt: Date.now() });
  }
});

// #4 — parent can reset the child's tutor style.
export const resetTutorStyle = mutation({
  args: { childId: v.id('children') },
  handler: async (ctx, { childId }) => {
    await ctx.db.patch(childId, { tutorStyle: undefined, onboardedAt: undefined });
  }
});
