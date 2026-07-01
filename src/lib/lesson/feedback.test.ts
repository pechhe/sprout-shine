import { describe, it, expect } from 'vitest';
import {
  channelForReaction,
  validateFeedback,
  makeParentPatternObservation,
  applySkillFeedback,
  feedbackDecays,
  presentationWeight,
  patternSurfacingDecision,
  sectionTuning,
  isFeedbackReaction,
  MODEL_REACTIONS,
  PRESENTATION_REACTIONS,
  PARENT_PINCH_CONFIDENCE,
  type ParentFeedbackRecord,
  type FeedbackReaction
} from '$convex/lesson/feedback';
import {
  updatePatternSignal,
  decay,
  type PatternSignalInput,
  type PatternObservation,
  type PatternSignalResult,
  type PatternSource
} from '$convex/lesson/learnerModel';
import type { PatternSignalTag } from '$convex/lesson/vocab';
import type { SkillLevel } from '$convex/lesson/skillState';

const T0 = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const TAG: PatternSignalTag = 'benefits_from_visuals';
const MODEL_TAG: PatternSignalTag = 'responds_to_story_context'; // model-only vocab tag

function fb(partial: Partial<ParentFeedbackRecord>): ParentFeedbackRecord {
  return {
    childId: 'c1',
    digestId: 'd1',
    channel: partial.channel ?? 'presentation',
    reaction: partial.reaction ?? 'want_less',
    target: partial.target ?? { kind: 'evidence', section: 'patterns', targetRef: TAG },
    at: partial.at ?? T0,
    ...partial
  };
}

// Fold a list of observations into one signal (mirrors the reducer's fold).
function fold(obs: PatternObservation[]): PatternSignalResult | null {
  let signal: PatternSignalResult | null = null;
  for (const o of obs) {
    const prior: PatternSignalInput | null = signal
      ? {
          score: signal.score,
          confidence: signal.confidence,
          evidenceCount: signal.evidenceCount,
          source: signal.source,
          lastSeen: signal.lastSeen
        }
      : null;
    signal = updatePatternSignal(prior, o);
  }
  return signal;
}

// =========================================================================
// #12 — channels & sources
// =========================================================================

describe('#12 reaction → channel mapping', () => {
  it('routes the six reactions to their channels', () => {
    expect(channelForReaction('sounds_right')).toBe('model');
    expect(channelForReaction("doesn't_sound_right")).toBe('model');
    expect(channelForReaction('useful')).toBe('presentation');
    expect(channelForReaction('not_useful')).toBe('presentation');
    expect(channelForReaction('want_less')).toBe('presentation');
    expect(channelForReaction('want_more')).toBe('presentation');
  });

  it('the six reactions partition cleanly into two channels', () => {
    expect(MODEL_REACTIONS).toHaveLength(2);
    expect(PRESENTATION_REACTIONS).toHaveLength(4);
  });

  it('isFeedbackReaction guards the controlled vocabulary', () => {
    expect(isFeedbackReaction("doesn't_sound_right")).toBe(true);
    expect(isFeedbackReaction('want_more')).toBe(true);
    expect(isFeedbackReaction('love_it' as FeedbackReaction)).toBe(false);
  });
});

// =========================================================================
// #12 — validateFeedback (channel × reaction × target rules)
// =========================================================================

describe('#12 validateFeedback', () => {
  it('accepts a model reaction pinned to evidence', () => {
    expect(
      validateFeedback(
        fb({
          channel: 'model',
          reaction: "doesn't_sound_right",
          target: { kind: 'evidence', section: 'patterns', targetRef: TAG }
        })
      ).ok
    ).toBe(true);
  });

  it('rejects a model reaction without an evidence target (no truth-claim anchor)', () => {
    const r = validateFeedback(
      fb({ channel: 'model', reaction: 'sounds_right', target: { kind: 'digest' } })
    );
    expect(r.ok).toBe(false);
  });

  it('rejects a channel that does not match the reaction', () => {
    // sounds_right is a model reaction but stored on the presentation channel
    const r = validateFeedback(
      fb({ channel: 'presentation', reaction: 'sounds_right', target: { kind: 'evidence', section: 'patterns', targetRef: TAG } })
    );
    expect(r.ok).toBe(false);
  });

  it('useful / not_useful target the whole digest', () => {
    expect(validateFeedback(fb({ reaction: 'useful', target: { kind: 'digest' } })).ok).toBe(true);
    const r = validateFeedback(
      fb({ reaction: 'useful', target: { kind: 'section', section: 'patterns' } })
    );
    expect(r.ok).toBe(false);
  });

  it('want_less / want_more target a section or a piece of evidence', () => {
    expect(
      validateFeedback(fb({ reaction: 'want_less', target: { kind: 'section', section: 'patterns' } })).ok
    ).toBe(true);
    expect(
      validateFeedback(
        fb({ reaction: 'want_more', target: { kind: 'evidence', section: 'patterns', targetRef: TAG } })
      ).ok
    ).toBe(true);
    const r = validateFeedback(fb({ reaction: 'want_less', target: { kind: 'digest' } }));
    expect(r.ok).toBe(false);
  });
});

