import { describe, it, expect } from 'vitest';
import {
  skillOutcomeFromEvent,
  updateSkillState,
  blendSkillState,
  decay,
  decaySince,
  detectPatternObservations,
  updatePatternSignal,
  foldPatternSignal,
  outcomeSignals,
  type SkillOutcome,
  type PatternObservation,
  type SessionEventLike,
  type SkillStateResult
} from '$convex/lesson/learnerModel';
import { levelFromScore } from '$convex/lesson/skillState';

const T0 = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

// Helpers to build resolved lesson task_attempt events with the enriched #10
// meta shape (skillTag, phase, hintUsed, answerType, status, attempts, resolved).
function attempt(opts: {
  skillTag?: string;
  phase?: SkillOutcome['phase'];
  verdict?: SkillOutcome['verdict'];
  attempts?: number;
  hintUsed?: boolean;
  answerType?: SkillOutcome['answerType'];
  resolved?: boolean;
  observed?: string;
  at?: number;
}): SessionEventLike {
  const resolved = opts.resolved ?? true;
  return {
    type: 'task_attempt',
    at: opts.at ?? T0,
    meta: {
      skillTag: opts.skillTag ?? 'multiplication_as_groups',
      phase: opts.phase ?? 'practice',
      answerType: opts.answerType ?? 'numeric',
      status: opts.verdict ?? 'correct',
      attempts: opts.attempts ?? 1,
      hintUsed: opts.hintUsed ?? false,
      resolved,
      observed: opts.observed
    }
  };
}

describe('#10 skillOutcomeFromEvent', () => {
  it('normalizes a resolved task_attempt into a Skill Outcome', () => {
    const o = skillOutcomeFromEvent(attempt({ verdict: 'correct', attempts: 1, phase: 'mastery_check' }));
    expect(o).not.toBeNull();
    expect(o!.skillTag).toBe('multiplication_as_groups');
    expect(o!.verdict).toBe('correct');
    expect(o!.phase).toBe('mastery_check');
    expect(o!.hintUsed).toBe(false);
  });

  it('returns null for non-attempt events', () => {
    expect(skillOutcomeFromEvent({ type: 'hint_shown', at: T0, meta: {} })).toBeNull();
    expect(skillOutcomeFromEvent({ type: 'phase_change', at: T0, meta: {} })).toBeNull();
    expect(skillOutcomeFromEvent({ type: 'session_start', at: T0, meta: {} })).toBeNull();
  });

  it('returns null for mid-attempt (unresolved) task_attempts', () => {
    expect(skillOutcomeFromEvent(attempt({ resolved: false }))).toBeNull();
  });

  it('returns null for pre-#10 events lacking meta.skillTag (no migration)', () => {
    const legacy: SessionEventLike = {
      type: 'task_attempt',
      at: T0,
      meta: { taskId: 'x', status: 'correct', attempts: 1 } // no skillTag
    };
    expect(skillOutcomeFromEvent(legacy)).toBeNull();
  });

  it('defaults phase to practice when absent', () => {
    const o = skillOutcomeFromEvent({
      type: 'task_attempt',
      at: T0,
      meta: { skillTag: 'number_sense_basic', status: 'correct', attempts: 1, resolved: true }
    });
    expect(o?.phase).toBe('practice');
  });
});

