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

export const ANSWER_TYPES = ['manipulative', 'numeric', 'choice', 'explanation'] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];

export const MANIPULATIVE_KINDS = ['equal_groups', 'array'] as const;
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
