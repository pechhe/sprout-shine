import { command } from '$app/server';
import { convex } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { Id } from '$convex/_generated/dataModel';

// #12 — submit a parent feedback record on a digest. Consent-gated + validated
// on the Convex side. Model-channel reactions apply the source-scaled parent
// pinch to the Learner Model; presentation-channel reactions only persist and
// shape the next Digest's Evidence Pack (layer 1).
export type FeedbackTarget =
  | { kind: 'digest' }
  | { kind: 'section'; section: 'improved' | 'tricky' | 'patterns' | 'shine' | 'home' }
  | { kind: 'evidence'; section: 'improved' | 'tricky' | 'patterns' | 'shine' | 'home'; targetRef: string };

export const submitFeedback = command(
  'unchecked',
  async (input: {
    childId: string;
    digestId: string;
    reaction:
      | 'sounds_right'
      | "doesn't_sound_right"
      | 'useful'
      | 'not_useful'
      | 'want_less'
      | 'want_more';
    target: FeedbackTarget;
  }) => {
    return await convex.mutation(api.feedback.submit, {
      childId: input.childId as Id<'children'>,
      digestId: input.digestId as Id<'digests'>,
      reaction: input.reaction,
      target: input.target
    });
  }
);