describe('#10 updateSkillState — no-prior (diagnostic degenerate)', () => {
  it('first-try diagnostic correct -> secure-ish, modest confidence (capped)', () => {
    const o: SkillOutcome = {
      skillTag: 'multiplication_as_arrays',
      verdict: 'correct',
      attempts: 1,
      hintUsed: false,
      phase: 'diagnostic',
      timestamp: T0
    };
    const s = updateSkillState(null, o);
    expect(s.levelScore).toBeGreaterThanOrEqual(0.7);
    expect(s.confidence).toBeLessThanOrEqual(0.5); // diagnostic single signal stays weak
    expect(s.evidenceCount).toBe(1);
    expect(s.source).toBe('diagnostic');
  });

  it('matches #9 estimateSkillFromDiagnostic for the canonical diagnostic cases', () => {
    // first-try correct, diagnostic
    const a = updateSkillState(null, {
      skillTag: 'x', verdict: 'correct', attempts: 1, hintUsed: false, phase: 'diagnostic', timestamp: T0
    });
    expect(a.level).toBe('secure');
    expect(a.confidence).toBeLessThanOrEqual(0.5);

    // needed a hint
    const b = updateSkillState(null, {
      skillTag: 'x', verdict: 'correct', attempts: 3, hintUsed: true, phase: 'diagnostic', timestamp: T0
    });
    expect(b.level).toBe('developing');
    expect(b.confidence).toBeLessThanOrEqual(0.5);

    // never resolved
    const c = updateSkillState(null, {
      skillTag: 'x', verdict: 'incorrect', attempts: 3, hintUsed: true, phase: 'diagnostic', timestamp: T0
    });
    expect(c.level).toBe('emerging');
  });
});

describe('#10 updateSkillState — incremental weighted blend', () => {
  // The level never silently downgrades a child. A mastery lift must move the
  // score up; a subsequent weaker outcome should not crash the level below
  // what solid evidence supports.
  it('mastery-lifts-past-diagnostic-caution: a nailed mastery check lifts score & confidence', () => {
    const diag = updateSkillState(null, {
      skillTag: 'x', verdict: 'incorrect', attempts: 3, hintUsed: true, phase: 'diagnostic', timestamp: T0
    });
    expect(diag.level).toBe('emerging');

    const afterMastery = updateSkillState(
      { levelScore: diag.levelScore, confidence: diag.confidence, evidenceCount: diag.evidenceCount, source: diag.source },
      { skillTag: 'x', verdict: 'correct', attempts: 1, hintUsed: false, phase: 'mastery_check', timestamp: T0 + DAY }
    );
    expect(afterMastery.levelScore).toBeGreaterThan(diag.levelScore);
    expect(afterMastery.confidence).toBeGreaterThan(diag.confidence);
    // The level tracks the blended score (the mastery lift pulls it up).
    expect(['developing', 'secure']).toContain(afterMastery.level);
  });

  it('hint-then-crushes stays modest: a hinted correct does not harden to secure', () => {
    const diag = updateSkillState(null, {
      skillTag: 'x', verdict: 'correct', attempts: 1, hintUsed: false, phase: 'diagnostic', timestamp: T0
    });
    const afterHinted = updateSkillState(
      { levelScore: diag.levelScore, confidence: diag.confidence, evidenceCount: diag.evidenceCount, source: diag.source },
      { skillTag: 'x', verdict: 'correct', attempts: 2, hintUsed: true, phase: 'practice', timestamp: T0 + DAY }
    );
    // hinted/retried evidence should not increase confidence beyond the prior.
    expect(afterHinted.confidence).toBeLessThanOrEqual(diag.confidence + 0.01);
  });

  it('higher-stakes mastery moves the score more than low-stakes hinted retry (proof > noise)', () => {
    const mastery = updateSkillState(
      { levelScore: 0.5, confidence: 0.4, evidenceCount: 1, source: 'diagnostic' },
      { skillTag: 'x', verdict: 'correct', attempts: 1, hintUsed: false, phase: 'mastery_check', timestamp: T0 }
    );
    const hinted = updateSkillState(
      { levelScore: 0.5, confidence: 0.4, evidenceCount: 1, source: 'diagnostic' },
      { skillTag: 'x', verdict: 'correct', attempts: 2, hintUsed: true, phase: 'practice', timestamp: T0 }
    );
    expect(mastery.levelScore).toBeGreaterThan(hinted.levelScore);
  });

  it('confidence grows slowly: a single event never hardens into a fact', () => {
    // From prior conf 0.4, one strong outcome (conf 0.7) -> EMA toward 0.7
    const s = updateSkillState(
      { levelScore: 0.5, confidence: 0.4, evidenceCount: 2, source: 'lesson' },
      { skillTag: 'x', verdict: 'correct', attempts: 1, hintUsed: false, phase: 'mastery_check', timestamp: T0 }
    );
    // oldConf*(1-0.2) + 0.7*0.2 = 0.32 + 0.14 = 0.46 — grows, but not to 0.7
    expect(s.confidence).toBeGreaterThan(0.4);
    expect(s.confidence).toBeLessThan(0.6);
  });

  it('explanation is neutral: captured, low confidence, no level claim flip', () => {
    const s = updateSkillState(null, {
      skillTag: 'explanation_quality', verdict: 'captured', attempts: 1, hintUsed: false, phase: 'practice', answerType: 'explanation', timestamp: T0
    });
    expect(s.confidence).toBeLessThanOrEqual(0.25);
    expect(s.levelScore).toBeCloseTo(0.5, 1); // neutral
  });

  it('evidenceCount accumulates and source flips to lesson on first lesson evidence', () => {
    const diag = updateSkillState(null, {
      skillTag: 'x', verdict: 'correct', attempts: 1, hintUsed: false, phase: 'diagnostic', timestamp: T0
    });
    const after = updateSkillState(
      { levelScore: diag.levelScore, confidence: diag.confidence, evidenceCount: diag.evidenceCount, source: diag.source },
      { skillTag: 'x', verdict: 'correct', attempts: 1, hintUsed: false, phase: 'practice', timestamp: T0 + DAY }
    );
    expect(after.evidenceCount).toBe(2);
    expect(after.source).toBe('lesson');
  });
});

