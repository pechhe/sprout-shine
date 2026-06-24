// #9 — turn diagnostic events into initial skill-state estimates. Pure + testable.
// Design: a diagnostic item is ONE data point, so confidence stays low (<=0.5)
// so weak signals are never overtreated as facts. #10 will raise confidence as
// lessons add evidence over time.

import type { MisconceptionTag } from './vocab';
import type { VerdictStatus } from './grade';

export type SkillLevel = 'emerging' | 'developing' | 'secure';

export type DiagnosticOutcome = {
  verdict: VerdictStatus;
  attempts: number; // tries taken (1 = first try)
  hintUsed: boolean;
  resolved: boolean; // task completed (correctly or via max attempts)
};

export type SkillEstimate = {
  level: SkillLevel;
  levelScore: number; // 0..1
  confidence: number; // 0..1 — kept low for a single diagnostic signal
  evidenceCount: number;
  misconceptions: MisconceptionTag[];
};

// Map a 0..1 score to a humble level band.
export function levelFromScore(score: number): SkillLevel {
  if (score < 0.4) return 'emerging';
  if (score < 0.7) return 'developing';
  return 'secure';
}

/** Estimate a skill from a single diagnostic task outcome. */
export function estimateSkillFromDiagnostic(
  outcome: DiagnosticOutcome,
  misconception?: MisconceptionTag | null
): SkillEstimate {
  const evidenceCount = 1;
  const { verdict, attempts, hintUsed, resolved } = outcome;

  // explanation/captured answers are evidence, not a graded level — record neutrally.
  if (verdict === 'captured') {
    return {
      level: 'developing',
      levelScore: 0.5,
      confidence: 0.2,
      evidenceCount,
      misconceptions: []
    };
  }

  let score: number;
  if (!resolved) {
    score = 0.2; // didn't get there even with chances
  } else if (attempts === 1 && !hintUsed) {
    score = 0.85; // first-try, no help
  } else if (attempts <= 2 && !hintUsed) {
    score = 0.65; // got it on a second try
  } else {
    score = 0.45; // needed a hint or several tries
  }

  // A single diagnostic item is weak evidence — cap confidence.
  const confidence = score >= 0.8 ? 0.5 : 0.35;

  return {
    level: levelFromScore(score),
    levelScore: score,
    confidence,
    evidenceCount,
    misconceptions: misconception ? [misconception] : []
  };
}

// --- parent-facing (humble, no scores/labels) ---
export type ParentSkillView = {
  skillTag: string;
  level: SkillLevel; // shown as a neutral phrase, never a "score"
  phrase: string;
  strength?: string;
};

const PHRASES: Record<SkillLevel, string> = {
  emerging: 'just starting to explore this',
  developing: 'growing in confidence with this',
  secure: 'comfortable with this'
};

/** Build a humble, parent-facing view that avoids harsh scores or labels. */
export function parentSkillView(skillTag: string, level: SkillLevel): ParentSkillView {
  return { skillTag, level, phrase: PHRASES[level] };
}

/** Compose the positive, specific closing note from the child's strongest areas. */
export function closingFeedback(strongest: SkillEstimate[], skillNames: string[]): string {
  if (strongest.length === 0) return 'You tried lots of different kinds of maths today — well done for having a go at each one!';
  const names = strongest.map((_, i) => skillNames[i]).filter(Boolean);
  if (names.length === 0) return 'You showed some lovely thinking today — well done!';
  return `You were especially strong at ${names.slice(0, 2).join(' and ')} today. That's real mathematician thinking — well done!`;
}
