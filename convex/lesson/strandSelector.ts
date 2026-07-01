// #14 — the Strand Selector. A pure, deterministic ranked list of candidate
// Skill Tags for the lesson engine to pre-warm next, derived from the Learner
// Model (`skillStates` + recent mastery results) plus optional strand override.
//
// Priorities, highest first (ADR-0001: the validated plan is the guardrail, so
// the selector only chooses a *target* — it never picks the content):
//   1. Consolidation: a skill just passed in the last mastery check (recency
//     checked via decaySince/decay), within CONSOLIDATION_LESSONS lessons of
//      the pass — secure it before moving on.
//   2. Weakest active skill: lowest confidence among non-stale skills in the
//      active window, EXCLUDING stuck skills (unresolved mastery across
//      STUCK_THRESHOLD_UNRESOLVED sessions — don't pile on a failing skill).
//   3. Stuck skills: only considered once all consolidation and active-weak
//      candidates are exhausted, because a stuck skill needs the anchor's
//      known-good path, not more of the same failing pressure.
//
// The selector emits a RANKED LIST (not a single pick) so the pre-warm cache
// (PREWARM_CACHE_SIZE) can hold the top 1–2 candidates, covering both "continue"
// and "switch" redirection paths. A parent Focus Strand (future Parent Interview)
// overrides only the #1 candidate; the ranked list and priorities stay stable.
//
// All thresholds are named, single-source constants co-located with the
// DECAY_* constants. A code comment (not an ADR) records that these priors are
// expected to be revised after pilot feedback.

import { decaySince } from './learnerModel';
import { strandForSkillTag, STRAND_ANCHOR_SKILL, type Strand } from './vocab';

// --- selector thresholds (priors; expected to be revised after pilot) -------
// Co-located with DECAY_* in learnerModel.ts (single mental model: the just-
// passed recency check reuses the decay clock rather than a parallel staleness
// check). A skill counts as "just passed" while its mastery pass is still
// above RECENCY_CONFIDENCE after decaySince.
export const STUCK_THRESHOLD_UNRESOLVED = 3; // unresolved mastery across N sessions -> stuck
export const ACTIVE_WINDOW_DAYS = 14; // a skill is "active" if seen within this window
export const CONSOLIDATION_LESSONS = 1; // how many lessons to consolidate a just-passed skill
// A mastery pass whose decayed confidence is still above this counts as "just passed".
const RECENCY_CONFIDENCE = 0.4;

const DAY_MS = 24 * 60 * 60 * 1000;

// --- input contract ---------------------------------------------------------
// The Learner Model read surface skill row (`LearnerModelView['skills'][n]`)
// carries the fields the selector needs. Kept structural (not importing the
// Convex-generated type) so the pure selector is unit-testable with bare data.
export type SelectorSkillState = {
  skillTag: string;
  level: 'emerging' | 'developing' | 'secure';
  levelScore: number;
  confidence: number;
  evidenceCount: number;
  lastSeen: number;
};

export type MasteryResult = 'passed' | 'unresolved';

export type SelectorInput = {
  skills: SelectorSkillState[];
  /**
   * Per-skill recent mastery outcomes, keyed by skillTag. `passed` marks a
   * just-passed mastery check eligible for consolidation; `unresolved` marks a
   * mastery check the child could not resolve. Repeats of `unresolved` up to
   * STUCK_THRESHOLD_UNRESOLVED mark a skill as stuck.
   */
  recentMasteryResults?: Record<string, MasteryResult[]>;
  /** Session count per skill since its last resolved mastery pass. */
  unresolvedCounts?: Record<string, number>;
  /** Optional parent Focus Strand (#2 Parent Interview, future): overrides the #1 candidate only. */
  focusStrand?: Strand | null;
  /** The "now" timestamp; injected so the selector stays pure and testable. */
  now: number;
};

export type RankedCandidate = {
  skillTag: string;
  strand: Strand;
  reason: 'consolidation' | 'weakest_active' | 'stuck';
  rank: number;
};

// Is this skill's most recent mastery outcome a pass still within the
// consolidation recency window? Uses the shared decay clock (not a parallel
// staleness check) — one mental model per ADR-0002.
function isJustPassed(
  skill: SelectorSkillState,
  results: MasteryResult[] | undefined,
  now: number
): boolean {
  if (!results) return false;
  const last = results[results.length - 1];
  if (last !== 'passed') return false;
  // The pass is "recent" while its decayed confidence stays above the floor.
  return decaySince(skill.confidence, skill.lastSeen, now) >= RECENCY_CONFIDENCE;
}