describe('#10 decay — confidence-only erosion, level never decays', () => {
  it('stale-decays on read: confidence drops after weeks unseen', () => {
    const fresh = decay(0.6, 0);
    expect(fresh).toBeCloseTo(0.6, 5);
    const at14 = decay(0.6, 14);
    expect(at14).toBeLessThan(0.6);
    expect(at14).toBeGreaterThan(0.4); // ~0.51
    const at56 = decay(0.6, 56);
    expect(at56).toBeLessThan(at14);
  });

  it('respects the grace window: confidence retained better within grace than after', () => {
    const at1 = decay(0.8, 1);
    const at13 = decay(0.8, 13);
    const at14 = decay(0.8, 14);
    const at28 = decay(0.8, 28);
    const at56 = decay(0.8, 56);
    expect(at1).toBeGreaterThan(0.78); // ~98% retained today+1d
    expect(at13).toBeGreaterThan(0.65); // ~86% retained within grace (0.8 * 0.85^(13/14))
    // Monotonic: more days unseen -> more decay (grace then steeper).
    expect(at1).toBeGreaterThan(at14);
    expect(at14).toBeGreaterThan(at28);
    expect(at28).toBeGreaterThan(at56);
  });

  it('respects the floor: never decays below 0.25x confidence', () => {
    // 0.4 * factor, factor floored at 0.25 -> min 0.1. But the *floor* is on
    // the factor (0.25), so a very old confidence → 0.4 * 0.25 = 0.1 (still > 0).
    const ancient = decay(0.4, 1000);
    expect(ancient).toBeCloseTo(0.4 * 0.25, 3);
    expect(ancient).toBeGreaterThan(0);
  });

  it('level never decays — decay only touches confidence', () => {
    // decay returns a number; the invariant is that the *level* (derived from
    // levelScore) is never recomputed from decayed confidence. Here we assert
    // the structural property: decay does not take a level as input.
    const conf = decay(0.5, 60);
    expect(typeof conf).toBe('number');
    // and decaySince works from timestamps:
    expect(decaySince(0.5, T0, T0 + 30 * DAY)).toBeLessThan(0.5);
  });

  it('gives the ADR-0002 anchor points: ~0.85@14d, ~0.7@28d, ~0.5@56d', () => {
    // factor @14d = 0.85^1   = 0.85
    // factor @28d = 0.85^2   = 0.7225 ≈ 0.7
    // factor @56d = 0.85^4   = 0.522 ≈ 0.5
    expect(decay(1, 14)).toBeCloseTo(0.85, 1);
    expect(decay(1, 28)).toBeCloseTo(0.7225, 1);
    expect(decay(1, 56)).toBeCloseTo(0.522, 1);
  });
});

