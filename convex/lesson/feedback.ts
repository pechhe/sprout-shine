// #12 — Parent Feedback as a low-weight interpretation signal (ADR-0004).
// Pure module: no Convex, no Date.now except where a timestamp is taken from
// the feedback record. A parent's recorded read on a Digest lives alongside
// Session Events as a humble input to the Learner Model — it never overwrites
// structured evidence, and it is fed forward at a low, source-scaled weight.
//
// Two Feedback Channels (ADR-0004 decision #3):
//  - model:      truth-claims (sounds_right / doesn't_sound_right). Require an
//                evidence target (a Pattern Signal or Skill State). Feeds the
//                reducer as source:'parent' (a sibling source, ADR-0002 #1).
//  - presentation: preferences about surfacing (useful / not_useful /
//                want_less / want_more). Never touch reducer confidence; layer 1
//                of Digest generation reads them to suppress / re-consent / tune.
//
// Source-scaled pinch (#4): a model-channel disagreement is strong against a
// `model`-proposed pattern (neutralizes a weak guess) and gentle against a
// `deterministic` one (barely dents observed data). Realized inside the
// existing reducer's per-source alpha vocabulary — no new reducer.
//
// Decay asymmetry (#5): model-channel feedback is all-time (re-applied on every
// recompute, no decay factor); presentation-channel feedback decays via the
// existing `decay()` (floor, lazy on read).
//
// Re-consent (#6): a decayed presentation suppression with fresh evidence never
// silently re-labels the child — it surfaces a one-time prompt and stays off
// until the parent re-consents; an ignored prompt retires back to suppressed.

import { decay } from './learnerModel';
import type {
  PatternObservation,
  PatternSignalInput,
  PatternSignalResult,
  PatternSource
} from './learnerModel';
import type { PatternSignalTag } from './vocab';
import type { SkillLevel } from './skillState';

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const MODEL_REACTIONS = ['sounds_right', "doesn't_sound_right"] as const;
export const PRESENTATION_REACTIONS = [
  'useful',
  'not_useful',
  'want_less',
  'want_more'
] as const;
export const FEEDBACK_REACTIONS = [...MODEL_REACTIONS, ...PRESENTATION_REACTIONS] as const;

export type FeedbackReaction = (typeof FEEDBACK_REACTIONS)[number];

export type FeedbackChannel = 'model' | 'presentation';

/** The five Digest sections a reaction can be pinned to. Mirrors digest.ts'
 *  SectionKind as a local controlled vocab to avoid a cyclic type import. */
export type FeedbackSection = 'improved' | 'tricky' | 'patterns' | 'shine' | 'home';

export type FeedbackTarget =
  | { kind: 'digest' }
  | { kind: 'section'; section: FeedbackSection }
  | { kind: 'evidence'; section: FeedbackSection; targetRef: string };

export type ParentFeedbackRecord = {
  childId: string;
  digestId: string;
  channel: FeedbackChannel;
  reaction: FeedbackReaction;
  target: FeedbackTarget;
  at: number;
};

/** Which channel a reaction belongs to. The reaction *is* the channel by
 *  construction (ADR-0004): model = truth-claim, presentation = surfacing pref. */
export function channelForReaction(reaction: FeedbackReaction): FeedbackChannel {
  return (MODEL_REACTIONS as readonly string[]).includes(reaction) ? 'model' : 'presentation';
}

export function isFeedbackReaction(x: string): x is FeedbackReaction {
  return (FEEDBACK_REACTIONS as readonly string[]).includes(x);
}

// ---------------------------------------------------------------------------
// Validator (pure). Enforces the channel × reaction × target rules from the
// PRD: model reactions carry an evidence target; want_less / want_more target a
// section or pattern; combinations the design disallows are rejected.
// ---------------------------------------------------------------------------

export type ValidationResult = { ok: true } | { ok: false; reason: string };

/** True when an evidence target points at a pattern (section 'patterns', ref =
 *  a PatternSignalTag). Used to route presentation suppression + the model pinch. */
export function targetIsPattern(target: FeedbackTarget): boolean {
  return target.kind === 'evidence' && target.section === 'patterns';
}

/** True when an evidence target points at a skill (improved / tricky). */
export function targetIsSkill(target: FeedbackTarget): boolean {
  return target.kind === 'evidence' && (target.section === 'improved' || target.section === 'tricky');
}

