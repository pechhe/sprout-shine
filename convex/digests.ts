// #11 — Weekly Digest persistence + Layer 2 (constrained LLM draft) + read
// surface. Mirrors the lesson engine shape: the pure Evidence Pack + guardrail
// live in ./lesson/digest.ts; this file is the only thing that touches the
// `digests` table and the only thing that calls the LLM. The LLM proposes
// narrative; the system disposes on evidence and safety (ADR-0003).
//
// Lifecycle: for the concierge pilot newly generated digests are 'visible'
// (generate-and-show; the founder iterates). The same `status` field is the
// seam #13's review console + gate inherit. Generation is idempotent and
// non-destructive to a 'visible' row already shown.
//
// Consent gate: both generation and the parent view honour
// `consents.settings.weeklyDigest`.
import { action, query, internalMutation } from './_generated/server';
import { api, internal } from './_generated/api';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import {
  buildEvidencePack,
  guardAndRepair,
  weekKeyForDate,
  weekRangeMs,
  type DigestDraft,
  type EvidencePack,
  type RegenerateFn,
  type SkillLevelSnapshot,
  type SessionEventLike
} from './lesson/digest';
import type { PatternSignalTag } from './lesson/vocab';

declare const process: { env: Record<string, string | undefined> };

const DIGEST_MODEL = process.env.OPENAI_DIGEST_MODEL ?? 'gpt-5.5';
const WEEKLY_STATUS = 'visible'; // concierge pilot default; #13 flips to 'draft'

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Read surface — the parent view. Cheap: one row, embedded pack.
// ---------------------------------------------------------------------------

export type DigestView = {
  _id: Id<'digests'>;
  _creationTime: number;
  childId: Id<'children'>;
  weekKey: string;
  status: string;
  improved: string;
  tricky: string;
  patterns: string;
  shine: string;
  home: string;
  footer: string;
  chosenCandidateId: string | null;
  shineFallbackUsed: boolean;
  generatedAt: number;
};

export const visibleForChild = query({
  args: { childId: v.id('children') },
  handler: async (ctx, { childId }): Promise<DigestView | null> => {
    const row = await ctx.db
      .query('digests')
      .withIndex('by_child', (q) => q.eq('childId', childId))
      .filter((q) => q.eq(q.field('status'), 'visible'))
      .order('desc')
      .first();
    if (!row) return null;
    const g = row.guardrailedDraft;
    return {
      _id: row._id,
      _creationTime: row._creationTime,
      childId: row.childId,
      weekKey: row.weekKey,
      status: row.status,
      improved: g?.improved ?? '',
      tricky: g?.tricky ?? '',
      patterns: g?.patterns ?? '',
      shine: g?.shine ?? '',
      home: g?.home ?? '',
      footer: g?.footer ?? '',
      chosenCandidateId: row.chosenCandidateId ?? null,
      shineFallbackUsed: g?.shineFallbackUsed ?? false,
      generatedAt: row.updatedAt
    };
  }
});

/** For #13's review console (later): list all digests for a child. */
export const listForChild = query({
  args: { childId: v.id('children') },
  handler: async (ctx, { childId }) => {
    return await ctx.db
      .query('digests')
      .withIndex('by_child', (q) => q.eq('childId', childId))
      .order('desc')
      .collect();
  }
});

// ---------------------------------------------------------------------------
// Generation helpers (shared by the action + the cron stub).
// ---------------------------------------------------------------------------

async function loadConsent(ctx: QueryCtx, childId: Id<'children'>) {
  return await ctx.db
    .query('consents')
    .withIndex('by_child', (q) => q.eq('childId', childId))
    .unique();
}

// The single approved plan per skill gives the parentInsight templates the
// fallback draws on. Gather the best template across the week's skills.
async function loadTemplates(ctx: QueryCtx, skillTags: string[]) {
  let improved = '{child} made progress in their maths this week.';
  let tricky = '{child} found some parts tricky this week — that’s a normal part of learning.';
  for (const skillTag of skillTags) {
    const plan = await ctx.db
      .query('lessonPlans')
      .withIndex('by_skill_status', (q) => q.eq('skillTag', skillTag).eq('status', 'approved'))
      .order('desc')
      .first();
    const pi = (plan?.plan as { parentInsight?: { improvedTemplate?: string; trickyTemplate?: string } } | null)?.parentInsight;
    if (pi?.improvedTemplate) improved = pi.improvedTemplate;
    if (pi?.trickyTemplate) tricky = pi.trickyTemplate;
  }
  return { improvedTemplate: improved, trickyTemplate: tricky };
}

