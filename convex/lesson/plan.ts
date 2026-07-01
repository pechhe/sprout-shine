// Lesson Plan types + the rulebook validator (plan-level invariants from ADR-0001).
// Pure module shared by the Convex plan-generation action and the client engine.

import {
  ANSWER_TYPES,
  MANIPULATIVE_KINDS,
  RULES,
  isMisconceptionTag,
  isSkillTag,
  type AnswerType,
  type ManipulativeKind,
  type SkillTag
} from './vocab';

export type ManipulativeTarget =
  | { kind: 'array'; rows: number; columns: number }
  | { kind: 'equal_groups'; groups: number; perGroup: number }
  /** child places a marker on a tick of a labelled number line */
  | { kind: 'number_line'; min: number; max: number; step: number; answer: number }
  /** child splits a bar into equal parts and shades some of them */
  | { kind: 'fraction_bars'; parts: number; shaded: number };

export type Task = {
  id: string;
  prompt: string;
  answerType: AnswerType;
  /** present when answerType === 'manipulative' */
  manipulative?: ManipulativeTarget;
  /** present when answerType === 'numeric' */
  numericAnswer?: number;
  /** present when answerType === 'choice' */
  choices?: string[];
  choiceAnswer?: string;
  /** ordered least -> most revealing; deepest is a worked step, not a bare answer */
  hints: string[];
  /** controlled-vocabulary misconception tags this task can surface */
  misconceptions: string[];
};

export type LessonPlan = {
  lessonId: string;
  title: string;
  ageBand: string;
  skillTag: SkillTag;
  objective: string;
  prerequisites: string[];
  estimatedMinutes: number;
  warmUp: Task;
  concept: string;
  workedExample: { narration: string; demo?: ManipulativeTarget };
  practice: Task[];
  masteryCheck: Task;
  reflection: { prompt: string; choices: string[] };
  parentInsight: { skillTags: string[]; improvedTemplate: string; trickyTemplate: string };
};

export type PlanValidation = { ok: boolean; errors: string[] };

function validateTask(t: Task, where: string, errors: string[], opts: { mastery?: boolean } = {}) {
  if (!t.id) errors.push(`${where}: missing id`);
  if (!t.prompt?.trim()) errors.push(`${where}: missing prompt`);
  if (!(ANSWER_TYPES as readonly string[]).includes(t.answerType)) {
    errors.push(`${where}: invalid answerType "${t.answerType}"`);
  }
  // machine-checkable correct state where required
  if (t.answerType === 'manipulative') {
    const m = t.manipulative;
    if (!m || !(MANIPULATIVE_KINDS as readonly string[]).includes(m.kind)) {
      errors.push(`${where}: manipulative task needs a valid manipulative target`);
    } else if (m.kind === 'array' && !(m.rows > 0 && m.columns > 0)) {
      errors.push(`${where}: array target needs rows & columns > 0`);
    } else if (m.kind === 'equal_groups' && !(m.groups > 0 && m.perGroup > 0)) {
      errors.push(`${where}: equal_groups target needs groups & perGroup > 0`);
    } else if (m.kind === 'number_line') {
      if (!(m.step > 0 && m.max > m.min)) {
        errors.push(`${where}: number_line target needs step > 0 and max > min`);
      } else if (!(m.answer >= m.min && m.answer <= m.max)) {
        errors.push(`${where}: number_line answer must lie within [min, max]`);
      } else if (Math.abs(Math.round((m.answer - m.min) / m.step) * m.step + m.min - m.answer) > 1e-9) {
        errors.push(`${where}: number_line answer must sit on a tick (min + k*step)`);
      }
    } else if (m.kind === 'fraction_bars') {
      if (!(m.parts > 1 && m.parts <= 12)) {
        errors.push(`${where}: fraction_bars target needs 2..12 parts`);
      } else if (!(m.shaded >= 1 && m.shaded <= m.parts)) {
        errors.push(`${where}: fraction_bars shaded must be 1..parts`);
      }
    }
  }
  if (t.answerType === 'numeric' && typeof t.numericAnswer !== 'number') {
    errors.push(`${where}: numeric task needs numericAnswer`);
  }
  if (t.answerType === 'choice') {
    if (!t.choices?.length) errors.push(`${where}: choice task needs choices`);
    if (!t.choiceAnswer || !t.choices?.includes(t.choiceAnswer)) {
      errors.push(`${where}: choice task needs choiceAnswer within choices`);
    }
  }
  // hint ladder
  if (!Array.isArray(t.hints) || t.hints.length < RULES.minHints) {
    errors.push(`${where}: needs >= ${RULES.minHints} hints`);
  }
  // misconception vocabulary
  for (const tag of t.misconceptions ?? []) {
    if (!isMisconceptionTag(tag)) errors.push(`${where}: unknown misconception "${tag}"`);
  }
  // mastery must require proof (manipulative or explanation), not a bare number/choice
  if (opts.mastery && (t.answerType === 'numeric' || t.answerType === 'choice')) {
    errors.push(`${where}: mastery check must require proof (manipulative or explanation)`);
  }
}

/** Validate a generated plan against the rulebook. Returns all violations. */
export function validatePlan(plan: LessonPlan): PlanValidation {
  const errors: string[] = [];

  if (!plan.lessonId) errors.push('missing lessonId');
  if (!plan.objective?.trim()) errors.push('missing objective');
  if (!isSkillTag(plan.skillTag)) errors.push(`unknown skillTag "${plan.skillTag}"`);
  if (!(plan.estimatedMinutes > 0 && plan.estimatedMinutes <= RULES.maxDurationMinutes)) {
    errors.push(`estimatedMinutes must be 1..${RULES.maxDurationMinutes}`);
  }
  if (!plan.concept?.trim()) errors.push('missing concept explanation');
  if (!plan.workedExample?.narration?.trim()) errors.push('missing worked example');

  validateTask(plan.warmUp, 'warmUp', errors);

  if (!Array.isArray(plan.practice) || plan.practice.length < 1) {
    errors.push('needs >= 1 practice task');
  } else if (plan.practice.length > RULES.maxPractice) {
    errors.push(`too many practice tasks (max ${RULES.maxPractice})`);
  }
  plan.practice?.forEach((t, i) => validateTask(t, `practice[${i}]`, errors));

  validateTask(plan.masteryCheck, 'masteryCheck', errors, { mastery: true });

  if (!plan.reflection?.prompt?.trim() || !plan.reflection.choices?.length) {
    errors.push('missing reflection prompt/choices');
  }
  if (
    !plan.parentInsight?.improvedTemplate?.trim() ||
    !plan.parentInsight?.trickyTemplate?.trim()
  ) {
    errors.push('missing parentInsight templates');
  }

  return { ok: errors.length === 0, errors };
}