export function validateFeedback(fb: ParentFeedbackRecord): ValidationResult {
  // Channel consistency: the stored channel must match the reaction's channel.
  if (channelForReaction(fb.reaction) !== fb.channel) {
    return { ok: false, reason: `reaction '${fb.reaction}' is not a ${fb.channel}-channel reaction` };
  }

  const { reaction, target } = fb;

  // Model reactions are truth-claims → must pin to a specific evidence item.
  if (fb.channel === 'model') {
    if (target.kind !== 'evidence') {
      return { ok: false, reason: 'model-channel reactions must target a piece of evidence' };
    }
    return { ok: true };
  }

  // Presentation channel.
  if (reaction === 'useful' || reaction === 'not_useful') {
    // Digest-level preference.
    if (target.kind !== 'digest') {
      return { ok: false, reason: `'${reaction}' targets the whole digest` };
    }
    return { ok: true };
  }

  // want_less / want_more → target a section or a specific pattern (evidence).
  if (target.kind === 'section') return { ok: true };
  if (target.kind === 'evidence') return { ok: true };
  return { ok: false, reason: `'${reaction}' must target a section or a piece of evidence` };
}

// ---------------------------------------------------------------------------
// Model channel → reducer input (source:'parent', low weight).
// The source-scaled *magnitude* is realized inside the reducer's per-source
// alpha (see learnerModel.ts). Here we only mint the humble observation.
// ---------------------------------------------------------------------------

// The parent's own trust cap: a single parent signal is a weak observation.
export const PARENT_PINCH_CONFIDENCE = 0.05;

export function makeParentPatternObservation(
  reaction: Extract<FeedbackReaction, 'sounds_right' | "doesn't_sound_right">,
  tag: PatternSignalTag,
  at: number
): PatternObservation {
  return {
    tag,
    supports: reaction === 'sounds_right',
    source: 'parent',
    confidence: PARENT_PINCH_CONFIDENCE,
    timestamp: at
  };
}

// --- Skill feedback: a confidence-only nudge (level never silently downgrades,
// ADR-0002 #3). The parent agrees/disagrees with a Skill State estimate; this
// moves trust modestly without asserting a different level. Low weight. ---

export type SkillStateLike = {
  level: SkillLevel;
  levelScore: number;
  confidence: number;
  evidenceCount: number;
  source: string;
  lastSeen: number;
};

export const PARENT_SKILL_PINCH = 0.1; // low weight
export const PARENT_SKILL_FLOOR = 0.15;
export const PARENT_SKILL_CEIL = 0.55;

/**
 * Apply a model-channel skill feedback to a Skill State. Confidence nudges
 * only; the level and levelScore are frozen (the parent's disagreement does
 * not assert a new level — it doubts the current one). source flips to
 * 'parent' so the row reads as parent-touched. Pure.
 */
export function applySkillFeedback(
  prior: SkillStateLike,
  reaction: 'sounds_right' | "doesn't_sound_right",
  at: number
): SkillStateLike {
  if (reaction === 'sounds_right') {
    // Nudge up, capped by the parent ceiling; never reduce an already-higher
    // confidence (a parent agreement must not dent strong lesson evidence).
    const confidence = Math.max(prior.confidence, Math.min(prior.confidence + 0.04, PARENT_SKILL_CEIL));
    return { ...prior, confidence, source: 'parent', lastSeen: at };
  }
  const confidence = Math.max(prior.confidence - PARENT_SKILL_PINCH, PARENT_SKILL_FLOOR);
  return { ...prior, confidence, source: 'parent', lastSeen: at };
}

// ---------------------------------------------------------------------------
// Presentation channel → layer 1 surfacing. Decays; never touches confidence.
// ---------------------------------------------------------------------------

/** Presentation feedback decays (ADR-0004 #5); model feedback does not. */
export function feedbackDecays(channel: FeedbackChannel): boolean {
  return channel === 'presentation';
}

/** Effective weight of a presentation record at `now` (1.0 fresh → floor 0.25). */
export function presentationWeight(recordAt: number, now: number): number {
  return decay(1.0, (now - recordAt) / DAY_MS);
}

// A suppression stays active above this weight; below it the pattern may re-consent.
const ACTIVE_SUPPRESSION = 0.5;
// Once the suppression has decayed to near the floor with no re-consent, the
// prompt retires and the pattern stays off (ignored → back to suppressed).
const RECONSRET_RETIRE = 0.3;
// "Fresh evidence still triggers the pattern" — mirrors digest.ts' surfacing floor.
const PATTERN_SURFACING_FLOOR = 0.35;

