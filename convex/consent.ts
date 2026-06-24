import { mutation } from './_generated/server';
import { v } from 'convex/values';

export const CONSENT_VERSION = 'v1';

const settings = v.object({
  saveAudio: v.boolean(),
  weeklyDigest: v.boolean(),
  shareWithSchool: v.boolean(),
  fullTranscriptAccess: v.boolean(),
  productImprovement: v.boolean()
});

// #3 — record guardian consent + privacy settings for a child.
export const give = mutation({
  args: { childId: v.id('children'), settings },
  handler: async (ctx, { childId, settings }) => {
    const existing = await ctx.db
      .query('consents')
      .withIndex('by_child', (q) => q.eq('childId', childId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { settings, consentedAt: Date.now(), consentVersion: CONSENT_VERSION });
      return existing._id;
    }
    return await ctx.db.insert('consents', {
      childId,
      consentVersion: CONSENT_VERSION,
      consentedAt: Date.now(),
      settings
    });
  }
});

// #3 — update a single privacy setting at any time.
export const updateSettings = mutation({
  args: { childId: v.id('children'), settings },
  handler: async (ctx, { childId, settings }) => {
    const existing = await ctx.db
      .query('consents')
      .withIndex('by_child', (q) => q.eq('childId', childId))
      .unique();
    if (!existing) throw new Error('No consent record to update');
    await ctx.db.patch(existing._id, { settings });
  }
});

// #3 — parent requests deletion of child data.
export const requestDeletion = mutation({
  args: { childId: v.id('children') },
  handler: async (ctx, { childId }) => {
    const existing = await ctx.db
      .query('consents')
      .withIndex('by_child', (q) => q.eq('childId', childId))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { deletionRequestedAt: Date.now() });
  }
});
