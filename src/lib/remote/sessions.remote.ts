import { command } from '$app/server';
import { convex } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { Id } from '$convex/_generated/dataModel';

// #5 — start a lesson session.
export const startSession = command(
  'unchecked',
  async (input: { childId: string; lessonId: string; mode: string }) => {
    const sessionId = await convex.mutation(api.sessions.start, {
      childId: input.childId as Id<'children'>,
      lessonId: input.lessonId,
      mode: input.mode
    });
    return { sessionId };
  }
);

// #5 — record a session event (turn / repeat / guardrail).
export const recordEvent = command(
  'unchecked',
  async (input: {
    sessionId: string;
    childId: string;
    type: string;
    role?: string;
    text?: string;
    meta?: unknown;
  }) => {
    await convex.mutation(api.sessions.recordEvent, {
      sessionId: input.sessionId as Id<'sessions'>,
      childId: input.childId as Id<'children'>,
      type: input.type,
      role: input.role,
      text: input.text,
      meta: input.meta
    });
    return { ok: true as const };
  }
);

// #5 — end a session.
export const endSession = command('unchecked', async (sessionId: string) => {
  await convex.mutation(api.sessions.end, { sessionId: sessionId as Id<'sessions'> });
  return { ok: true as const };
});
