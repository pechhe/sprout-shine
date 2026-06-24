import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * Sprout Shine data model.
 *
 * Scope so far covers the first vertical slices:
 *   #1 founder-pilot landing + application
 *   #2 parent-led signup + child profile + interview
 *   #3 consent, privacy settings, child transparency
 *   #4 child onboarding + tutor style selection
 *
 * No auth yet (per current build decision). A parent is identified by a
 * client-held `parentKey` (opaque id stored in localStorage) until real auth
 * lands. Everything child-facing hangs off a child row.
 */
export default defineSchema({
  // #1 — founder pilot applications captured from the public landing page.
  applications: defineTable({
    parentName: v.string(),
    email: v.string(),
    childAge: v.number(),
    mathsExperience: v.string(), // current maths experience, free text
    triedBefore: v.string(), // what they have already tried
    wantToUnderstand: v.string(), // what the parent wants to understand
    weeklyAvailability: v.string(), // realistic sessions per week
    interviewAvailability: v.string(), // when they can do a parent interview
    willingnessToPay: v.string(), // pricing-test signal
    privacyConcerns: v.optional(v.string()),
    cohort: v.optional(v.string()),
    status: v.string(), // "new" | "contacted" | "accepted" | "declined"
    createdAt: v.number()
  })
    .index('by_createdAt', ['createdAt'])
    .index('by_status', ['status']),

  // #2 — a parent/guardian account (no auth; identified by parentKey).
  parents: defineTable({
    parentKey: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    isGuardian: v.boolean(), // confirmed guardian before creating a child
    createdAt: v.number()
  }).index('by_parentKey', ['parentKey']),

  // #2 — one child profile per parent (MVP). Minimal data on purpose.
  children: defineTable({
    parentId: v.id('parents'),
    nickname: v.string(),
    age: v.number(),
    schoolYear: v.optional(v.string()),
    mathsConfidence: v.string(), // "shaky" | "mixed" | "confident"
    mainConcern: v.optional(v.string()),
    enjoys: v.optional(v.string()),
    frustrations: v.optional(v.string()),
    preferredTone: v.optional(v.string()),
    // #4 child onboarding outputs
    tutorStyle: v.optional(v.string()), // "willow" | "pip" | "bolt"
    prefs: v.optional(
      v.object({
        pace: v.string(), // "steady" | "zippy"
        hints: v.string(), // "big" | "small"
        likes: v.string() // "stories" | "puzzles" | "questions"
      })
    ),
    onboardedAt: v.optional(v.number()),
    createdAt: v.number()
  }).index('by_parent', ['parentId']),

  // #2 — parent interview answers (kept separate; updatable over time).
  interviews: defineTable({
    childId: v.id('children'),
    findsEasy: v.string(),
    avoids: v.string(),
    whenStuck: v.string(),
    triedBefore: v.string(),
    wantToUnderstand: v.string(),
    updatedAt: v.number()
  }).index('by_child', ['childId']),

  // #5 — a lesson session container (voice-first shell).
  sessions: defineTable({
    childId: v.id('children'),
    lessonId: v.string(),
    status: v.string(), // "active" | "ended"
    mode: v.string(), // "voice" | "text"
    startedAt: v.number(),
    endedAt: v.optional(v.number())
  })
    .index('by_child', ['childId'])
    .index('by_child_status', ['childId', 'status']),

  // #5 — structured session events. The audit trail for everything that
  // happens in a session; later slices add task/hint/misconception detail.
  sessionEvents: defineTable({
    sessionId: v.id('sessions'),
    childId: v.id('children'),
    // session_start | session_end | tutor_turn | child_turn | repeat | guardrail
    type: v.string(),
    role: v.optional(v.string()), // "tutor" | "child"
    text: v.optional(v.string()),
    meta: v.optional(v.any()),
    at: v.number()
  })
    .index('by_session', ['sessionId'])
    .index('by_child', ['childId']),

  // #3 — guardian consent + privacy settings. One row per child.
  consents: defineTable({
    childId: v.id('children'),
    consentVersion: v.string(),
    consentedAt: v.number(),
    settings: v.object({
      saveAudio: v.boolean(), // raw audio retention — OFF by default
      weeklyDigest: v.boolean(), // learning-pattern insights on/off
      shareWithSchool: v.boolean(), // OFF by default
      fullTranscriptAccess: v.boolean(), // parent read-everything — OFF by default
      productImprovement: v.boolean() // opt-in only — OFF by default
    }),
    deletionRequestedAt: v.optional(v.number())
  }).index('by_child', ['childId'])
});