// =========================================================================
// #12 — model channel feeds the reducer as source:'parent' (sibling source)
// =========================================================================

describe('#12 model-channel feedback is a humble parent-source observation', () => {
  it('builds an observation tagged source:parent with a low trust confidence', () => {
    const obs = makeParentPatternObservation("doesn't_sound_right", TAG, T0);
    expect(obs.source).toBe('parent');
    expect(obs.supports).toBe(false);
    expect(obs.confidence).toBe(PARENT_PINCH_CONFIDENCE);
    expect(obs.tag).toBe(TAG);
  });

  it("sounds_right → supports true; doesn't_sound_right → supports false", () => {
    expect(makeParentPatternObservation('sounds_right', TAG, T0).supports).toBe(true);
    expect(makeParentPatternObservation("doesn't_sound_right", TAG, T0).supports).toBe(false);
  });

  it('the reducer accepts a parent observation (sibling source, no throw)', () => {
    const seed: PatternObservation = { tag: TAG, supports: true, source: 'model', confidence: 0.4, timestamp: T0 };
    const prior = fold([seed])!;
    const after = updatePatternSignal(
      { score: prior.score, confidence: prior.confidence, evidenceCount: prior.evidenceCount, source: prior.source, lastSeen: prior.lastSeen },
      makeParentPatternObservation("doesn't_sound_right", TAG, T0 + DAY)
    );
    expect(after.source).toBe('model'); // the pinch never rebrands a stronger signal
    expect(after.evidenceCount).toBe(2);
  });
});

// =========================================================================
// #12 — source-scaled pinch: strong vs model, gentle vs deterministic
// =========================================================================

describe('#12 source-scaled pinch (model vs deterministic)', () => {
  // Build a model-proposed signal: a weak guess damped toward present.
  function modelPrior(): PatternSignalResult {
    return fold([{ tag: MODEL_TAG, supports: true, source: 'model', confidence: 0.4, timestamp: T0 }])!;
  }
  // Build a strong deterministic signal: many high-trust supporting observations.
  function detPrior(): PatternSignalResult {
    return fold(
      Array.from({ length: 10 }, (_, i) => ({
        tag: TAG,
        supports: true,
        source: 'deterministic' as PatternSource,
        confidence: 0.5,
        timestamp: T0 + i
      }))
    )!;
  }

  it('doesnt_sound_right strongly neutralizes a model-sourced pattern (one disagreement)', () => {
    const prior = modelPrior();
    expect(prior.source).toBe('model');
    const after = updatePatternSignal(
      { score: prior.score, confidence: prior.confidence, evidenceCount: prior.evidenceCount, source: prior.source, lastSeen: prior.lastSeen },
      makeParentPatternObservation("doesn't_sound_right", MODEL_TAG, T0 + DAY)
    );
    // confidence lowered (Seam 2a) ...
    expect(after.confidence).toBeLessThan(prior.confidence);
    // ... and the score flips below present (neutralizes a weak guess).
    expect(after.score).toBeLessThan(0.5);
    expect(after.level).toBe('absent');
  });

  it('doesnt_sound_right barely dents a deterministic signal (never zeroes it)', () => {
    const prior = detPrior();
    expect(prior.confidence).toBeGreaterThan(0.4); // genuinely strong
    const after = updatePatternSignal(
      { score: prior.score, confidence: prior.confidence, evidenceCount: prior.evidenceCount, source: prior.source, lastSeen: prior.lastSeen },
      makeParentPatternObservation("doesn't_sound_right", TAG, T0 + DAY)
    );
    // score stays present ...
    expect(after.score).toBeGreaterThanOrEqual(0.5);
    expect(after.level).toBe('present');
    // ... confidence barely moves and is never zeroed.
    expect(after.confidence).toBeGreaterThan(prior.confidence - 0.1);
    expect(after.confidence).toBeGreaterThan(0.3);
  });

  it('the model-sourced pinch is stronger than the deterministic-sourced pinch (asymmetry)', () => {
    const modelPrior0 = modelPrior();
    const detPrior0 = detPrior();
    const modelAfter = updatePatternSignal(
      { score: modelPrior0.score, confidence: modelPrior0.confidence, evidenceCount: modelPrior0.evidenceCount, source: modelPrior0.source, lastSeen: modelPrior0.lastSeen },
      makeParentPatternObservation("doesn't_sound_right", MODEL_TAG, T0 + DAY)
    );
    const detAfter = updatePatternSignal(
      { score: detPrior0.score, confidence: detPrior0.confidence, evidenceCount: detPrior0.evidenceCount, source: detPrior0.source, lastSeen: detPrior0.lastSeen },
      makeParentPatternObservation("doesn't_sound_right", TAG, T0 + DAY)
    );
    const modelDropFrac = (modelPrior0.confidence - modelAfter.confidence) / modelPrior0.confidence;
    const detDropFrac = (detPrior0.confidence - detAfter.confidence) / detPrior0.confidence;
    expect(modelDropFrac).toBeGreaterThan(detDropFrac);
  });
});

