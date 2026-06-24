import { command } from '$app/server';
import { convex } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { Id } from '$convex/_generated/dataModel';

type Settings = {
  saveAudio: boolean;
  weeklyDigest: boolean;
  shareWithSchool: boolean;
  fullTranscriptAccess: boolean;
  productImprovement: boolean;
};

// #3 — give guardian consent + privacy settings.
export const giveConsent = command(
  'unchecked',
  async (input: { childId: string; settings: Settings }) => {
    await convex.mutation(api.consent.give, {
      childId: input.childId as Id<'children'>,
      settings: input.settings
    });
    return { ok: true as const };
  }
);

// #3 — update privacy settings later.
export const updatePrivacy = command(
  'unchecked',
  async (input: { childId: string; settings: Settings }) => {
    await convex.mutation(api.consent.updateSettings, {
      childId: input.childId as Id<'children'>,
      settings: input.settings
    });
    return { ok: true as const };
  }
);

// #3 — request deletion of child data.
export const requestDeletion = command('unchecked', async (childId: string) => {
  await convex.mutation(api.consent.requestDeletion, { childId: childId as Id<'children'> });
  return { ok: true as const };
});
