import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// #1 — store a founder-pilot application from the public landing page.
export const submit = mutation({
  args: {
    parentName: v.string(),
    email: v.string(),
    childAge: v.number(),
    mathsExperience: v.string(),
    triedBefore: v.string(),
    wantToUnderstand: v.string(),
    weeklyAvailability: v.string(),
    interviewAvailability: v.string(),
    willingnessToPay: v.string(),
    privacyConcerns: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('applications', {
      ...args,
      status: 'new',
      createdAt: Date.now()
    });
  }
});

// Reviewable list for the team (used by the pilot console later).
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('applications').withIndex('by_createdAt').order('desc').collect();
  }
});
