import { command, query } from '$app/server';
import { convex } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { Id } from '$convex/_generated/dataModel';

// #11 — the parent-facing weekly Digest read surface. Cheap: one row, embedded
// pack. Only `status === 'visible'` digests are returned, so #13's review gate
// is honoured by construction.
export const getLatestDigest = query('unchecked', async (childId: string) =>
  await convex.query(api.digests.visibleForChild, { childId: childId as Id<'children'> })
);

// #11 — founder-run manual generation (concierge pilot). Idempotent + consent-
// gated. Also runnable via `bunx convex run digests.generateForWeek`.
export const generateDigest = command(
  'unchecked',
  async (input: { childId: string; weekKey?: string }) =>
    await convex.action(api.digests.generateForWeek, {
      childId: input.childId as Id<'children'>,
      weekKey: input.weekKey
    })
);

// #15 — emit a `digest_opened` engagement signal when a parent opens their
// weekly digest (the one write #15 introduces). Keyed by digestId so digest
// views can be counted on the metrics dashboard. Fire-and-forget from the
// digest route on open.
export const recordDigestOpen = command(
  'unchecked',
  async (input: { childId: string; digestId: string }) =>
    await convex.mutation(api.sessions.recordDigestOpen, {
      childId: input.childId as Id<'children'>,
      digestId: input.digestId as Id<'digests'>
    })
);
