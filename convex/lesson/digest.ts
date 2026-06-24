// #11 — Weekly Digest, pure layers 1 + 3. Layer 1 builds a deterministic,
// week-scoped Evidence Pack from the Learner Model (#10) and structured
// session events. Layer 3 is the deterministic guardrail: a concept-level
// banned-label scan, a cautious-phrase presence check per section, a footer
// injected verbatim, and a regenerate-once-then-template-fallback repair loop.
//
// Layer 2 (the constrained LLM draft) lives in ../digests.ts and *proposes*
// narrative; this module *disposes* on evidence and safety — the same
// "LLM proposes, the system disposes" pattern as the lesson engine (ADR-0001)
// and the Learner Model (ADR-0002). See ADR-0003.
//
// Pure by design: no Convex, no Date.now. All time comes in as numbers. The
// draft/guardrail loop takes an injected `regenerate` function so it is fully
// unit-testable with a deterministic stub (the LLM call is supplied by the
// action layer).

import type { MisconceptionTag, PatternSignalTag } from './vocab';
import type { SkillLevel } from './skillState';
import { levelFromScore } from './skillState';
import type { SessionEventLike } from './learnerModel';

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Week math (UTC, Monday-based). Deterministic across server runs. A child
// timezone field is future work; UTC keeps the named-week comparison honest.
// ---------------------------------------------------------------------------

/** Monday 00:00 UTC of the week containing `ms`. */
export function weekStartMs(ms: number): number {
  const d = new Date(ms);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7; // Sun=6 .. Sat=5, Mon=0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday);
}

/** Half-open week window [Monday 00:00, next Monday 00:00) containing `ms`. */
export function weekRangeMs(ms: number): [number, number] {
  const start = weekStartMs(ms);
  return [start, start + 7 * DAY_MS];
}

/**
 * ISO-8601 week key "YYYY-WNN" for the week containing `ms`. The ISO year is
 * the year of the week's Thursday, so early-January / late-December edges land
 * in the correct year.
 */