// =========================================================================
// #12 — decay asymmetry: model feedback is all-time; presentation decays
// =========================================================================

describe('#12 decay asymmetry', () => {
  it('presentation feedback decays on the confidence schedule', () => {
    expect(feedbackDecays('presentation')).toBe(true);
    expect(presentationWeight(T0, T0)).toBeCloseTo(1.0, 5);
    const aged = presentationWeight(T0, T0 + 56 * DAY);
    expect(aged).toBeLessThan(1.0); // ~0.52 at 56d
    expect(aged).toBeGreaterThan(0.25); // respect the floor
  });

  it('model feedback never decays: its move is identical fresh or aged', () => {
    const prior = fold([{ tag: MODEL_TAG, supports: true, source: 'model', confidence: 0.4, timestamp: T0 }])!;
    const input = (): PatternSignalInput => ({
      score: prior.score,
      confidence: prior.confidence,
      evidenceCount: prior.evidenceCount,
      source: prior.source,
      lastSeen: prior.lastSeen
    });
    // Same disagreement, applied far apart in time → identical result (no decay
    // factor in the model-channel path; the truth-claim is durable).
    const fresh = updatePatternSignal(input(), makeParentPatternObservation("doesn't_sound_right", MODEL_TAG, T0 + DAY));
    const aged = updatePatternSignal(input(), makeParentPatternObservation("doesn't_sound_right", MODEL_TAG, T0 + 400 * DAY));
    expect(aged.confidence).toBeCloseTo(fresh.confidence, 8);
    expect(aged.score).toBeCloseTo(fresh.score, 8);
  });

  it('decay floor bounds the presentation weight at 0.25x', () => {
    expect(presentationWeight(T0, T0 + 1000 * DAY)).toBeCloseTo(0.25, 3);
  });
});

// =========================================================================
// #12 — re-consent & presentation suppression (layer 1 surfacing)
// =========================================================================

describe('#12 pattern surfacing: suppression + re-consent', () => {
  // A signal with fresh, confident evidence.
  const fresh = { tag: TAG, level: 'present' as const, score: 0.7, confidence: 0.6 };
  const stale = { tag: TAG, level: 'absent' as const, score: 0.4, confidence: 0.2 };

  it('surfaces with no feedback', () => {
    expect(patternSurfacingDecision(fresh, [], T0)).toEqual({ tag: TAG, surface: true });
  });

  it('want_less actively suppresses the pattern (it does not surface)', () => {
    const r = patternSurfacingDecision(fresh, [fb({ reaction: 'want_less', at: T0 })], T0);
    expect(r.surface).toBe(false);
    expect(r).toMatchObject({ reason: 'suppressed' });
  });

  it('a decayed suppression + fresh evidence → pendingReconsent, pattern still off', () => {
    // ~66d old → weight ≈ 0.465 (between 0.3 and 0.5).
    const r = patternSurfacingDecision(
      fresh,
      [fb({ reaction: 'want_less', at: T0 })],
      T0 + 66 * DAY
    );
    expect(r.surface).toBe(false);
    expect(r).toMatchObject({ reason: 'pendingReconsent' });
  });

  it('re-consent (want_more after the suppression) surfaces the pattern again', () => {
    const r = patternSurfacingDecision(fresh, [
      fb({ reaction: 'want_less', at: T0 }),
      fb({ reaction: 'want_more', at: T0 + 70 * DAY })
    ], T0 + 70 * DAY);
    expect(r.surface).toBe(true);
  });

  it('an ignored prompt retires back to suppressed once decayed near floor', () => {
    // ~105d old → weight ≈ 0.296 (≤ 0.3) → prompt retired, stays suppressed.
    const r = patternSurfacingDecision(
      fresh,
      [fb({ reaction: 'want_less', at: T0 })],
      T0 + 105 * DAY
    );
    expect(r.surface).toBe(false);
    expect(r).toMatchObject({ reason: 'suppressed' });
  });

  it('with no fresh evidence a decayed suppression stays off (no prompt)', () => {
    const r = patternSurfacingDecision(
      stale,
      [fb({ reaction: 'want_less', at: T0 })],
      T0 + 66 * DAY
    );
    expect(r.surface).toBe(false);
    expect(r).toMatchObject({ reason: 'suppressed' });
  });

  it('a want_more on a different pattern does not affect this one', () => {
    const r = patternSurfacingDecision(fresh, [
      fb({ reaction: 'want_less', at: T0 }),
      fb({ reaction: 'want_more', target: { kind: 'evidence', section: 'patterns', targetRef: 'rushes_when_confident' }, at: T0 + 1 })
    ], T0);
    expect(r.surface).toBe(false); // still suppressed — consent was for another pattern
  });
});