describe('#10 blendSkillState — incremental == recompute (consistency)', () => {
  it('blends staleness on write: a gap decays the prior confidence before folding', () => {
    const prior: SkillStateResult = {
      level: 'secure', levelScore: 0.85, confidence: 0.6, evidenceCount: 1,
      source: 'lesson', lastSeen: T0, updatedAt: T0
    };
    // 28 days later — confidence should have decayed before blending.
    const blended = blendSkillState(prior, {
      skillTag: 'x', verdict: 'correct', attempts: 1, hintUsed: false, phase: 'practice', timestamp: T0 + 28 * DAY
    });
    expect(blended.confidence).toBeLessThan(0.7);
  });

  it('folding a sequence via blendSkillState matches sequential updateSkillState calls', () => {
    // This is the load-bearing consistency property: recompute from the log
    // (one fold per event) reproduces the incremental write path.
    const outcomes: SkillOutcome[] = [
      { skillTag: 'x', verdict: 'correct', attempts: 1, hintUsed: false, phase: 'diagnostic', timestamp: T0 },
      { skillTag: 'x', verdict: 'incorrect', attempts: 3, hintUsed: true, phase: 'practice', timestamp: T0 + 3 * DAY },
      { skillTag: 'x', verdict: 'correct', attempts: 1, hintUsed: false, phase: 'mastery_check', timestamp: T0 + 40 * DAY }
    ];
    // incremental blend
    let acc: SkillStateResult | null = null;
    for (const o of outcomes) acc = blendSkillState(acc, o);
    // manual sequential update with decay applied explicitly
    const dec = (c: number, last: number, now: number) => decaySince(c, last, now);
    let m = updateSkillState(null, outcomes[0]);
    const m1 = updateSkillState(
      { levelScore: m.levelScore, confidence: dec(m.confidence, m.lastSeen, outcomes[1].timestamp), evidenceCount: m.evidenceCount, source: m.source },
      outcomes[1]
    );
    const m2 = updateSkillState(
      { levelScore: m1.levelScore, confidence: dec(m1.confidence, m1.lastSeen, outcomes[2].timestamp), evidenceCount: m1.evidenceCount, source: m1.source },
      outcomes[2]
    );
    expect(acc!.levelScore).toBeCloseTo(m2.levelScore, 8);
    expect(acc!.confidence).toBeCloseTo(m2.confidence, 8);
    expect(acc!.evidenceCount).toBe(m2.evidenceCount);
  });
});