export function weekKeyForDate(ms: number): string {
  const start = weekStartMs(ms);
  // The Thursday of this week determines the ISO year.
  const thursday = start + 3 * DAY_MS;
  const isoYear = new Date(thursday).getUTCFullYear();
  // Monday of ISO week 1 = Monday of the week containing 4 January.
  const isoWeek1Monday = weekStartMs(Date.UTC(isoYear, 0, 4));
  const week = (start - isoWeek1Monday) / (7 * DAY_MS) + 1;
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Evidence Pack (Layer 1)
// ---------------------------------------------------------------------------

export type SkillLevelSnapshot = {
  skillTag: string;
  level: SkillLevel;
  levelScore: number;
  confidence: number;
  evidenceCount: number;
  source: string;
  lastSeen: number;
};

export type PriorLevel = { level: SkillLevel; levelScore: number };

/** A frozen end-of-week level for one skill — persisted for next week's diff. */
export type FrozenLevel = PriorLevel & { skillTag: string };

export type ImprovedSkill = {
  skillTag: string;
  level: SkillLevel;
  levelScore: number;
  priorLevel: SkillLevel | null;
  priorLevelScore: number | null;
  /** null when the skill is newly seen this week */
  delta: number | null;
};

export type TrickySkill = {
  skillTag: string;
  level: SkillLevel;
  unresolvedMastery: boolean;
  misconceptions: MisconceptionTag[];
};

export type PatternEvidence = {
  tag: PatternSignalTag;
  level: 'present' | 'absent';
  score: number;
  confidence: number;
  phrase: string;
};

export type ShineType =
  | 'first_try'
  | 'hint_recovery'
  | 'persistence'
  | 'explanation'
  | 'mastery_first_try';

export type ShineCandidate = {
  id: string;
  skillTag: string;
  taskId: string;
  type: ShineType;
  when: number;
  evidence: string;
  score: number;
};

export type DigestTemplates = {
  improvedTemplate: string;
  trickyTemplate: string;
};

export type EvidencePack = {
  weekKey: string;
  childId: string;
  childNickname: string;
  generatedAt: number;
  window: { startMs: number; endMs: number };
  /** end-of-week frozen levels — next week's "improved" diff reads these. */
  levels: FrozenLevel[];
  improved: ImprovedSkill[];
  tricky: TrickySkill[];
  patterns: PatternEvidence[];
  shineCandidates: ShineCandidate[];
  homeInput: {
    patterns: PatternEvidence[];
    tricky: TrickySkill[];
  };
  templates: DigestTemplates;
};

// --- humble parent-facing phrases for Pattern Signals (mirror learnerModel.ts;
// kept here so the pure layer is self-contained for the LLM + fallbacks). ---
const PATTERN_PHRASES: Record<string, string> = {
  benefits_from_visuals: 'respond well to seeing and moving the maths',
  rushes_when_confident: 'sometimes rush when feeling confident',
  persists_after_hint: 'keep going after a nudge',
  avoids_explaining: 'still be growing in confidence explaining their thinking',
  responds_to_story_context: 'respond well to stories and characters',
  loses_focus_on_long_explanation: 'do better with shorter explanations'
};

const LEVEL_RANK: Record<SkillLevel, number> = { emerging: 0, developing: 1, secure: 2 };

const IMPROVE_DELTA_THRESHOLD = 0.05;
const PATTERN_CONFIDENCE_FLOOR = 0.35;

export type BuildEvidenceInput = {
  childId: string;
  childNickname: string;
  weekKey: string;
  window: [number, number];
  generatedAt: number;
  skills: SkillLevelSnapshot[];
  patterns: { tag: PatternSignalTag; level: 'present' | 'absent'; score: number; confidence: number }[];
  events: SessionEventLike[];
  priorLevels: Record<string, PriorLevel> | null;
  templates: DigestTemplates;
};

/** Layer 1: build a deterministic, week-scoped Evidence Pack. Pure. */
export function buildEvidencePack(input: BuildEvidenceInput): EvidencePack {
  const [startMs, endMs] = input.window;
  const inWindow = (t: number) => t >= startMs && t < endMs;

  const improved = computeImproved(input.skills, input.priorLevels);
  const tricky = computeTricky(input.events, inWindow, input.skills);
  const patterns = computePatterns(input.patterns);
  const shineCandidates = rankShineCandidates(input.events, inWindow);
  const homeInput = {
    patterns: patterns.filter((p) => p.level === 'present'),
    tricky
  };

  return {
    weekKey: input.weekKey,
    childId: input.childId,
    childNickname: input.childNickname,
    generatedAt: input.generatedAt,
    window: { startMs, endMs },
    levels: input.skills.map((s) => ({ skillTag: s.skillTag, level: s.level, levelScore: s.levelScore })),
    improved,
    tricky,
    patterns,
    shineCandidates,
    homeInput,
    templates: input.templates
  };
}

/** "Improved" = a named-week diff of end-of-week levels vs the prior week's
 *  frozen levels. A level step-up, or a score rise past the noise threshold,
 *  counts. A newly-seen skill counts only once it is past 'emerging'. */
function computeImproved(
  skills: SkillLevelSnapshot[],
  priorLevels: Record<string, PriorLevel> | null
): ImprovedSkill[] {
  const out: ImprovedSkill[] = [];
  for (const s of skills) {
    const prior = priorLevels?.[s.skillTag] ?? null;
    if (prior) {
      const delta = s.levelScore - prior.levelScore;
      const steppedUp = LEVEL_RANK[s.level] > LEVEL_RANK[prior.level];
      if (delta >= IMPROVE_DELTA_THRESHOLD || steppedUp) {
        out.push({
          skillTag: s.skillTag,
          level: s.level,
          levelScore: s.levelScore,
          priorLevel: prior.level,
          priorLevelScore: prior.levelScore,
          delta
        });
      }
    } else {
      // New this week — only celebrate once it's genuinely past emerging.
      if (s.level !== 'emerging') {
        out.push({
          skillTag: s.skillTag,
          level: s.level,
          levelScore: s.levelScore,
          priorLevel: null,
          priorLevelScore: null,
          delta: null
        });
      }
    }
  }
  return out.sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
}

type AttemptMeta = {
  taskId?: string;
  skillTag?: string;
  phase?: string;
  answerType?: string;
  status?: string;
  attempts?: number;
  hintUsed?: boolean;
  resolved?: boolean;
  observed?: unknown;
};

function metaOf(ev: SessionEventLike): AttemptMeta {
  return (ev.meta ?? {}) as AttemptMeta;
}

/** "Tricky" = skills with evidence of struggle this window: a resolved-but-
 *  incorrect (maxed-out) attempt, an unresolved mastery check, or an observed
 *  misconception. Joined to a skillTag via the resolved task_attempt. */
function computeTricky(
  events: SessionEventLike[],
  inWindow: (t: number) => boolean,
  skills: SkillLevelSnapshot[]
): TrickySkill[] {
  // sessionId+taskId -> skillTag, built from resolved attempts (any time, but
  // we only use it to resolve windowed misconception events).
  const taskSkill = new Map<string, string>();
  for (const ev of events) {
    if (ev.type !== 'task_attempt') continue;
    const m = metaOf(ev);
    if (!m.taskId || !m.skillTag) continue;
    const sid = (ev as { sessionId?: string }).sessionId ?? '';
    taskSkill.set(`${sid}:${m.taskId}`, m.skillTag);
  }

  const tricky = new Map<
    string,
    { unresolvedMastery: boolean; misconceptions: Set<MisconceptionTag> }
  >();
  const ensure = (tag: string) => {
    let e = tricky.get(tag);
    if (!e) {
      e = { unresolvedMastery: false, misconceptions: new Set() };
      tricky.set(tag, e);
    }
    return e;
  };

  for (const ev of events) {
    if (!inWindow(ev.at)) continue;
    const m = metaOf(ev);
    if (ev.type === 'task_attempt' && m.resolved && m.skillTag) {
      if (m.status === 'incorrect') {
        ensure(m.skillTag); // maxed out — genuinely stuck
      }
      if (m.phase === 'mastery_check' && (m.status === 'incorrect' || m.status === 'partial')) {
        ensure(m.skillTag).unresolvedMastery = true;
      }
    }
    if (ev.type === 'mastery_result') {
      const result = (m as { result?: string }).result;
      // join to skill via the session's most recent resolved attempt
      const sid = (ev as { sessionId?: string }).sessionId ?? '';
      const skill = guessSessionSkill(events, sid);
      if (result === 'unresolved' && skill) ensure(skill).unresolvedMastery = true;
    }
    if (ev.type === 'misconception') {
      const tag = (m as { tag?: string }).tag as MisconceptionTag | undefined;
      const sid = (ev as { sessionId?: string }).sessionId ?? '';
      const taskId = m.taskId ?? '';
      const skill = taskSkill.get(`${sid}:${taskId}`) ?? guessSessionSkill(events, sid);
      if (tag && skill) ensure(skill).misconceptions.add(tag);
    }
  }

  const levelBySkill = new Map(skills.map((s) => [s.skillTag, s.level]));
  return [...tricky.entries()]
    .map(([skillTag, e]) => ({
      skillTag,
      level: levelBySkill.get(skillTag) ?? levelFromScore(0.4),
      unresolvedMastery: e.unresolvedMastery,
      misconceptions: [...e.misconceptions]
    }))
    .sort((a, b) => Number(b.unresolvedMastery) - Number(a.unresolvedMastery));
}

/** Best-effort skillTag for a session: the skillTag of its most recent resolved
 *  task_attempt. */
function guessSessionSkill(events: SessionEventLike[], sessionId: string): string | null {
  let skill: string | null = null;
  let lastAt = -1;
  for (const ev of events) {
    if ((ev as { sessionId?: string }).sessionId !== sessionId) continue;
    if (ev.type !== 'task_attempt') continue;
    const m = metaOf(ev);
    if (m.skillTag && ev.at > lastAt) {
      skill = m.skillTag;
      lastAt = ev.at;
    }
  }
  return skill;
}

function computePatterns(
  patterns: { tag: PatternSignalTag; level: 'present' | 'absent'; score: number; confidence: number }[]
): PatternEvidence[] {
  return patterns
    .filter((p) => p.level === 'present' && p.confidence >= PATTERN_CONFIDENCE_FLOOR)
    .map((p) => ({
      tag: p.tag,
      level: p.level,
      score: p.score,
      confidence: p.confidence,
      phrase: PATTERN_PHRASES[p.tag] ?? p.tag.replace(/_/g, ' ')
    }))
    .sort((a, b) => b.confidence - a.confidence);
}

const PHASE_BASE: Record<string, number> = {
  mastery_check: 3,
  practice: 2,
  worked_example: 1.5,
  concept: 1,
  warm_up: 1,
  diagnostic: 0.8
};

function prettySkill(skillTag: string): string {
  return skillTag.replace(/_/g, ' ');
}

/**
 * Rank candidate Shine Moments from resolved positive attempts in the window.
 * Each candidate is traceable to a source event; the LLM may only pick from
 * this list. An empty list forces the gentle fallback (never a fabricated
 * moment). Pure.
 */
export function rankShineCandidates(
  events: SessionEventLike[],
  inWindow: (t: number) => boolean
): ShineCandidate[] {
  const candidates: ShineCandidate[] = [];
  let i = 0;
  for (const ev of events) {
    if (!inWindow(ev.at)) continue;
    if (ev.type !== 'task_attempt') continue;
    const m = metaOf(ev);
    if (!m.resolved || !m.skillTag || !m.taskId) continue;
    const correct = m.status === 'correct';
    const captured = m.status === 'captured';
    if (!correct && !captured) continue;

    const phaseBase = PHASE_BASE[m.phase ?? 'practice'] ?? 1;
    const attempts = m.attempts ?? 1;
    const hintUsed = m.hintUsed === true;
    const isMastery = m.phase === 'mastery_check';

    let type: ShineType;
    let bonus: number;
    if (captured) {
      // explanation — encourage only if the child actually said something
      const text = typeof m.observed === 'string' ? m.observed : '';
      if (text.trim().length < 12) continue;
      type = 'explanation';
      bonus = 1;
    } else if (isMastery && attempts === 1 && !hintUsed) {
      type = 'mastery_first_try';
      bonus = 2.5;
    } else if (attempts === 1 && !hintUsed) {
      type = 'first_try';
      bonus = 2;
    } else if (hintUsed && correct) {
      type = 'hint_recovery';
      bonus = 1.5;
    } else if (attempts > 1 && correct) {
      type = 'persistence';
      bonus = 1.2;
    } else {
      continue; // unresolved-by-other-means: not a shine moment
    }

    const score = phaseBase + bonus;
    candidates.push({
      id: `shine_${i++}`,
      skillTag: m.skillTag,
      taskId: m.taskId,
      type,
      when: ev.at,
      evidence: shineEvidenceLine(type, m.skillTag, m.taskId),
      score
    });
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
}

function shineEvidenceLine(type: ShineType, skillTag: string, taskId: string): string {
  const skill = prettySkill(skillTag);
  switch (type) {
    case 'mastery_first_try':
      return `Proved understanding of ${skill} on the mastery check, first try (${taskId}).`;
    case 'first_try':
      return `Solved a ${skill} task on the first try (${taskId}).`;
    case 'hint_recovery':
      return `Used a hint on ${skill} and kept going to solve it (${taskId}).`;
    case 'persistence':
      return `Stuck with a tricky ${skill} task and solved it on a later try (${taskId}).`;
    case 'explanation':
      return `Explained their thinking in words on ${skill} (${taskId}).`;
  }
}

// ---------------------------------------------------------------------------
// Guardrail (Layer 3)
// ---------------------------------------------------------------------------

// Concept-level diagnostic / label vocabulary. Labelling in EITHER direction
// is forbidden, so we match the term itself — "not gifted" trips because it
// contains "gifted". Whole-word boundaries keep "adhd" out of matching other
// words; multi-word phrases are matched as a unit.
const BANNED_LABELS = [
  'gifted',
  'highly gifted',
  'talented',
  'genius',
  'prodigy',
  'highly able',
  'lazy',
  'unmotivated',
  'slacker',
  'adhd',
  'attention deficit',
  'attention-deficit',
  'hyperactive',
  'hyperactivity',
  'autism',
  'autistic',
  'asd',
  'on the spectrum',
  'neurodivergent',
  'dyslexia',
  'dyslexic',
  'dyscalculia',
  'dyspraxia',
  'behaviour problem',
  'behavior problem',
  'behavioural problem',
  'behavioral problem',
  'bad focus',
  'poor focus',
  'attention problem',
  'low ability',
  'high ability',
  'learning disability',
  'learning disabled',
  'special needs',
  'slow learner',
  'struggling learner',
  'disruptive',
  'naughty',
  'defiant',
  'cognitively impaired',
  'intellectually disabled'
];

const CAUTIOUS_PHRASES = [
  'this week',
  'may respond well to',
  'may',
  'might',
  'worth trying',
  'seems to',
  'seem to'
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const BANNED_RE = new RegExp(`\\b(?:${BANNED_LABELS.map(escapeRe).join('|')})\\b`, 'i');
const CAUTIOUS_RE = new RegExp(
  `(?:${CAUTIOUS_PHRASES.map((p) => (p.includes(' ') ? escapeRe(p) : `\\b${escapeRe(p)}\\b`)).join('|')})`,
  'i'
);

export type SectionKind = 'improved' | 'tricky' | 'patterns' | 'shine' | 'home';

/** Matched banned label terms in `text` (concept-level, negation-aware). */
export function scanLabels(text: string): string[] {
  const re = new RegExp(BANNED_RE.source, 'gi');
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) found.add(m[0].toLowerCase());
  return [...found];
}

/** True when `text` contains at least one cautious hedge. */
export function hasCautiousPhrase(text: string): boolean {
  return CAUTIOUS_RE.test(text);
}

export const DIGEST_FOOTER_TEMPLATE =
  'These are learning signals from this week’s sessions — working notes to ' +
  'support {child} at home, not fixed labels or a diagnosis.';

/** The footer, injected verbatim by the guardrail (never by the LLM). */
export function footerText(childNickname: string): string {
  return fill(DIGEST_FOOTER_TEMPLATE, childNickname);
}

function fill(template: string, childNickname: string): string {
  return template.replaceAll('{child}', childNickname);
}

/** Ensure a fallback string passes the guard: cautious phrase present + no
 *  banned labels. Prepends "This week, " when no hedge (preserving a leading
 *  capitalised name); swaps to a generic safe line if a label appears. */
function sanitiseFallback(text: string, childNickname: string): string {
  let out = fill(text, childNickname);
  if (!hasCautiousPhrase(out)) {
    // Preserve a leading capitalised child name; otherwise lowercase the lead
    // so the appended "This week, " reads grammatically.
    const startsWithName = out.startsWith(childNickname);
    const lead = startsWithName ? out : out.charAt(0).toLowerCase() + out.slice(1);
    out = `This week, ${lead}`;
  }
  if (scanLabels(out).length > 0) {
    out = `This week, ${childNickname} kept showing up and having a go at their maths.`;
  }
  return out;
}

// --- the five-section draft the LLM produces (Layer 2 output) ---

export type DigestDraft = {
  improved: string;
  tricky: string;
  patterns: string;
  shine: { chosenCandidateId: string | null; text: string };
  home: string;
};

export type GuardSectionResult = {
  ok: boolean;
  reasons: string[];
};

/** Detect guardrail violations for one section's text. Pure. */
export function guardSectionText(text: string): GuardSectionResult {
  const reasons: string[] = [];
  const labels = scanLabels(text);
  if (labels.length > 0) reasons.push(`banned label: ${labels.join(', ')}`);
  if (!hasCautiousPhrase(text)) reasons.push('missing cautious phrase');
  return { ok: reasons.length === 0, reasons };
}

/** Validate the shine section against the candidate list. Pure. */
export function guardShine(
  shine: DigestDraft['shine'],
  candidates: ShineCandidate[]
): GuardSectionResult {
  const reasons: string[] = [];
  if (candidates.length === 0) {
    // No candidates → the LLM must never narrate a moment.
    reasons.push('no shine candidates — gentle fallback required');
    return { ok: false, reasons };
  }
  const ids = new Set(candidates.map((c) => c.id));
  if (!shine.chosenCandidateId || !ids.has(shine.chosenCandidateId)) {
    reasons.push('shine moment not traceable to a candidate');
  }
  reasons.push(...guardSectionText(shine.text).reasons);
  return { ok: reasons.length === 0, reasons };
}

// --- deterministic, evidence-bounded fallbacks (the safety floor) ---

/** Produce a guard-passing fallback for a section, drawn only from evidence. */
export function fallbackFor(section: SectionKind, evidence: EvidencePack): string {
  const name = evidence.childNickname;
  switch (section) {
    case 'improved': {
      const tpl = evidence.templates.improvedTemplate;
      return sanitiseFallback(tpl, name);
    }
    case 'tricky': {
      const tpl = evidence.templates.trickyTemplate;
      return sanitiseFallback(tpl, name);
    }
    case 'patterns': {
      const present = evidence.patterns.filter((p) => p.level === 'present');
      if (present.length === 0) {
        return sanitiseFallback(
          `It's still early to tell how ${name} seems to learn best — a few more sessions may help.`,
          name
        );
      }
      const list = present.slice(0, 2).map((p) => p.phrase);
      const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
      return sanitiseFallback(`This week, ${name} seems to ${joined}.`, name);
    }
    case 'home': {
      const sug = homeSuggestion(evidence);
      return sanitiseFallback(`This week, it may be worth trying ${sug} at home.`, name);
    }
    case 'shine': {
      if (evidence.shineCandidates.length === 0) {
        return sanitiseFallback(
          `This week looked like a gentle settling-in week — ${name} kept showing up and having a go, which may be its own kind of shine.`,
          name
        );
      }
      const top = evidence.shineCandidates[0];
      return sanitiseFallback(
        `This week, a moment worth noticing: ${lowerFirst(top.evidence)}`,
        name
      );
    }
  }
}

function homeSuggestion(evidence: EvidencePack): string {
  const present = evidence.patterns.filter((p) => p.level === 'present').map((p) => p.tag);
  if (present.includes('benefits_from_visuals')) {
    return 'drawing the maths out together — counters, a quick sketch, or objects on the table';
  }
  if (present.includes('rushes_when_confident')) {
    return 'a calm "show me how you got there" after a quick answer';
  }
  if (present.includes('persists_after_hint')) {
    return 'celebrating the effort of trying again, not just the right answer';
  }
  if (evidence.tricky.length > 0) {
    return `a short, gentle revisit of ${prettySkill(evidence.tricky[0].skillTag)}`;
  }
  return `simply celebrating ${evidence.childNickname}'s effort after each session`;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// --- the regenerate-once-then-fallback repair loop ---

export type RegenerateFn = (
  section: SectionKind,
  evidence: EvidencePack,
  priorText: string,
  reasons: string[]
) => Promise<string>;

export type SectionAction = 'passed' | 'regenerated' | 'fell_back';

export type SectionFlag = {
  section: SectionKind;
  action: SectionAction;
  reasons: string[];
};

export type GuardrailedDigest = {
  improved: string;
  tricky: string;
  patterns: string;
  shine: string;
  home: string;
  chosenCandidateId: string | null;
  shineFallbackUsed: boolean;
  footer: string;
  flags: SectionFlag[];
};

/**
 * Layer 3: guard a draft, regenerating each flagged section once, then falling
 * back to an evidence-bounded template. Restraint wins over richness; no
 * sentence is ever left broken. The footer is injected verbatim. Pure except
 * for the injected `regenerate` (the LLM call).  A flagged section that still
 * fails after one regeneration is replaced by `fallbackFor`.
 */
export async function guardAndRepair(
  draft: DigestDraft,
  evidence: EvidencePack,
  regenerate: RegenerateFn
): Promise<GuardrailedDigest> {
  const flags: SectionFlag[] = [];
  const out: Record<Exclude<SectionKind, 'shine'>, string> = {
    improved: '',
    tricky: '',
    patterns: '',
    home: ''
  };

  for (const section of ['improved', 'tricky', 'patterns', 'home'] as const) {
    const text = draft[section];
    const check = guardSectionText(text);
    if (check.ok) {
      out[section] = text;
      flags.push({ section, action: 'passed', reasons: [] });
      continue;
    }
    // Regenerate once against the pack.
    const regen = await regenerate(section, evidence, text, check.reasons);
    const recheck = guardSectionText(regen);
    if (recheck.ok) {
      out[section] = regen;
      flags.push({ section, action: 'regenerated', reasons: check.reasons });
    } else {
      out[section] = fallbackFor(section, evidence);
      flags.push({ section, action: 'fell_back', reasons: [...check.reasons, ...recheck.reasons] });
    }
  }

  // Shine is candidate-bounded.
  let shineText = draft.shine.text;
  let chosenCandidateId = draft.shine.chosenCandidateId;
  let shineAction: SectionAction = 'passed';
  let shineReasons: string[] = [];
  let shineFallbackUsed = false;

  const shineCheck = guardShine(draft.shine, evidence.shineCandidates);
  if (!shineCheck.ok) {
    // Regenerate once.
    const regen = await regenerate('shine', evidence, shineText, shineCheck.reasons);
    const regenDraft: DigestDraft['shine'] = parseShineRegen(regen, chosenCandidateId);
    const recheck = guardShine(regenDraft, evidence.shineCandidates);
    if (recheck.ok) {
      shineText = regenDraft.text;
      chosenCandidateId = regenDraft.chosenCandidateId;
      shineAction = 'regenerated';
      shineReasons = shineCheck.reasons;
    } else {
      shineText = fallbackFor('shine', evidence);
      chosenCandidateId = evidence.shineCandidates[0]?.id ?? null;
      shineAction = 'fell_back';
      shineReasons = [...shineCheck.reasons, ...recheck.reasons];
      shineFallbackUsed = true;
    }
  }
  flags.push({ section: 'shine', action: shineAction, reasons: shineReasons });

  return {
    ...out,
    shine: shineText,
    home: out.home,
    chosenCandidateId,
    shineFallbackUsed,
    footer: footerText(evidence.childNickname),
    flags
  };
}

// A section regeneration returns plain prose; for shine it may return JSON with
// {chosenCandidateId, text}. Tolerate both.
function parseShineRegen(raw: string, fallbackId: string | null): DigestDraft['shine'] {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      return {
        chosenCandidateId: typeof obj.chosenCandidateId === 'string' ? obj.chosenCandidateId : fallbackId,
        text: typeof obj.text === 'string' ? obj.text : raw
      };
    } catch {
      // fall through
    }
  }
  return { chosenCandidateId: fallbackId, text: raw };
}
