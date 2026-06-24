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

export const endLesson = command('unchecked', async (sessionId: string) => {
  await convex.mutation(api.sessions.end, { sessionId: sessionId as Id<'sessions'> });
  return { ok: true as const };
});
