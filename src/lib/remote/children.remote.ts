import { command } from '$app/server';
import { convex } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { Id } from '$convex/_generated/dataModel';

type ProfileInput = {
  parentKey: string;
  nickname: string;
  age: number;
  schoolYear?: string;
  mathsConfidence: string;
  mainConcern?: string;
  enjoys?: string;
  frustrations?: string;
  preferredTone?: string;
};

// #2 — create / update the single child profile for a parent.
export const saveChildProfile = command('unchecked', async (input: ProfileInput) => {
  const parentId = await convex.mutation(api.parents.ensure, { parentKey: input.parentKey });
  const childId = await convex.mutation(api.children.upsertProfile, {
    parentId,
    nickname: input.nickname.trim(),
    age: input.age,
    schoolYear: input.schoolYear?.trim() || undefined,
    mathsConfidence: input.mathsConfidence,
    mainConcern: input.mainConcern?.trim() || undefined,
    enjoys: input.enjoys?.trim() || undefined,
    frustrations: input.frustrations?.trim() || undefined,
    preferredTone: input.preferredTone?.trim() || undefined
  });
  return { childId };
});

// #2 — parent interview answers.
export const saveInterview = command(
  'unchecked',
  async (input: {
    childId: string;
    findsEasy: string;
    avoids: string;
    whenStuck: string;
    triedBefore: string;
    wantToUnderstand: string;
  }) => {
    await convex.mutation(api.interviews.save, {
      childId: input.childId as Id<'children'>,
      findsEasy: input.findsEasy.trim(),
      avoids: input.avoids.trim(),
      whenStuck: input.whenStuck.trim(),
      triedBefore: input.triedBefore.trim(),
      wantToUnderstand: input.wantToUnderstand.trim()
    });
    return { ok: true as const };
  }
);

// #4 — child onboarding: tutor style + learning preferences.
export const completeOnboarding = command(
  'unchecked',
  async (input: {
    childId: string;
    tutorStyle: string;
    prefs: { pace: string; hints: string; likes: string };
  }) => {
    await convex.mutation(api.children.completeOnboarding, {
      childId: input.childId as Id<'children'>,
      tutorStyle: input.tutorStyle,
      prefs: input.prefs
    });
    return { ok: true as const };
  }
);

// #4 — parent reset of tutor style.
export const resetTutorStyle = command('unchecked', async (childId: string) => {
  await convex.mutation(api.children.resetTutorStyle, { childId: childId as Id<'children'> });
  return { ok: true as const };
});