describe('#10 Pattern Signal detectors (deterministic)', () => {
  it('persists_after_hint: hint shown then later correct -> supports true', () => {
    // hint shown for task t1 (attempt 1 wrong/partial), then resolved correct
    const events: SessionEventLike[] = [
      { type: 'hint_shown', at: T0, meta: { taskId: 't1', level: 1 } },
      attempt({ verdict: 'correct', attempts: 2, hintUsed: true, resolved: true, observed: 'ok' })
    ];
    events[1].meta!.taskId = 't1';
    const obs = detectPatternObservations(events);
    const p = obs.find((o) => o.tag === 'persists_after_hint');
    expect(p).toBeTruthy();
    expect(p!.supports).toBe(true);
    expect(p!.source).toBe('deterministic');
  });

  it('persists_after_hint: hint then still wrong -> supports false', () => {
    const events: SessionEventLike[] = [
      { type: 'hint_shown', at: T0, meta: { taskId: 't1', level: 1 } },
      attempt({ verdict: 'incorrect', attempts: 3, hintUsed: true, resolved: true })
    ];
    events[1].meta!.taskId = 't1';
    const obs = detectPatternObservations(events);
    const p = obs.find((o) => o.tag === 'persists_after_hint');
    expect(p?.supports).toBe(false);
  });

  it('rushes_when_confident: overconfident_wrong nudges -> supports true', () => {
    const events: SessionEventLike[] = [
      { type: 'nudge_shown', at: T0, meta: { kind: 'encourage_retry', reason: 'overconfident_wrong' } },
      { type: 'nudge_shown', at: T0 + 1, meta: { kind: 'encourage_retry', reason: 'overconfident_wrong' } }
    ];
    const obs = detectPatternObservations(events);
    const p = obs.find((o) => o.tag === 'rushes_when_confident');
    expect(p?.supports).toBe(true);
    expect(p!.confidence).toBeGreaterThan(0.35); // grows with recurrence
    expect(p!.confidence).toBeLessThanOrEqual(0.6);
  });

  it('rushes_when_confident: many first-try wrongs with no overconfident nudge -> supports false', () => {
    const events: SessionEventLike[] = [
      attempt({ verdict: 'incorrect', attempts: 1, resolved: false }),
      attempt({ verdict: 'partial', attempts: 1, resolved: false }),
      attempt({ verdict: 'incorrect', attempts: 1, resolved: false })
    ];
    const obs = detectPatternObservations(events);
    const p = obs.find((o) => o.tag === 'rushes_when_confident');
    expect(p?.supports).toBe(false);
  });

  it('avoids_explaining: skipped_step nudges -> supports true', () => {
    const events: SessionEventLike[] = [
      { type: 'nudge_shown', at: T0, meta: { kind: 'are_you_sure', reason: 'skipped_step' } }
    ];
    const obs = detectPatternObservations(events);
    const p = obs.find((o) => o.tag === 'avoids_explaining');
    expect(p?.supports).toBe(true);
  });

  it('avoids_explaining: empty/short explanation verdicts -> supports true', () => {
    const events: SessionEventLike[] = [
      attempt({ answerType: 'explanation', verdict: 'captured', observed: 'um' })
    ];
    const obs = detectPatternObservations(events);
    const p = obs.find((o) => o.tag === 'avoids_explaining');
    expect(p?.supports).toBe(true);
  });

  it('benefits_from_visuals: manipulative success >> numeric success -> supports true', () => {
    const events: SessionEventLike[] = [
      attempt({ skillTag: 'arrays', answerType: 'manipulative', verdict: 'correct', attempts: 1 }),
      attempt({ skillTag: 'arrays', answerType: 'manipulative', verdict: 'correct', attempts: 1 }),
      attempt({ skillTag: 'arrays', answerType: 'numeric', verdict: 'incorrect', attempts: 3 })
    ];
    const obs = detectPatternObservations(events);
    const p = obs.find((o) => o.tag === 'benefits_from_visuals');
    expect(p?.supports).toBe(true);
  });

  it('benefits_from_visuals: numeric >> manipulative -> supports false', () => {
    const events: SessionEventLike[] = [
      attempt({ skillTag: 'arrays', answerType: 'numeric', verdict: 'correct', attempts: 1 }),
      attempt({ skillTag: 'arrays', answerType: 'manipulative', verdict: 'incorrect', attempts: 3 })
    ];
    const obs = detectPatternObservations(events);
    const p = obs.find((o) => o.tag === 'benefits_from_visuals');
    expect(p?.supports).toBe(false);
  });

  it('ignores non-resolved attempts and pre-#10 (no skillTag) events', () => {
    const events: SessionEventLike[] = [
      { type: 'task_attempt', at: T0, meta: { status: 'correct', attempts: 1 } }, // no skillTag, no resolved
      attempt({ resolved: false })
    ];
    expect(detectPatternObservations(events)).toEqual([]);
  });
});

