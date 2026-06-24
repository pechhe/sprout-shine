// #10 — the Learner Model reducer. Pure functions only: no Convex, no Date.now
// except where a timestamp is taken from the event. The Learner Model is an
// aggregate over the immutable `sessionEvents` log; `skillStates` and
// `patternSignals` are derived. Every hypothesis carries a confidence so weak
// signals are never overstated; confidence erodes with staleness; the level
// never silently downgrades. See ADR-0002 and the Learner Model glossary.
//
// Design notes (load-bearing, hard to reverse per ADR-0002):
//  - One evidence point per *resolved* task. The resolved task_attempt event
//    carries the final verdict + total attempts + hintUsed, so the reducer
//    sees one honest data point per task (mirrors #9's "one point per
//    diagnostic item"). Mid-attempt events are audited but skipped by the
//    reducer — a wrong-first-then-correct task must not over-weight.
//  - updateSkillState blends a prior score with an outcome score, weighted by
//    outcome type (mastery proof > practice > hinted/retried ≈ diagnostic).
//    Confidence grows slowly via an EMA capped per data point.
//  - decay is confidence-only: the level is frozen until new evidence
//    contradicts it. Computed lazily on read; folded in on the next write.

import type { VerdictStatus } from './grade';
import type {
  AnswerType,
  DeterministicPatternTag,
  PatternSignalTag,
  Phase
} from './vocab';
import { DETERMINISTIC_PATTERN_TAGS } from './vocab';
import { levelFromScore, type SkillLevel } from './skillState';

// --- Skill Outcome: the normalized unit a skill update consumes ---

export type SkillOutcomePhase = Phase | 'diagnostic';

export type SkillOutcome = {
  skillTag: string;
  verdict: VerdictStatus;
  attempts: number; // total tries on this task (1 = first try)
  hintUsed: boolean;
  phase: SkillOutcomePhase;
  answerType?: AnswerType;
  timestamp: number;
};

// Minimal event shape the reducer consumes. The full Convex doc satisfies this;
// tests build bare objects. `meta` is `v.any()` at the schema, soAbsent fields
// mean "pre-#10 event" and are skipped.
export type SessionEventLike = {
  type: string;
  meta?: Record<string, unknown> | null;
  at: number;
};

/**
 * Normalize a Session Event into a Skill Outcome.
 * Returns null for:
 *  - non-attempt events (hints, nudges, phase changes, …)
 *  - task_attempts that are not yet resolved (mid-task) — only the resolved
 *    attempt is an evidence unit (it carries the final verdict + total
 *    attempts, matching the Skill Outcome shape).
 *  - events lacking meta.skillTag (pre-#10 rows) — skipped, no migration.
 */
export function skillOutcomeFromEvent(ev: SessionEventLike): SkillOutcome | null {
  if (ev.type !== 'task_attempt') return null;
  const meta = ev.meta ?? {};
  const skillTag = typeof meta.skillTag === 'string' ? meta.skillTag : null;
  if (!skillTag) return null; // pre-#10 event — no skill context
  // Only the resolved attempt is an evidence unit.
  if (meta.resolved !== true) return null;
  const verdict = meta.status as VerdictStatus | undefined;
  if (verdict !== 'correct' && verdict !== 'partial' && verdict !== 'incorrect' && verdict !== 'captured') {
    return null;
  }
  const phase = (meta.phase as SkillOutcomePhase | undefined) ?? 'practice';
  return {
    skillTag,
    verdict,
    attempts: typeof meta.attempts === 'number' ? meta.attempts : 1,
    hintUsed: meta.hintUsed === true,
    phase,
    answerType: meta.answerType as AnswerType | undefined,
    timestamp: ev.at
  };
}

// --- Skill State: one hypothesis for a single Skill Tag ---

export type SkillStateInput = {
  levelScore: number;
  confidence: number;
  evidenceCount: number;
  misconceptions?: unknown;
  source?: string;
};

export type SkillStateResult = {
  level: SkillLevel;
  levelScore: number;
  confidence: number;
  evidenceCount: number;
  lastSeen: number;
  source: string;
  updatedAt: number;
};

