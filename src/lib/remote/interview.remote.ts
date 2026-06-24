import { command } from '$app/server';
import { convex } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { Id } from '$convex/_generated/dataModel';

// #22 — the AI-conducted Parent Interview boundary (mirrors the diagnostic
// remotes). The only model-driven write is submitInterviewResult, gated by the
// server-side validator (ADR-0001: model proposes, system disposes).

// Mint the ephemeral Realtime token bound to the interviewer persona + the
// submit_interview_result tool. Optional reInterview grounds it as a re-do.
export const interviewToken = command('unchecked', async (childId: string) =>
  await convex.action(api.realtime.interviewToken, {
    childId: childId as Id<'children'>,
    reInterview: true
  })
);

// TOOL: the interviewer submits its result. Returns { ok, feedback } — on a
// validation failure no row is written and feedback is fed back to the model.
export const submitInterviewResult = command(
  'unchecked',
  async (input: {
    childId: string;
    focusStrand: string | null;
    findsEasy: string;
    avoids: string;
    whenStuck: string;
    triedBefore: string;
    wantToUnderstand: string;
  }) =>
    await convex.mutation(api.interviews.submitInterviewResult, {
      childId: input.childId as Id<'children'>,
      focusStrand: input.focusStrand,
      findsEasy: input.findsEasy,
      avoids: input.avoids,
      whenStuck: input.whenStuck,
      triedBefore: input.triedBefore,
      wantToUnderstand: input.wantToUnderstand
    })
);

// PARTICIPATION-BASED COMPLETION: ended-early / disconnect / instant bail.
// Always succeeds; writes whatever was captured (incl. null focus). Never
// blocks the child's first lesson.
export const endInterviewEarly = command(
  'unchecked',
  async (input: {
    childId: string;
    focusStrand?: string | null;
    findsEasy?: string;
    avoids?: string;
    whenStuck?: string;
    triedBefore?: string;
    wantToUnderstand?: string;
  }) =>
    await convex.mutation(api.interviews.endInterviewEarly, {
      childId: input.childId as Id<'children'>,
      focusStrand: input.focusStrand ?? null,
      findsEasy: input.findsEasy,
      avoids: input.avoids,
      whenStuck: input.whenStuck,
      triedBefore: input.triedBefore,
      wantToUnderstand: input.wantToUnderstand
    })
);

// Read the stored interview (Focus Strand the selector + dashboard read).
export const interviewForChild = command('unchecked', async (childId: string) =>
  await convex.query(api.interviews.forChild, { childId: childId as Id<'children'> })
);