describe('#10 Pattern Signal — model proposals stay below the deterministic ceiling', () => {
  it('a model-proposed pattern never reaches deterministic confidence', () => {
    // Fold many model observations; confidence is capped at the model ceiling (0.3).
    let signal = null as ReturnType<typeof updatePatternSignal> | null;
    for (let i = 0; i < 20; i++) {
      signal = updatePatternSignal(
        signal ? { score: signal.score, confidence: signal.confidence, evidenceCount: signal.evidenceCount, source: signal.source, lastSeen: signal.lastSeen } : null,
        { tag: 'responds_to_story_context', supports: true, source: 'model', confidence: 0.4, timestamp: T0 + i }
      );
    }
    expect(signal!.confidence).toBeLessThanOrEqual(0.3);
    expect(signal!.source).toBe('model');
  });

  it('deterministic signal can exceed the model ceiling', () => {
    let signal = null as ReturnType<typeof updatePatternSignal> | null;
    for (let i = 0; i < 10; i++) {
      signal = updatePatternSignal(
        signal ? { score: signal.score, confidence: signal.confidence, evidenceCount: signal.evidenceCount, source: signal.source, lastSeen: signal.lastSeen } : null,
        { tag: 'persists_after_hint', supports: true, source: 'deterministic', confidence: 0.5, timestamp: T0 + i }
      );
    }
    expect(signal!.confidence).toBeGreaterThan(0.3);
    expect(signal!.source).toBe('deterministic');
  });

  it('a single observation does not assert a trait: score damps modestly from neutral', () => {
    const signal = updatePatternSignal(null, {
      tag: 'benefits_from_visuals', supports: true, source: 'deterministic', confidence: 0.5, timestamp: T0
    });
    expect(signal.score).toBeLessThan(0.75); // not pinned to 1.0
    expect(signal.score).toBeGreaterThan(0.5);
    expect(signal.level).toBe('present');
  });

  it('evidence *against* a pattern lowers the score and can flip to absent', () => {
    let signal = updatePatternSignal(null, {
      tag: 'benefits_from_visuals', supports: true, source: 'deterministic', confidence: 0.5, timestamp: T0
    });
    for (let i = 0; i < 8; i++) {
      signal = updatePatternSignal(
        { score: signal.score, confidence: signal.confidence, evidenceCount: signal.evidenceCount, source: signal.source, lastSeen: signal.lastSeen },
        { tag: 'benefits_from_visuals', supports: false, source: 'deterministic', confidence: 0.5, timestamp: T0 + 1 + i }
      );
    }
    expect(signal.score).toBeLessThan(0.5);
    expect(signal.level).toBe('absent');
  });

  it('foldPatternSignal folds an observation list into one signal', () => {
    const obs: PatternObservation[] = [
      { tag: 'persists_after_hint', supports: true, source: 'deterministic', confidence: 0.5, timestamp: T0 },
      { tag: 'persists_after_hint', supports: true, source: 'deterministic', confidence: 0.5, timestamp: T0 + 1 }
    ];
    const s = foldPatternSignal(obs);
    expect(s!.evidenceCount).toBe(2);
    expect(s!.tag).toBe('persists_after_hint');
  });

  it('foldPatternSignal returns null for empty', () => {
    expect(foldPatternSignal([])).toBeNull();
  });
});

describe('#10 outcomeSignals weights (proof over noise)', () => {
  it('mastery first-try weighs more than practice first-try weighs more than hinted/retried', () => {
    const mastery = outcomeSignals({ skillTag: 'x', verdict: 'correct', attempts: 1, hintUsed: false, phase: 'mastery_check', timestamp: T0 });
    const practice = outcomeSignals({ skillTag: 'x', verdict: 'correct', attempts: 1, hintUsed: false, phase: 'practice', timestamp: T0 });
    const hinted = outcomeSignals({ skillTag: 'x', verdict: 'correct', attempts: 2, hintUsed: true, phase: 'practice', timestamp: T0 });
    expect(mastery.weight).toBe(2);
    expect(practice.weight).toBe(1);
    expect(hinted.weight).toBe(0.5);
  });

  it('diagnostic weighs 0.5', () => {
    const d = outcomeSignals({ skillTag: 'x', verdict: 'correct', attempts: 1, hintUsed: false, phase: 'diagnostic', timestamp: T0 });
    expect(d.weight).toBe(0.5);
  });
});

describe('#10 levelFromScore bands (shared invariant)', () => {
  it('maps score bands to humble levels', () => {
    expect(levelFromScore(0.2)).toBe('emerging');
    expect(levelFromScore(0.4)).toBe('developing');
    expect(levelFromScore(0.69)).toBe('developing');
    expect(levelFromScore(0.7)).toBe('secure');
    expect(levelFromScore(0.9)).toBe('secure');
  });
});