// Per-outcome trust/weight. Weights per ADR-0002: mastery first-try = 2,
// practice first-try = 1, hinted/retried = 0.5, diagnostic = 0.5.
export type OutcomeSignals = { score: number; conf: number; weight: number };

function correctnessScore(o: SkillOutcome): number {
  if (o.verdict === 'captured') return 0.5; // explanation — neutral, not a graded level
  const correct = o.verdict === 'correct';
  if (!correct) return 0.2; // wrong — argues the skill is not yet secure
  const firstTry = o.attempts === 1 && !o.hintUsed;
  if (firstTry) return 0.85;
  if (o.attempts <= 2 && !o.hintUsed) return 0.65;
  return 0.45; // hint or several tries
}

function outcomeConfidence(o: SkillOutcome): number {
  if (o.verdict === 'captured') return 0.2; // explanation — very low trust, no level claim
  const correct = o.verdict === 'correct';
  if (!correct) return 0.35;
  const firstTry = o.attempts === 1 && !o.hintUsed;
  if (firstTry) {
    if (o.phase === 'mastery_check') return 0.7;
    if (o.phase === 'diagnostic') return 0.5;
    return 0.6; // practice / warm_up
  }
  if (o.attempts <= 2 && !o.hintUsed) return o.phase === 'diagnostic' ? 0.35 : 0.4;
  return 0.35; // hinted or several tries
}

function outcomeWeight(o: SkillOutcome): number {
  if (o.verdict === 'captured') return 0.5; // captured is low-stakes
  if (o.phase === 'diagnostic') return 0.5;
  const firstTry = o.attempts === 1 && !o.hintUsed;
  if (o.phase === 'mastery_check' && firstTry) return 2;
  if (firstTry) return 1; // practice / warm_up
  return 0.5; // hinted or retried
}

export function outcomeSignals(o: SkillOutcome): OutcomeSignals {
  return { score: correctnessScore(o), conf: outcomeConfidence(o), weight: outcomeWeight(o) };
}

// Confidence EMA rate: a single data point moves confidence toward the outcome's
// trust by at most α. Kept small so one good/bad day cannot harden a hypothesis.
const CONFIDENCE_ALPHA = 0.2;

/**
 * Incremental weighted blend. The no-prior case (prior == null) is the
 * degenerate that produces a single-outcome Skill State — this is the path the
 * diagnostic takes, so diagnostic and lesson evidence share one code path.
 */
export function updateSkillState(prior: SkillStateInput | null, outcome: SkillOutcome): SkillStateResult {
  const { score, conf, weight } = outcomeSignals(outcome);
  const source = outcome.phase === 'diagnostic' ? 'diagnostic' : 'lesson';

  if (!prior) {
    return {
      level: levelFromScore(score),
      levelScore: score,
      confidence: conf,
      evidenceCount: 1,
      lastSeen: outcome.timestamp,
      source,
      updatedAt: outcome.timestamp
    };
  }

  // priorWeight tracks the count of evidence points seen so far — a simple,
  // well-behaved incremental mean where each new point's pull is its outcome
  // weight. More prior evidence → slower movement (the level stabilises).
  const priorWeight = Math.max(prior.evidenceCount, 1);
  const totalWeight = priorWeight + weight;
  const newScore = (prior.levelScore * priorWeight + score * weight) / totalWeight;

  // Confidence grows slowly: EMA toward this outcome's trust, capped per point.
  const newConfidence = prior.confidence * (1 - CONFIDENCE_ALPHA) + conf * CONFIDENCE_ALPHA;

  return {
    level: levelFromScore(newScore),
    levelScore: newScore,
    confidence: newConfidence,
    evidenceCount: prior.evidenceCount + 1,
    lastSeen: outcome.timestamp,
    // Once a lesson touches a diagnostic-seeded state, it is lesson-sourced.
    source: prior.source === 'lesson' || source === 'lesson' ? 'lesson' : 'diagnostic',
    updatedAt: outcome.timestamp
  };
}