// A skill is stuck when unresolved mastery has recurred across the threshold
// number of sessions — the selector deprioritises it (behavioural frustration
// rescue: stop piling on a failing skill) without ever labelling the child.
function isStuck(unresolvedCount: number | undefined): boolean {
  return (unresolvedCount ?? 0) >= STUCK_THRESHOLD_UNRESOLVED;
}

// A skill is "active" if it has evidence within the active window.
function isActive(skill: SelectorSkillState, now: number): boolean {
  return (now - skill.lastSeen) / DAY_MS <= ACTIVE_WINDOW_DAYS;
}

/**
 * The pure Strand Selector. Returns a ranked list of candidate Skill Tags,
 * highest first: consolidation passes, then weakest active skills, then stuck
 * skills (which use the anchor's safe path). Drops skills with no strand
 * mapping. A focusStrand overrides only the #1 candidate.
 */
export function selectStrand(input: SelectorInput): RankedCandidate[] {
  const { skills, recentMasteryResults = {}, unresolvedCounts = {}, focusStrand = null, now } = input;

  const candidates: RankedCandidate[] = [];

  for (const skill of skills) {
    const strand = strandForSkillTag(skill.skillTag);
    if (!strand) continue; // unknown skill — no strand anchor exists

    const justPassed = isJustPassed(skill, recentMasteryResults[skill.skillTag], now);
    const stuck = isStuck(unresolvedCounts[skill.skillTag]);

    if (justPassed) {
      candidates.push({ skillTag: skill.skillTag, strand, reason: 'consolidation', rank: 0 });
    } else if (isActive(skill, now) && !stuck) {
      candidates.push({ skillTag: skill.skillTag, strand, reason: 'weakest_active', rank: 0 });
    } else if (stuck) {
      candidates.push({ skillTag: skill.skillTag, strand, reason: 'stuck', rank: 0 });
    }
    // inactive & non-stuck skills with no just-pass: not a candidate this cycle.
  }

  // Sort within each reason bucket:
  //  - consolidation: most recent pass first (highest lastSeen)
  //  - weakest_active: lowest confidence first (the shakiest active skill)
  //  - stuck: lowest confidence first (most in need of the anchor's safe path)
  const byReason: Record<RankedCandidate['reason'], RankedCandidate[]> = {
    consolidation: [],
    weakest_active: [],
    stuck: []
  };
  for (const c of candidates) byReason[c.reason].push(c);
  byReason.consolidation.sort((a, b) => {
    const sa = skills.find((s) => s.skillTag === a.skillTag)!;
    const sb = skills.find((s) => s.skillTag === b.skillTag)!;
    return sb.lastSeen - sa.lastSeen;
  });
  byReason.weakest_active.sort((a, b) => {
    const sa = skills.find((s) => s.skillTag === a.skillTag)!;
    const sb = skills.find((s) => s.skillTag === b.skillTag)!;
    return sa.confidence - sb.confidence;
  });
  byReason.stuck.sort((a, b) => {
    const sa = skills.find((s) => s.skillTag === a.skillTag)!;
    const sb = skills.find((s) => s.skillTag === b.skillTag)!;
    return sa.confidence - sb.confidence;
  });

  const ordered = [...byReason.consolidation, ...byReason.weakest_active, ...byReason.stuck];

  // De-duplicate by strand: keep the highest-priority candidate per strand so
  // the pre-warm cache holds distinct strands (covers continue + switch paths).
  const seenStrands = new Set<Strand>();
  const deduped: RankedCandidate[] = [];
  for (const c of ordered) {
    if (seenStrands.has(c.strand)) continue;
    seenStrands.add(c.strand);
    deduped.push(c);
  }

  // Apply ranks.
  deduped.forEach((c, i) => (c.rank = i + 1));

  // Parent Focus Strand override (future #2 Parent Interview): overrides ONLY
  // the #1 candidate. The ranked list and priorities otherwise stay stable.
  if (focusStrand) {
    const idx = deduped.findIndex((c) => c.strand === focusStrand);
    if (idx > 0) {
      const [focus] = deduped.splice(idx, 1);
      deduped.unshift(focus);
    } else if (idx === -1) {
      // No candidate surfaced for the focus strand this cycle; the override
      // still wins as the top candidate (the anchor covers it safely).
      deduped.unshift({
        skillTag: STRAND_ANCHOR_SKILL[focusStrand],
        strand: focusStrand,
        reason: 'consolidation',
        rank: 0
      });
    }
    deduped.forEach((c, i) => (c.rank = i + 1));
  }

  return deduped;
}