async function buildPack(
  ctx: QueryCtx,
  childId: Id<'children'>,
  weekKey: string,
  window: [number, number],
  generatedAt: number
): Promise<EvidencePack> {
  const child = await ctx.db.get(childId);
  if (!child) throw new Error('child not found');

  const skills = await ctx.db
    .query('skillStates')
    .withIndex('by_child', (q) => q.eq('childId', childId))
    .collect();
  const skillSnapshots: SkillLevelSnapshot[] = skills.map((s) => ({
    skillTag: s.skillTag,
    level: s.level as SkillLevelSnapshot['level'],
    levelScore: s.levelScore,
    confidence: s.confidence,
    evidenceCount: s.evidenceCount,
    source: s.source,
    lastSeen: s.lastSeen
  }));

  const patterns = await ctx.db
    .query('patternSignals')
    .withIndex('by_child', (q) => q.eq('childId', childId))
    .collect();
  const patternRows = patterns.map((p) => ({
    tag: p.tag as PatternSignalTag,
    level: p.level as 'present' | 'absent',
    score: p.score,
    confidence: p.confidence
  }));

  const events = (await ctx.db
    .query('sessionEvents')
    .withIndex('by_child', (q) => q.eq('childId', childId))
    .collect()) as SessionEventLike[];

  // Prior week's frozen levels for the "improved" diff.
  const [startMs] = window;
  const priorWeekMs = startMs - 7 * DAY_MS;
  const priorWeekKey = weekKeyForDate(priorWeekMs);
  const priorDigest = await ctx.db
    .query('digests')
    .withIndex('by_child_week', (q) => q.eq('childId', childId).eq('weekKey', priorWeekKey))
    .unique();
  const priorLevels = priorDigest
    ? Object.fromEntries(
        ((priorDigest.evidencePack as EvidencePack).levels ?? []).map((l) => [
          l.skillTag,
          { level: l.level, levelScore: l.levelScore }
        ])
      )
    : null;

  const templates = await loadTemplates(ctx, skillSnapshots.map((s) => s.skillTag));

  return buildEvidencePack({
    childId,
    childNickname: child.nickname,
    weekKey,
    window,
    generatedAt,
    skills: skillSnapshots,
    patterns: patternRows,
    events,
    priorLevels,
    templates
  });
}

// ---------------------------------------------------------------------------
// Layer 2 — constrained LLM draft. Fed only the Evidence Pack; schema-bound to
// the five sections; the shine moment must reference a chosenCandidateId.
// ---------------------------------------------------------------------------

function buildInstructions(evidence: EvidencePack): string {
  return [
    'You are writing a warm, specific weekly learning digest for the parent of a',
    `child named ${evidence.childNickname} (ages 7-10 maths). You write ONLY from the`,
    'Evidence Pack below — never invent facts, never use raw transcripts. You never',
    'label or diagnose the child.',
    '',
    'Return STRICT JSON with these five keys:',
    '{',
    '  "improved": string,   // what improved this week, concrete. MUST contain a cautious phrase.',
    '  "tricky": string,     // what was tricky, framed neutrally (the sticking point, not a label). MUST contain a cautious phrase.',
    '  "patterns": string,   // how the child seems to learn best this week. MUST contain a cautious phrase.',
    '  "shine": { "chosenCandidateId": string|null, "text": string }, // ONE shine moment, warm and specific.',
    '  "home": string        // ONE practical thing to try at home this week. MUST contain a cautious phrase.',
    '}',
    '',
    'HARD RULES:',
    '- Every section MUST contain at least one cautious phrase: "this week", "may", "might", "seems to", "seem to", or "worth trying".',
    '- NEVER use labels: gifted, lazy, ADHD, dyslexia, autism, behaviour problem, bad focus, low/high ability, or any diagnosis — even negated ("not gifted" is also forbidden).',
    '- Do NOT emit a footer; the system adds it.',
    '- shine.chosenCandidateId MUST be one of the candidate ids in the pack, or null ONLY if there are no candidates.',
    '- If there are zero shine candidates, set chosenCandidateId to null and write a gentle line about a settling-in week — never invent a moment.',
    '- Keep each section to 1-2 sentences. Warm, concrete, specific to this child.',
    '',
    'EVIDENCE PACK (JSON):',
    JSON.stringify(evidence),
    '',
    'Return ONLY the JSON object.'
  ].join('\n');
}