/**
 * The single folding function used by BOTH the incremental write path and the
 * full recompute: it decays the prior confidence by the time gap to this
 * outcome *before* blending (persisting staleness on write, per ADR-0002), so a
 * recompute from the log reproduces the incremental result exactly.
 */
export function blendSkillState(prior: SkillStateResult | null, outcome: SkillOutcome): SkillStateResult {
  const priorInput: SkillStateInput | null = prior
    ? {
        levelScore: prior.levelScore,
        confidence: decaySince(prior.confidence, prior.lastSeen, outcome.timestamp),
        evidenceCount: prior.evidenceCount,
        source: prior.source
      }
    : null;
  return updateSkillState(priorInput, outcome);
}

// --- decay: confidence-only erosion, level never decays ---

const DAY_MS = 24 * 60 * 60 * 1000;
// Grace: factor is 1.0 today, ~0.85 at 14d, ~0.72(≈0.7) at 28d, ~0.52(≈0.5) at
// 56d, floored at 0.25. A stale strong signal never drops below 25% of its
// fresh confidence — it is not treated as current certainty, but not zeroed.
const DECAY_BASE = 0.85; // per 14 days
const DECAY_PERIOD_DAYS = 14;
const DECAY_FLOOR = 0.25;

/**
 * Confidence-only erosion. `daysSince` < ~14d stays near full (grace); the
 * factor then shrinks toward the floor. The level is never touched here.
 */
export function decay(confidence: number, daysSince: number): number {
  if (daysSince <= 0) return confidence;
  const factor = Math.max(DECAY_FLOOR, Math.pow(DECAY_BASE, daysSince / DECAY_PERIOD_DAYS));
  return confidence * factor;
}

/** Convenience: decay a confidence given two timestamps. */
export function decaySince(confidence: number, lastSeen: number, now: number): number {
  return decay(confidence, (now - lastSeen) / DAY_MS);
}

// --- Pattern Signals: hypotheses about *how* a child learns ---

export type PatternSource = 'deterministic' | 'model';
// A model guess can never harden into a trait: its confidence ceiling is low.
const PATTERN_CONFIDENCE_CEILING: Record<PatternSource, number> = {
  model: 0.3,
  deterministic: 0.7
};
// Pattern score EMA — a touch faster than skill confidence (patterns are soft),
// but still damped so a single observation doesn't assert a trait.
const PATTERN_ALPHA = 0.3;

export type PatternObservation = {
  tag: PatternSignalTag;
  supports: boolean; // true = evidence for the pattern; false = against
  source: PatternSource;
  confidence: number; // trust in this single observation
  timestamp: number;
};

export type PatternSignalInput = {
  score: number; // 0..1 likelihood the pattern holds (0.5 = no claim)
  confidence: number;
  evidenceCount: number;
  source: PatternSource;
  lastSeen?: number;
};

export type PatternSignalResult = {
  tag: PatternSignalTag;
  score: number;
  level: 'present' | 'absent';
  confidence: number;
  evidenceCount: number;
  source: PatternSource;
  lastSeen: number;
  updatedAt: number;
};

function strongerSource(
  prior: PatternSignalInput | undefined,
  obs: PatternSource
): PatternSource {
  if (prior?.source === 'deterministic' || obs === 'deterministic') return 'deterministic';
  return 'model';
}

/**
 * Fold one Pattern Observation into a Pattern Signal. Model-proposed
 * observations are capped at a low confidence ceiling so a model guess can
 * never harden into a trait; deterministic observations may reach higher.
 */