describe('#12 section tuning (want_less / want_more on sections)', () => {
  it('summarises the latest section preference and drops fully-decayed ones', () => {
    const tuning = sectionTuning(
      [
        fb({ reaction: 'want_more', target: { kind: 'section', section: 'patterns' }, at: T0 }),
        fb({ reaction: 'want_less', target: { kind: 'section', section: 'shine' }, at: T0 })
      ],
      T0
    );
    const bySection = Object.fromEntries(tuning.map((t) => [t.section, t.direction]));
    expect(bySection.patterns).toBe('expand');
    expect(bySection.shine).toBe('trim');
  });

  it('drops a section preference once it has decayed past the floor', () => {
    const tuning = sectionTuning(
      [fb({ reaction: 'want_more', target: { kind: 'section', section: 'patterns' }, at: T0 })],
      T0 + 200 * DAY
    );
    // weight floors at 0.25 (< 0.3 retire threshold) → no active preference.
    expect(tuning).toHaveLength(0);
  });

  it('keeps the most recent section preference when several exist', () => {
    // An early want_more, then a later want_less on the same section → trim wins.
    const tuning = sectionTuning(
      [
        fb({ reaction: 'want_more', target: { kind: 'section', section: 'patterns' }, at: T0 }),
        fb({ reaction: 'want_less', target: { kind: 'section', section: 'patterns' }, at: T0 + DAY })
      ],
      T0 + DAY
    );
    expect(tuning).toHaveLength(1);
    expect(tuning[0].direction).toBe('trim');
  });
});

// =========================================================================
// #12 — skill feedback: confidence-only nudge, level frozen (ADR-0002 #3)
// =========================================================================

describe('#12 skill feedback (model channel, level never downgrades)', () => {
  const prior = {
    level: 'secure' as SkillLevel,
    levelScore: 0.85,
    confidence: 0.4,
    evidenceCount: 4,
    source: 'lesson',
    lastSeen: T0
  };

  it("doesn't_sound_right lowers confidence at a low weight, floors it, and freezes the level", () => {
    const after = applySkillFeedback(prior, "doesn't_sound_right", T0 + DAY);
    expect(after.confidence).toBeLessThan(prior.confidence);
    expect(after.confidence).toBeGreaterThanOrEqual(0.15); // floor respected
    expect(after.level).toBe('secure'); // level frozen
    expect(after.levelScore).toBe(prior.levelScore);
    expect(after.source).toBe('parent');
  });

  it('sounds_right nudges confidence up modestly (capped), level frozen', () => {
    const after = applySkillFeedback(prior, 'sounds_right', T0 + DAY);
    expect(after.confidence).toBeGreaterThan(prior.confidence);
    expect(after.level).toBe('secure'); // level untouched
    expect(after.source).toBe('parent');
  });

  it('never zeroes confidence — repeated disagreement floors, never below', () => {
    let s = prior;
    for (let i = 0; i < 50; i++) s = applySkillFeedback(s, "doesn't_sound_right", T0 + i * DAY);
    expect(s.confidence).toBeGreaterThanOrEqual(0.15);
  });
});

// =========================================================================
// #12 — decay (shared invariant, sanity for the presentation schedule)
// =========================================================================

describe('#12 decay anchor points match the learner model schedule', () => {
  it('presentation weight follows the ~0.85@14d / ~0.7@28d / ~0.5@56d curve', () => {
    expect(presentationWeight(T0, T0 + 14 * DAY)).toBeCloseTo(decay(1, 14), 5);
    expect(presentationWeight(T0, T0 + 28 * DAY)).toBeCloseTo(decay(1, 28), 5);
    expect(presentationWeight(T0, T0 + 56 * DAY)).toBeCloseTo(decay(1, 56), 5);
  });
});
