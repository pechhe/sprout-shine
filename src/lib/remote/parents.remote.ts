import { command, query } from '$app/server';
import { convex } from '$lib/server/convex';
import { api } from '$convex/_generated/api';

// #2 — confirm guardian + basic contact, returns the parent id.
export const confirmGuardian = command(
  'unchecked',
  async (input: { parentKey: string; name?: string; email?: string }) => {
    const id = await convex.mutation(api.parents.confirmGuardian, {
      parentKey: input.parentKey,
      name: input.name?.trim() || undefined,
      email: input.email?.trim() || undefined
    });
    return { parentId: id };
  }
);

// Read the whole parent dashboard state (parent + child + interview + consent).
export const getDashboard = query('unchecked', async (parentKey: string) => {
  return await convex.query(api.parents.dashboard, { parentKey });
});