export function updatePatternSignal(
  prior: PatternSignalInput | null,
  obs: PatternObservation
): PatternSignalResult {
  const target = obs.supports ? 1 : 0;
  const source = strongerSource(prior ?? undefined, obs.source);
  const ceiling = PATTERN_CONFIDENCE_CEILING[source];

  if (!prior) {
    // One observation damps from the neutral 0.5 toward the target — it never
    // asserts a trait on a single signal. The dampening is small: even a
    // high-confidence single observation stays modest (< ~0.75).
    const score = 0.5 + (target - 0.5) * (0.25 + 0.25 * obs.confidence);
    const confidence = Math.min(obs.confidence * 0.5, ceiling);
    return {
      tag: obs.tag,
      score,
      level: score >= 0.5 ? 'present' : 'absent',
      confidence,
      evidenceCount: 1,
      source,
      lastSeen: obs.timestamp,
      updatedAt: obs.timestamp
    };
  }

  const score = prior.score + PATTERN_ALPHA * (target - prior.score);
  let confidence = prior.confidence * (1 - PATTERN_ALPHA) + obs.confidence * PATTERN_ALPHA;
  confidence = Math.min(confidence, ceiling);

  return {
    tag: obs.tag,
    score,
    level: score >= 0.5 ? 'present' : 'absent',
    confidence,
    evidenceCount: prior.evidenceCount + 1,
    source,
    lastSeen: obs.timestamp,
    updatedAt: obs.timestamp
  };
}

// --- Deterministic Pattern detectors over an ordered event log ---
//
// Each detector is authoritative where it exists (ADR-0002) and emits
// observations at higher confidence than model proposals. `responds_to_story_
// context` and `loses_focus_on_long_explanation` are deliberately NOT detected
// here — they stay model-only until plan tags / timing events exist.

type ResolvedAttempt = {
  taskId?: string;
  skillTag: string;
  verdict: VerdictStatus;
  answerType?: AnswerType;
  at: number;
};

function resolvedAttempts(events: SessionEventLike[]): ResolvedAttempt[] {
  const out: ResolvedAttempt[] = [];
  for (const ev of events) {
    if (ev.type !== 'task_attempt') continue;
    const m = ev.meta ?? {};
    if (m.resolved !== true) continue;
    const skillTag = typeof m.skillTag === 'string' ? m.skillTag : null;
    if (!skillTag) continue;
    const verdict = m.status as VerdictStatus;
    if (verdict !== 'correct' && verdict !== 'partial' && verdict !== 'incorrect' && verdict !== 'captured') continue;
    out.push({
      taskId: typeof m.taskId === 'string' ? m.taskId : undefined,
      skillTag,
      verdict,
      answerType: m.answerType as AnswerType | undefined,
      at: ev.at
    });
  }
  return out;
}

function detectPersistsAfterHint(events: SessionEventLike[], out: PatternObservation[]) {
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.type !== 'hint_shown') continue;
    const taskId = ev.meta?.taskId as string | undefined;
    if (!taskId) continue;
    // The next resolved attempt for the same task tells us if the hint helped.
    for (let j = i + 1; j < events.length; j++) {
      const m = events[j].meta ?? {};
      if (events[j].type !== 'task_attempt' || m.resolved !== true) continue;
      if (m.taskId !== taskId) continue;
      const correct = m.status === 'correct';
      out.push({
        tag: 'persists_after_hint',
        supports: correct,
        source: 'deterministic',
        confidence: correct ? 0.5 : 0.3,
        timestamp: events[j].at
      });
      break; // the resolved attempt settles this hint sequence
    }
  }
}

function detectRushesWhenConfident(events: SessionEventLike[], out: PatternObservation[]) {
  let overconfident = 0;
  let attempt1Wrongs = 0;
  for (const ev of events) {
    if (ev.type === 'nudge_shown' && ev.meta?.reason === 'overconfident_wrong') overconfident++;
    if (ev.type === 'task_attempt' && ev.meta?.attempts === 1 && ev.meta?.resolved !== true) {
      const st = ev.meta?.status;
      if (st === 'incorrect' || st === 'partial') attempt1Wrongs++;
    }
  }
  if (overconfident >= 1) {
    out.push({
      tag: 'rushes_when_confident',
      supports: true,
      source: 'deterministic',
      // confidence grows with recurrence, capped below the deterministic ceiling
      confidence: Math.min(0.35 + 0.1 * (overconfident - 1), 0.6),
      timestamp: events[events.length - 1]?.at ?? Date.now()
    });
  } else if (attempt1Wrongs >= 3) {
    // Enough first-try wrongs with *no* overconfident nudges argues against.
    out.push({
      tag: 'rushes_when_confident',
      supports: false,
      source: 'deterministic',
      confidence: 0.35,
      timestamp: events[events.length - 1]?.at ?? Date.now()
    });
  }
}