export type PatternSignalLike = {
  tag: PatternSignalTag;
  level: 'present' | 'absent';
  score: number;
  confidence: number;
};

export type PatternSurfacing =
  | { tag: PatternSignalTag; surface: true }
  | { tag: PatternSignalTag; surface: false; reason: 'suppressed' | 'pendingReconsent' };

/**
 * Decide whether a pattern surfaces in the Evidence Pack given the child's
 * presentation-channel feedback for it. Pure; `now` is read time.
 *
 * State machine (ADR-0004 #6):
 *  - no want_less → surface.
 *  - active suppression (weight ≥ 0.5) → suppressed (off).
 *  - a want_more *after* the latest want_less → parent re-consented → surface.
 *  - decayed suppression + fresh evidence + no consent → pendingReconsent (off,
 *    prompt shown). Fresh evidence = the signal is still present & confident.
 *  - decayed to near floor with no consent → retire prompt → suppressed.
 *  - no fresh evidence → stays suppressed.
 */
export function patternSurfacingDecision(
  signal: PatternSignalLike,
  feedback: ParentFeedbackRecord[],
  now: number
): PatternSurfacing {
  const tag = signal.tag;
  const relevant = feedback.filter(
    (r) =>
      r.channel === 'presentation' &&
      r.target.kind === 'evidence' &&
      r.target.section === 'patterns' &&
      r.target.targetRef === tag
  );
  if (relevant.length === 0) return { tag, surface: true };

  const less = relevant.filter((r) => r.reaction === 'want_less').sort((a, b) => a.at - b.at);
  const more = relevant.filter((r) => r.reaction === 'want_more').sort((a, b) => a.at - b.at);
  const latestLess = less.at(-1);
  const latestMore = more.at(-1);

  if (!latestLess) return { tag, surface: true }; // only want_more on record
  // Re-consent wins if it came after the latest suppression.
  if (latestMore && latestMore.at > latestLess.at) return { tag, surface: true };

  const weight = presentationWeight(latestLess.at, now);
  if (weight >= ACTIVE_SUPPRESSION) return { tag, surface: false, reason: 'suppressed' };

  const freshEvidence =
    signal.level === 'present' && signal.confidence >= PATTERN_SURFACING_FLOOR;
  if (!freshEvidence) return { tag, surface: false, reason: 'suppressed' };
  if (weight <= RECONSRET_RETIRE) return { tag, surface: false, reason: 'suppressed' };

  return { tag, surface: false, reason: 'pendingReconsent' };
}

// ---------------------------------------------------------------------------
// Presentation section tuning (want_less = trim, want_more = expand), read by
// layer 1 and surfaced as a hint. Decays like all presentation feedback.
// ---------------------------------------------------------------------------

export type SectionTuning = { section: FeedbackSection; direction: 'expand' | 'trim'; weight: number };

/**
 * Summarise section-targeted want_less / want_more into a tuning hint per
 * section, keyed off the *latest* surviving (non-decayed) section feedback.
 * Pure; returns empty when there is none.
 */
export function sectionTuning(
  feedback: ParentFeedbackRecord[],
  now: number
): SectionTuning[] {
  const bySection = new Map<FeedbackSection, SectionTuning>();
  const lastAt = new Map<FeedbackSection, number>();
  for (const r of feedback) {
    if (r.channel !== 'presentation') continue;
    if (r.reaction !== 'want_less' && r.reaction !== 'want_more') continue;
    if (r.target.kind !== 'section') continue;
    const direction = r.reaction === 'want_more' ? 'expand' : 'trim';
    const weight = presentationWeight(r.at, now);
    const prev = bySection.get(r.target.section);
    // Keep the most recent surviving preference for each section (ties broken by
    // array order, which is append-ordered, so later wins on equal timestamps).
    if (!prev || r.at >= lastAt.get(r.target.section)!) {
      bySection.set(r.target.section, { section: r.target.section, direction, weight });
      lastAt.set(r.target.section, r.at);
    }
  }
  // Drop fully-decayed tuning (weight near floor → no active preference).
  return [...bySection.values()].filter((t) => t.weight > RECONSRET_RETIRE);
}

// Re-exported pure types the persistence layer threads through.
export type { PatternSignalInput, PatternSignalResult, PatternSource };
