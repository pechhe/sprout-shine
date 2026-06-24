import { command, query } from '$app/server';
import { convex } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { Id } from '$convex/_generated/dataModel';

// #7 — start an engine-driven lesson against the approved plan for a skill.
export const startLesson = command(
  'unchecked',
  async (input: { childId: string; skillTag: string; mode?: string }) =>
    await convex.mutation(api.engine.start, {
      childId: input.childId as Id<'children'>,
      skillTag: input.skillTag,
      mode: input.mode
    })
);

// #14 — start a lesson against the pre-warmed, validated plan (or strand anchor
// fallback). No synchronous generation on the eager path: the next plan was
// pre-warmed at the prior session-end / diagnostic-end.
export const startQueuedLesson = command(
  'unchecked',
  async (input: { childId: string; mode?: string }) =>
    await convex.mutation(api.engine.startQueued, {
      childId: input.childId as Id<'children'>,
      mode: input.mode
    })
);

// #14 — seed the five Strand Anchors as approved (deploy-time validation of the
// fail-safe floor). Idempotent.
export const seedAnchors = command('unchecked', async () =>
  await convex.mutation(api.prewarm.seedAnchors, {})
);

export const lessonState = query('unchecked', async (sessionId: string) =>
  await convex.query(api.engine.state, { sessionId: sessionId as Id<'sessions'> })
);

// Mint the ephemeral Realtime token bound to the current lesson state + tools.
export const realtimeToken = command('unchecked', async (sessionId: string) =>
  await convex.action(api.realtime.token, { sessionId: sessionId as Id<'sessions'> })
);

// --- tool-gated state changes (engine validates each) ---
export const requestHint = command('unchecked', async (sessionId: string) =>
  await convex.mutation(api.engine.requestHint, { sessionId: sessionId as Id<'sessions'> })
);

export const recordAttempt = command(
  'unchecked',
  async (input: { sessionId: string; attempt: unknown }) =>
    await convex.mutation(api.engine.recordAttempt, {
      sessionId: input.sessionId as Id<'sessions'>,
      attempt: input.attempt
    })
);

export const advancePhase = command('unchecked', async (sessionId: string) =>
  await convex.mutation(api.engine.advancePhase, { sessionId: sessionId as Id<'sessions'> })
);

export const tagMisconception = command(
  'unchecked',
  async (input: { sessionId: string; tag: string }) =>
    await convex.mutation(api.engine.tagMisconception, {
      sessionId: input.sessionId as Id<'sessions'>,
      tag: input.tag
    })
);

// #10 — model-proposed learning-pattern hypothesis (controlled vocab).
export const tagPattern = command(
  'unchecked',
  async (input: { sessionId: string; tag: string }) =>
    await convex.mutation(api.engine.tagPattern, {
      sessionId: input.sessionId as Id<'sessions'>,
      tag: input.tag
    })
);

// #10 — the Learner Model read surface: Skill States + Pattern Signals with
// decay applied on read. Consumed by lesson selection (future) + weekly digest.
export const learnerModel = query('unchecked', async (childId: string) =>
  await convex.query(api.learnerModel.read, { childId: childId as Id<'children'> })
);

export const endLesson = command('unchecked', async (sessionId: string) => {
  await convex.mutation(api.sessions.end, { sessionId: sessionId as Id<'sessions'> });
  return { ok: true as const };
});
