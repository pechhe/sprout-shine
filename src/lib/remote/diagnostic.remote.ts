import { command, query } from '$app/server';
import { convex } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { Id } from '$convex/_generated/dataModel';

// #9 — diagnostic session boundary (mirrors the lesson remotes).
export const startDiagnostic = command('unchecked', async (childId: string) =>
  await convex.mutation(api.diagnostics.start, { childId: childId as Id<'children'> })
);

export const diagnosticState = query('unchecked', async (sessionId: string) =>
  await convex.query(api.diagnostics.state, { sessionId: sessionId as Id<'sessions'> })
);

export const diagnosticToken = command('unchecked', async (sessionId: string) =>
  await convex.action(api.realtime.diagnosticToken, { sessionId: sessionId as Id<'sessions'> })
);

export const diagnosticRequestHint = command('unchecked', async (sessionId: string) =>
  await convex.mutation(api.diagnostics.requestHint, { sessionId: sessionId as Id<'sessions'> })
);

export const diagnosticRecordAttempt = command(
  'unchecked',
  async (input: { sessionId: string; attempt: unknown }) =>
    await convex.mutation(api.diagnostics.recordAttempt, {
      sessionId: input.sessionId as Id<'sessions'>,
      attempt: input.attempt
    })
);

export const diagnosticSkillSnapshot = query('unchecked', async (childId: string) =>
  await convex.query(api.diagnostics.skillSnapshot, { childId: childId as Id<'children'> })
);
