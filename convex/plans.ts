import { action, mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { api } from './_generated/api';
import { validatePlan, type LessonPlan } from './lesson/plan';
import { MISCONCEPTION_TAGS, SKILL_TAGS } from './lesson/vocab';
import { arraysIntroPlan } from './lesson/seedPlans';

declare const process: { env: Record<string, string | undefined> };

const PLAN_MODEL = process.env.OPENAI_PLAN_MODEL ?? 'gpt-5.5';

function buildInstructions(skillTag: string, ageBand: string): string {
  return [
    'You are a primary-maths lesson author for an adaptive tutor for ages 7-10.',
    'Produce ONE lesson as strict JSON matching this TypeScript shape:',
    `{
  lessonId: string, title: string, ageBand: "${ageBand}", skillTag: "${skillTag}",
  objective: string, prerequisites: string[], estimatedMinutes: number (<=15),
  warmUp: Task, concept: string, workedExample: { narration: string, demo?: ManipulativeTarget },
  practice: Task[] (1..5), masteryCheck: Task,
  reflection: { prompt: string, choices: string[] },
  parentInsight: { skillTags: string[], improvedTemplate: string, trickyTemplate: string }
}
Task = {
  id: string, prompt: string,
  answerType: "manipulative" | "numeric" | "choice" | "explanation",
  manipulative?: ManipulativeTarget, numericAnswer?: number,
  choices?: string[], choiceAnswer?: string,
  hints: string[] (>=2, least->most revealing; the deepest hint is a worked step, never a bare answer),
  misconceptions: string[]
}
ManipulativeTarget = { kind: "array", rows: number, columns: number } | { kind: "equal_groups", groups: number, perGroup: number } | { kind: "number_line", min: number, max: number, step: number, answer: number } | { kind: "fraction_bars", parts: number (2..12), shaded: number (1..parts) }`,
    'Pick the manipulative that fits the skill: array/equal_groups for multiplication & division; number_line for number sense and fractions on a number line (the answer must sit on a tick: min + k*step); fraction_bars for fractions as equal parts of a whole.',
    `skillTag MUST be one of: ${SKILL_TAGS.join(', ')}.`,
    `misconceptions MUST be drawn only from: ${MISCONCEPTION_TAGS.join(', ')}.`,
    'The mastery check must require the child to PROVE understanding (manipulative or explanation), not just give a number.',
    'Language must be warm, concrete and readable by a 7-10-year-old. No emojis in prompts.',
    'Return ONLY the JSON object, no prose.'
  ].join('\n\n');
}

async function callOpenAI(instructions: string, userMsg: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: PLAN_MODEL,
      instructions,
      input: userMsg,
      text: { format: { type: 'json_object' } }
    })
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text =
    data.output_text ??
    data.output?.flatMap((o: any) => o.content ?? []).find((c: any) => c.text)?.text;
  if (!text) throw new Error('No text in OpenAI response');
  return text;
}

// #7/#14 — generate a Lesson Plan, validate against the rulebook, store as draft.
export const generate = action({
  args: { skillTag: v.string(), ageBand: v.optional(v.string()) },
  handler: async (ctx, { skillTag, ageBand = '7-10' }): Promise<any> => {
    const instructions = buildInstructions(skillTag, ageBand);
    let lastErrors: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const userMsg =
        attempt === 0
          ? `Write a lesson for skill "${skillTag}", age band ${ageBand}. Return JSON only.`
          : `Your previous JSON failed validation:\n${lastErrors.join('\n')}\nReturn corrected JSON only.`;
      const raw = await callOpenAI(instructions, userMsg);
      let plan: LessonPlan;
      try {
        plan = JSON.parse(raw);
      } catch {
        lastErrors = ['response was not valid JSON'];
        continue;
      }
      const { ok, errors } = validatePlan(plan);
      if (ok) {
        const planId = await ctx.runMutation(api.plans.insertDraft, { plan, generatedBy: PLAN_MODEL });
        return { ok: true, planId, lessonId: plan.lessonId };
      }
      lastErrors = errors;
    }
    return { ok: false, errors: lastErrors };
  }
});

export const insertDraft = mutation({
  args: { plan: v.any(), generatedBy: v.string() },
  handler: async (ctx, { plan, generatedBy }) => {
    return await ctx.db.insert('lessonPlans', {
      lessonId: plan.lessonId,
      skillTag: plan.skillTag,
      title: plan.title,
      status: 'draft',
      plan,
      generatedBy,
      createdAt: Date.now()
    });
  }
});

export const approve = mutation({
  args: { planId: v.id('lessonPlans') },
  handler: async (ctx, { planId }) => {
    await ctx.db.patch(planId, { status: 'approved', approvedAt: Date.now() });
  }
});

export const list = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    if (status) {
      return await ctx.db
        .query('lessonPlans')
        .withIndex('by_status', (q) => q.eq('status', status))
        .order('desc')
        .collect();
    }
    return await ctx.db.query('lessonPlans').order('desc').collect();
  }
});

// Pick an approved plan for a skill (used when starting a session).
export const approvedForSkill = query({
  args: { skillTag: v.string() },
  handler: async (ctx, { skillTag }) => {
    return await ctx.db
      .query('lessonPlans')
      .withIndex('by_skill_status', (q) => q.eq('skillTag', skillTag).eq('status', 'approved'))
      .order('desc')
      .first();
  }
});

export const get = query({
  args: { planId: v.id('lessonPlans') },
  handler: async (ctx, { planId }) => await ctx.db.get(planId)
});

// Seed (idempotently) the hand-authored, rulebook-valid arrays plan as approved.
// Lets the engine run end-to-end before live GPT-5.5 generation is wired.
export const seedArrays = mutation({
  args: {},
  handler: async (ctx) => {
    const { ok, errors } = validatePlan(arraysIntroPlan);
    if (!ok) throw new Error('seed plan invalid: ' + errors.join(', '));
    const existing = await ctx.db
      .query('lessonPlans')
      .withIndex('by_lessonId', (q) => q.eq('lessonId', arraysIntroPlan.lessonId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { status: 'approved', plan: arraysIntroPlan, approvedAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert('lessonPlans', {
      lessonId: arraysIntroPlan.lessonId,
      skillTag: arraysIntroPlan.skillTag,
      title: arraysIntroPlan.title,
      status: 'approved',
      plan: arraysIntroPlan,
      generatedBy: 'hand-authored',
      createdAt: Date.now(),
      approvedAt: Date.now()
    });
  }
});