function detectAvoidsExplaining(events: SessionEventLike[], out: PatternObservation[]) {
  let avoidCount = 0;
  for (const ev of events) {
    if (ev.type === 'nudge_shown' && ev.meta?.reason === 'skipped_step') avoidCount++;
    if (ev.type === 'task_attempt' && ev.meta?.answerType === 'explanation') {
      // empty / very short explanation captured text → avoids explaining
      const text = (ev.meta?.observed as string | undefined) ?? '';
      if (text.trim().length < 6) avoidCount++;
    }
  }
  if (avoidCount >= 1) {
    out.push({
      tag: 'avoids_explaining',
      supports: true,
      source: 'deterministic',
      confidence: Math.min(0.3 + 0.1 * (avoidCount - 1), 0.6),
      timestamp: events[events.length - 1]?.at ?? Date.now()
    });
  }
}

function detectBenefitsFromVisuals(events: SessionEventLike[], out: PatternObservation[]) {
  const attempts = resolvedAttempts(events);
  // Per skill tag, compare manipulative vs numeric success rates.
  const bySkill = new Map<string, { manip: { ok: number; n: number }; numeric: { ok: number; n: number } }>();
  for (const a of attempts) {
    if (a.verdict === 'captured') continue; // explanations aren't manipulative/numeric
    const ok = a.verdict === 'correct' ? 1 : 0;
    const bucket = bySkill.get(a.skillTag) ?? { manip: { ok: 0, n: 0 }, numeric: { ok: 0, n: 0 } };
    if (a.answerType === 'manipulative') {
      bucket.manip.ok += ok;
      bucket.manip.n++;
    } else if (a.answerType === 'numeric') {
      bucket.numeric.ok += ok;
      bucket.numeric.n++;
    }
    bySkill.set(a.skillTag, bucket);
  }
  for (const [, b] of bySkill) {
    if (b.manip.n < 1 || b.numeric.n < 1) continue; // need both to compare
    const manipRate = b.manip.ok / b.manip.n;
    const numericRate = b.numeric.ok / b.numeric.n;
    if (manipRate >= numericRate + 0.3) {
      out.push({
        tag: 'benefits_from_visuals',
        supports: true,
        source: 'deterministic',
        confidence: 0.5,
        timestamp: events[events.length - 1]?.at ?? Date.now()
      });
    } else if (numericRate >= manipRate + 0.3) {
      out.push({
        tag: 'benefits_from_visuals',
        supports: false,
        source: 'deterministic',
        confidence: 0.4,
        timestamp: events[events.length - 1]?.at ?? Date.now()
      });
    }
  }
}

/**
 * Run all deterministic Pattern detectors over an ordered event log, returning
 * Pattern Observations. Pure: same log → same observations.
 */
export function detectPatternObservations(events: SessionEventLike[]): PatternObservation[] {
  const out: PatternObservation[] = [];
  detectPersistsAfterHint(events, out);
  detectRushesWhenConfident(events, out);
  detectAvoidsExplaining(events, out);
  detectBenefitsFromVisuals(events, out);
  return out;
}

/** The deterministic tags this module can detect (for the read surface). */
export const DETECTABLE_PATTERN_TAGS: readonly DeterministicPatternTag[] = DETERMINISTIC_PATTERN_TAGS;

// --- helpers shared with the persistence layer ---

/** Fold an ordered list of observations into one signal per tag. */
export function foldPatternSignal(
  observations: PatternObservation[]
): PatternSignalResult | null {
  if (observations.length === 0) return null;
  let signal: PatternSignalResult | null = null;
  for (const obs of observations) {
    const prior: PatternSignalInput | null = signal
      ? {
          score: signal.score,
          confidence: signal.confidence,
          evidenceCount: signal.evidenceCount,
          source: signal.source,
          lastSeen: signal.lastSeen
        }
      : null;
    signal = updatePatternSignal(prior, obs);
  }
  return signal;
}