function parseDraft(raw: string): DigestDraft {
  const obj = JSON.parse(raw);
  const shine =
    obj.shine && typeof obj.shine === 'object'
      ? {
          chosenCandidateId:
            typeof obj.shine.chosenCandidateId === 'string' ? obj.shine.chosenCandidateId : null,
          text: typeof obj.shine.text === 'string' ? obj.shine.text : ''
        }
      : { chosenCandidateId: null, text: typeof obj.shine === 'string' ? obj.shine : '' };
  return {
    improved: typeof obj.improved === 'string' ? obj.improved : '',
    tricky: typeof obj.tricky === 'string' ? obj.tricky : '',
    patterns: typeof obj.patterns === 'string' ? obj.patterns : '',
    shine,
    home: typeof obj.home === 'string' ? obj.home : ''
  };
}

async function callOpenAI(instructions: string, userMsg: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: DIGEST_MODEL,
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

// The regenerate function injected into the guardrail. It re-asks the model for
// a single section, scolding it for the specific violation.
function makeRegenerate(evidence: EvidencePack, instructions: string): RegenerateFn {
  return async (section, _ev, priorText, reasons) => {
    const sectionNames: Record<string, string> = {
      improved: '"improved" (what improved)',
      tricky: '"tricky" (what was tricky)',
      patterns: '"patterns" (how they seem to learn best)',
      home: '"home" (one thing to try)',
      shine: '"shine" (one shine moment)'
    };
    const shineHint =
      section === 'shine'
        ? ` Return JSON {"chosenCandidateId":"<id from pack or null>","text":"..."}. The id MUST be one of: ${evidence.shineCandidates.map((c) => c.id).join(', ') || 'none'}.`
        : '';
    const userMsg = [
      `Your previous "${sectionNames[section] ?? section}" section failed the guardrail:`,
      `Reasons: ${reasons.join('; ')}.`,
      `Previous text was: ${JSON.stringify(priorText)}`,
      `Rewrite ONLY this ${sectionNames[section] ?? section} section so it passes:`,
      'include a cautious phrase (this week / may / might / seems to / seem to / worth trying),',
      `use NO labels or diagnoses (not even negated).${shineHint}`,
      'Return ONLY the corrected section value.'
    ].join('\n');
    return await callOpenAI(instructions, userMsg);
  };
}

// ---------------------------------------------------------------------------
// Generation entry point. Idempotent + non-destructive to a 'visible' row.
// ---------------------------------------------------------------------------

export const generateForWeek = action({
  args: { childId: v.id('children'), weekKey: v.optional(v.string()) },
  handler: async (ctx, { childId, weekKey }): Promise<{ ok: boolean; digestId?: Id<'digests'>; weekKey: string; skipped?: string }> => {
    const now = Date.now();
    const resolvedWeekKey = weekKey ?? weekKeyForDate(now);

    // Consent gate — no digest when the parent opted out of learning insights.
    const consent = await ctx.runQuery(api.digests.getConsentInternal, { childId });
    if (!consent?.settings.weeklyDigest) {
      return { ok: false, weekKey: resolvedWeekKey, skipped: 'weeklyDigest consent off' };
    }

    // Idempotency: a 'visible' row already shown is never churned.
    const existing = await ctx.runQuery(api.digests.getExistingInternal, { childId, weekKey: resolvedWeekKey });
    if (existing && existing.status === 'visible') {
      return { ok: true, digestId: existing._id, weekKey: resolvedWeekKey, skipped: 'visible digest already exists' };
    }

    const window = weekRangeMs(now);
    const evidence = await ctx.runQuery(api.digests.buildPackInternal, {
      childId,
      weekKey: resolvedWeekKey,
      window,
      generatedAt: now
    });

    const instructions = buildInstructions(evidence);
    let rawDraft: string;
    try {
      rawDraft = await callOpenAI(instructions, `Write this week's digest for ${evidence.childNickname}. Return JSON only.`);
    } catch (e) {
      // LLM failure → degrade fully to the deterministic fallback floor so a
      // digest still lands (guardrail repairs section-by-section anyway).
      rawDraft = JSON.stringify({
        improved: '',
        tricky: '',
        patterns: '',
        shine: { chosenCandidateId: null, text: '' },
        home: ''
      });
    }
    const draft = safeParseDraft(rawDraft);

    const regenerate = makeRegenerate(evidence, instructions);
    const guardrailed = await guardAndRepair(draft, evidence, regenerate);

    const digestId = await ctx.runMutation(internal.digests.upsert, {
      childId,
      weekKey: resolvedWeekKey,
      status: WEEKLY_STATUS,
      evidencePack: evidence,
      draft,
      guardrailedDraft: guardrailed,
      chosenCandidateId: guardrailed.chosenCandidateId,
      generatedBy: DIGEST_MODEL
    });

    return { ok: true, digestId, weekKey: resolvedWeekKey };
  }
});

/**
 * Weekly fan-out: generate this week's digest for every child whose parent has
 * consented to learning-pattern insights. Disabled by default (cron is off);
 * this is the function the Sunday cron points at once enabled behind #13's gate.
 */
export const generateForAllChildren = action({
  args: {},
  handler: async (ctx): Promise<{ generated: number; skipped: number }> => {
    const childIds = await ctx.runQuery(api.digests.listConsentedChildrenInternal, {});
    let generated = 0;
    let skipped = 0;
    for (const childId of childIds) {
      try {
        const r = await generateForWeek(ctx, { childId });
        if (r.ok && !r.skipped) generated++;
        else skipped++;
      } catch {
        skipped++; // never let one child's failure abort the batch
      }
    }
    return { generated, skipped };
  }
});

function safeParseDraft(raw: string): DigestDraft {
  try {
    return parseDraft(raw);
  } catch {
    return { improved: '', tricky: '', patterns: '', shine: { chosenCandidateId: null, text: '' }, home: '' };
  }
}

// --- internal query/mutation helpers (run from the action) ---

export const getConsentInternal = query({
  args: { childId: v.id('children') },
  handler: async (ctx, { childId }) => loadConsent(ctx, childId)
});

/** All child ids whose parent has consented to weekly learning insights. */
export const listConsentedChildrenInternal = query({
  args: {},
  handler: async (ctx): Promise<Id<'children'>[]> => {
    const consents = await ctx.db.query('consents').collect();
    const out: Id<'children'>[] = [];
    for (const c of consents) {
      if (c.settings.weeklyDigest) out.push(c.childId);
    }
    return out;
  }
});

export const getExistingInternal = query({
  args: { childId: v.id('children'), weekKey: v.string() },
  handler: async (ctx, { childId, weekKey }) =>
    ctx.db
      .query('digests')
      .withIndex('by_child_week', (q) => q.eq('childId', childId).eq('weekKey', weekKey))
      .unique()
});

export const buildPackInternal = query({
  args: {
    childId: v.id('children'),
    weekKey: v.string(),
    window: v.array(v.number()),
    generatedAt: v.number()
  },
  handler: async (ctx, { childId, weekKey, window, generatedAt }) =>
    buildPack(ctx, childId, weekKey, [window[0], window[1]], generatedAt)
});

// Internal mutation: upsert the digest row. Overwrites 'draft'/'rejected' only.
export const upsert = internalMutation({
  args: {
    childId: v.id('children'),
    weekKey: v.string(),
    status: v.string(),
    evidencePack: v.any(),
    draft: v.any(),
    guardrailedDraft: v.any(),
    chosenCandidateId: v.optional(v.string()),
    generatedBy: v.string()
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('digests')
      .withIndex('by_child_week', (q) => q.eq('childId', args.childId).eq('weekKey', args.weekKey))
      .unique();
    const now = Date.now();
    if (existing) {
      if (existing.status === 'visible') return existing._id; // never churn a visible row
      await ctx.db.patch(existing._id, {
        status: args.status,
        evidencePack: args.evidencePack,
        draft: args.draft,
        guardrailedDraft: args.guardrailedDraft,
        chosenCandidateId: args.chosenCandidateId,
        generatedBy: args.generatedBy,
        updatedAt: now
      });
      return existing._id;
    }
    return await ctx.db.insert('digests', {
      childId: args.childId,
      weekKey: args.weekKey,
      status: args.status,
      evidencePack: args.evidencePack,
      draft: args.draft,
      guardrailedDraft: args.guardrailedDraft,
      chosenCandidateId: args.chosenCandidateId,
      generatedBy: args.generatedBy,
      createdAt: now,
      updatedAt: now
    });
  }
});
