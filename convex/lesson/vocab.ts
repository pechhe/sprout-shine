// Controlled vocabularies for the lesson rulebook. Both the plan validator and
// the learner model draw only from these sets — the LLM may not invent new tags.

export const SKILL_TAGS = [
  'number_sense_basic',
  'multiplication_as_groups',
  'multiplication_as_arrays',
  'division_sharing',
  'fractions_equal_parts',
  'fractions_number_line',
  'word_problem_translation',
  'explanation_quality',
  'checking_work'
] as const;
export type SkillTag = (typeof SKILL_TAGS)[number];

export const MISCONCEPTION_TAGS = [
  'rows_columns_confused',
  'unequal_groups',
  'counting_slip',
  'skip_count_error',
  'off_by_one',
  'ignores_remainder',
  'adds_instead_of_multiplies'
] as const;
export type MisconceptionTag = (typeof MISCONCEPTION_TAGS)[number];

// #10 — Pattern Signal vocabulary. Behavioral hypotheses about *how* a child
// learns (distinct from Skill States, which are about *what* they can do).
// The first four are covered by deterministic detectors over the event log;
// the last two stay model-only (low confidence) until plan tags / timing events
// exist. All six are the controlled vocabulary the Realtime `tag_pattern` tool
// may propose from — nothing outside this set is accepted.
export const PATTERN_TAGS = [
  'benefits_from_visuals',
  'rushes_when_confident',
  'persists_after_hint',
  'avoids_explaining',
  'responds_to_story_context',
  'loses_focus_on_long_explanation'
] as const;
export type PatternSignalTag = (typeof PATTERN_TAGS)[number];

// Deterministic Pattern Signal detectors cover only these (ADR-0002).
export const DETERMINISTIC_PATTERN_TAGS = [
  'benefits_from_visuals',
  'rushes_when_confident',
  'persists_after_hint',
  'avoids_explaining'
] as const;
export type DeterministicPatternTag = (typeof DETERMINISTIC_PATTERN_TAGS)[number];

// #22 — Focus Strands: the coarse maths families a parent nominates during
// the Parent Interview. Parent-scaled ("fractions"), while the Strand Selector
// (#14) picks the fine-grained Skill Tag within a strand (system-scaled).
// The five names match the families in issue #14. `strandToSkillTags` is the
// shared artefact both this issue's validator and #14's selector consume.
export const SKILL_STRANDS = [
  'number_sense',
  'multiplication_division',
  'fractions',
  'word_problems',
  'explaining_answer'
] as const;
export type SkillStrand = (typeof SKILL_STRANDS)[number];

// Parent-facing label for each strand (shown on the dashboard + in the tool
// enum description so the model uses the parent's own vocabulary).
export const STRAND_LABELS: Record<SkillStrand, string> = {
  number_sense: 'number sense',
  multiplication_division: 'multiplication & division',
  fractions: 'fractions',
  word_problems: 'word problems',
  explaining_answer: 'explaining an answer'
};

// Coarse strand -> the fine-grained Skill Tags within it. Every SKILL_TAG
// belongs to exactly one strand (asserted in interview.test.ts). The selector
// translates a parent's strand pick into its candidate skill set.
export const strandToSkillTags: Record<SkillStrand, SkillTag[]> = {
  number_sense: ['number_sense_basic', 'checking_work'],
  multiplication_division: ['multiplication_as_groups', 'multiplication_as_arrays', 'division_sharing'],
  fractions: ['fractions_equal_parts', 'fractions_number_line'],
  word_problems: ['word_problem_translation'],
  explaining_answer: ['explanation_quality']
};

export const ANSWER_TYPES = ['manipulative', 'numeric', 'choice', 'explanation'] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];

export const MANIPULATIVE_KINDS = ['equal_groups', 'array', 'number_line', 'fraction_bars'] as const;
export type ManipulativeKind = (typeof MANIPULATIVE_KINDS)[number];

// Phases run strictly in this order.
export const PHASE_ORDER = [
  'warm_up',
  'concept',
  'worked_example',
  'practice',
  'mastery_check',
  'reflection'
] as const;
export type Phase = (typeof PHASE_ORDER)[number];

export const RULES = {
  maxPractice: 5,
  maxDurationMinutes: 15,
  minHints: 2,
  maxAttempts: 3
} as const;

export function isSkillTag(x: string): x is SkillTag {
  return (SKILL_TAGS as readonly string[]).includes(x);
}
export function isMisconceptionTag(x: string): x is MisconceptionTag {
  return (MISCONCEPTION_TAGS as readonly string[]).includes(x);
}
export function isPatternTag(x: string): x is PatternSignalTag {
  return (PATTERN_TAGS as readonly string[]).includes(x);
}
export function isSkillStrand(x: string): x is SkillStrand {
  return (SKILL_STRANDS as readonly string[]).includes(x);
}

// #14 — Strands: the coarse maths areas the lesson engine selects between.
// One Strand Anchor (anchorPlans.ts) per strand; finer-grained Skill Tags roll
// up into strands. The Strand Selector ranks skills and the pre-warm cache holds
// one plan per strand, so a re-route can switch strands near-instantly. This is
// the controlled vocabulary the (future) Parent Interview's Focus Strand draws
// from and the Strand Selector's override target.
export const STRANDS = [
  'number_sense',
  'multiplication_division',
  'fractions',
  'word_problems',
  'explaining_an_answer'
] as const;
export type Strand = (typeof STRANDS)[number];

// How many plans the pre-warm cache holds per child (top N distinct strands):
// covers both "continue" (rank 1) and "switch" (rank 2) re-route paths.
export const PREWARM_CACHE_SIZE = 2;

// Skill Tag -> Strand roll-up. Every SkillTag belongs to exactly one strand.
const SKILL_TO_STRAND: Record<SkillTag, Strand> = {
  number_sense_basic: 'number_sense',
  multiplication_as_groups: 'multiplication_division',
  multiplication_as_arrays: 'multiplication_division',
  division_sharing: 'multiplication_division',
  fractions_equal_parts: 'fractions',
  fractions_number_line: 'fractions',
  word_problem_translation: 'word_problems',
  explanation_quality: 'explaining_an_answer',
  checking_work: 'explaining_an_answer'
};

export function strandForSkillTag(skillTag: string): Strand | undefined {
  return (SKILL_TO_STRAND as Record<string, Strand | undefined>)[skillTag];
}

// The representative Skill Tag each Strand Anchor is authored for — the
// known-good first lesson in that strand and the generation target.
export const STRAND_ANCHOR_SKILL: Record<Strand, SkillTag> = {
  number_sense: 'number_sense_basic',
  multiplication_division: 'multiplication_as_arrays',
  fractions: 'fractions_equal_parts',
  word_problems: 'word_problem_translation',
  explaining_an_answer: 'explanation_quality'
};

export function isStrand(x: string): x is Strand {
  return (STRANDS as readonly string[]).includes(x);
}
