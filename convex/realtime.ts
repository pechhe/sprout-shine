import { action } from './_generated/server';
import { v } from 'convex/values';
import { api } from './_generated/api';
import { MISCONCEPTION_TAGS, PATTERN_TAGS, SKILL_STRANDS, STRAND_LABELS } from './lesson/vocab';

declare const process: { env: Record<string, string | undefined> };

const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime-2';
const VOICE = process.env.OPENAI_REALTIME_VOICE ?? 'marin';

// Tools the model may call. The child's workspace attempts are NOT a model tool —
// the client records them (deterministic Verdict) and injects the result. The
// model only changes pedagogical state, and the engine validates every call.
const TOOLS = [
  {
    type: 'function',
    name: 'request_hint',
    description:
      'Give the child the next hint when they are stuck. Returns the next hint from the ladder. You may not invent hints or reveal the answer; use this instead.',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    type: 'function',
    name: 'advance_phase',
    description:
      'Move to the next part of the lesson once the child has finished the current task or narration. The engine rejects this if the current task is not yet resolved.',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    type: 'function',
    name: 'tag_misconception',
    description: 'Note a misconception you observed in the child reasoning.',
    parameters: {
      type: 'object',
      properties: { tag: { type: 'string', enum: [...MISCONCEPTION_TAGS] } },
      required: ['tag'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'tag_pattern',
    description:
      'Propose a learning-pattern hypothesis from the fixed vocabulary. Use sparingly, only when you have observed clear behavioral evidence that is not already captured. The app stores it as a low-confidence working hypothesis, never a trait.',
    parameters: {
      type: 'object',
      properties: { tag: { type: 'string', enum: [...PATTERN_TAGS] } },
      required: ['tag'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'end_lesson',
    description: 'End the lesson after the reflection.',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  }
];

function buildInstructions(state: any): string {
  const task = state.task;
  const content = state.content;
  return [
    'You are a warm, patient maths tutor for a child aged 7-10, speaking out loud.',
    `Lesson objective: ${state.objective}`,
    'RULES YOU MUST FOLLOW:',
    '- One question at a time. Keep turns short and friendly. No emojis when speaking.',
    '- You do NOT decide if an answer is correct. The app checks the child workspace and tells you the verdict.',
    '- Never reveal the answer. If the child is stuck, call request_hint to get the next hint, and say it warmly.',
    '- Do not move on until the current task is done. Call advance_phase to progress; the app will refuse if it is too early.',
    '- Stay on this one maths objective. If the child goes off-topic or shares personal/sensitive things, gently redirect to the lesson and do not engage.',
    '- You are a tutor, not a friend or companion. Do not promise secrecy or form a personal relationship.',
    '- You will receive [WORKSPACE] messages describing what the child is building on screen as they work. Use them to watch quietly: refer to what you can see when it helps ("I can see your two rows..."). Do not comment on every change, do not say an answer is right or wrong from these (only the app checks), and only speak up mid-work if the child seems stuck or is drifting far from the task.',
    `Current phase: ${state.phase}.`,
    content?.text ? `Say this idea in your own simple words: "${content.text}"` : '',
    content?.prompt ? `Ask the child: "${content.prompt}"` : '',
    task
      ? `Current task for the child (they solve it in the on-screen workspace): "${task.prompt}". When they tap Check, the app sends you the verdict. React, then either encourage another try, call request_hint, or call advance_phase when resolved.`
      : 'This is a talking phase with no task; explain, then call advance_phase.'
  ]
    .filter(Boolean)
    .join('\n');
}

// Mint an ephemeral Realtime token bound to the current lesson state + tools.
export const token = action({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, { sessionId }): Promise<{ value: string; model: string }> => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set');
    const state = await ctx.runQuery(api.engine.state, { sessionId });

    const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'OpenAI-Safety-Identifier': `sprout-child-${state.sessionId}`
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: REALTIME_MODEL,
          instructions: buildInstructions(state),
          tools: TOOLS,
          audio: {
            input: { transcription: { model: 'whisper-1' } },
            output: { voice: VOICE }
          }
        }
      })
    });
    if (!res.ok) throw new Error(`Realtime token ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return { value: data.value ?? data.client_secret?.value, model: REALTIME_MODEL };
  }
});

// #9 — realtime token for the diagnostic session (lighter tool set; client
// drives item progression, the model narrates + may give hints).
const DIAGNOSTIC_TOOLS = [
  TOOLS.find((t) => t.name === 'request_hint')!,
  TOOLS.find((t) => t.name === 'tag_misconception')!,
  TOOLS.find((t) => t.name === 'tag_pattern')!
];

function buildDiagnosticInstructions(state: any): string {
  return [
    'You are a warm, patient maths tutor for a child aged 7-10, speaking out loud.',
    'This is a short first session to get to know how the child thinks across a few maths areas. It is NOT a test — keep it light and encouraging.',
    'RULES YOU MUST FOLLOW:',
    '- One question at a time. Keep turns short and friendly.',
    '- You do NOT decide if an answer is correct. The app checks each answer and tells you the verdict.',
    '- Never reveal answers. If the child is stuck, call request_hint and say it warmly.',
    '- When the app says a skill is done, move on to the next prompt it gives you.',
    '- Stay encouraging. Do not use labels like clever, gifted, lazy, or bad focus. Praise specific effort and thinking, not intelligence.',
    '- If the child goes off-topic or shares something personal/sensitive, gently redirect to the maths and do not engage.',
    state.item ? `Current prompt to work through with the child: "${state.item.prompt}"` : 'The diagnostic is finishing — give warm, specific positive feedback.'
  ].filter(Boolean).join('\n');
}

export const diagnosticToken = action({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, { sessionId }): Promise<{ value: string; model: string }> => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set');
    const state = await ctx.runQuery(api.diagnostics.state, { sessionId });
    const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'OpenAI-Safety-Identifier': `sprout-child-${state.sessionId}`
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: REALTIME_MODEL,
          instructions: buildDiagnosticInstructions(state),
          tools: DIAGNOSTIC_TOOLS,
          audio: {
            input: { transcription: { model: 'whisper-1' } },
            output: { voice: VOICE }
          }
        }
      })
    });
    if (!res.ok) throw new Error(`Realtime token ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return { value: data.value ?? data.client_secret?.value, model: REALTIME_MODEL };
  }
});

// #22 — the Parent Interview. One voice pipeline, not two: the interviewer
// persona + submit_interview_result tool follow the exact pattern of the lesson
// (buildInstructions/token) and diagnostic (buildDiagnosticInstructions/
// diagnosticToken) token actions. The only tool is the tool-gated extraction:
// the interviewer calls submit_interview_result; the system validates against
// SKILL_STRANDS + checkGuardrails and disposes (ADR-0001).
const INTERVIEW_TOOLS = [
  {
    type: 'function',
    name: 'submit_interview_result',
    description:
      'Submit the parent interview result. Call this once when you have what you need, or when the parent is happy to finish. focusStrand is the one maths area the parent would like lessons to focus on next — use one of the listed options, or null if the parent has no preference ("you choose"). The five text fields capture context; blank is fine if the parent said nothing about that.',
    parameters: {
      type: 'object',
      properties: {
        focusStrand: {
          type: ['string', 'null'],
          description: 'The maths area the parent wants to focus on, or null for no preference.',
          enum: [...SKILL_STRANDS]
        },
        findsEasy: { type: 'string', description: 'What the parent says their child finds easy.' },
        avoids: { type: 'string', description: 'What the child tends to avoid.' },
        whenStuck: { type: 'string', description: 'What happens when the child gets stuck.' },
        triedBefore: { type: 'string', description: 'What the family has already tried.' },
        wantToUnderstand: { type: 'string', description: 'What the parent most wants to understand.' }
      },
      required: ['focusStrand', 'findsEasy', 'avoids', 'whenStuck', 'triedBefore', 'wantToUnderstand'],
      additionalProperties: false
    }
  }
];

// Build the interviewer instructions: warm, fluid, free-follow-up, grounded in
// the diagnostic's emergent picture. No priming constraints (founder-pilot
// decision). The only hard rule is the no-labels guardrail, same as the
// diagnostic persona.
function buildInterviewInstructions(opts: {
  childName: string;
  strongest: string[];
  trickiest: string[];
  previousFocus: string | null;
  reInterview: boolean;
}): string {
  const picture = [
    opts.strongest.length ? `The child's quick-check suggested strengths in ${opts.strongest.join(' and ')}.` : '',
    opts.trickiest.length ? `The quick-check suggested trickier areas in ${opts.trickiest.join(' and ')}.` : ''
  ].filter(Boolean).join(' ');
  return [
    `You are a warm, friendly interviewer talking out loud with a parent about their child ${opts.childName}, aged 7-10, who is about to start maths lessons with Sprout Shine.`,
    opts.reInterview
      ? 'The parent has asked to re-do this chat, so their family\'s needs may have changed since last time. Treat it fresh.'
      : 'This is a short, friendly onboarding chat. It is NOT a test for the parent or the child.',
    'YOUR GOAL:',
    `- Find out what the parent would most like the lessons to focus on right now. The options are: ${SKILL_STRANDS.map((s) => STRAND_LABELS[s]).join(', ')}.`,
    `- If the parent genuinely has no preference ("you choose", "I don't mind"), that is a perfect answer — set focusStrand to null. Never push for a focus the parent doesn't have.`,
    `- Along the way, capture context: what the child finds easy, avoids, what happens when they're stuck, what the family has tried, and what the parent most wants to understand. These are warm conversation, not a checklist.`,
    'HOW TO TALK:',
    '- One question at a time. Keep turns short and natural. Speak warmly and plainly, like a friendly teacher chatting with a parent.',
    '- Reference what the quick-check showed so the chat feels grounded in this actual child, not cold-context.',
    '- Follow up naturally and probe freely. Lead the conversation; generate your own follow-ups. This is a real chat, not a rigid survey.',
    picture,
    opts.previousFocus ? `Previously the parent asked to focus on ${opts.previousFocus} — check whether that still fits.` : '',
    'RULES YOU MUST FOLLOW:',
    '- Do NOT use labels or diagnoses about the child. No words like clever, gifted, lazy, bad focus, dyscalculic, behind, or special needs. Talk about specific maths behaviours and effort, never fixed traits. This is the one hard rule.',
    '- Do NOT agree to keep secrets, and if the parent shares anything sensitive or worrying, gently suggest they raise it with a trusted professional and steer back to the maths focus.',
    '- You are not a doctor or a counsellor. If the parent asks whether the child has a learning difference, say kindly that you can\'t assess that and keep the chat on the maths itself.',
    'WHEN TO FINISH:',
    '- Once you have a sense of the focus (or a clear "you choose") and whatever context came up, call submit_interview_result. Keep the whole chat to a few minutes.',
    '- If the parent needs to go, call submit_interview_result with whatever you captured, including focusStrand: null. Never keep them trapped.'
  ].filter(Boolean).join('\n');
}

export const interviewToken = action({
  args: { childId: v.id('children'), reInterview: v.optional(v.boolean()) },
  handler: async (ctx, { childId, reInterview }): Promise<{ value: string; model: string }> => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set');

    // Ground the conversation in the diagnostic's emergent picture. Read the
    // Learner Model (humble phrases, never scores) + the child profile + any
    // prior interview focus (for a re-interview).
    const [child, model, prior] = await Promise.all([
      ctx.runQuery(api.parents.childForInterview, { childId }),
      ctx.runQuery(api.learnerModel.read, { childId }),
      ctx.runQuery(api.interviews.forChild, { childId })
    ]);
    const strongest = (model.skills ?? [])
      .filter((s: any) => s.level !== 'emerging')
      .map((s: any) => s.phrase)
      .slice(0, 2);
    const trickiest = (model.skills ?? [])
      .filter((s: any) => s.level === 'emerging')
      .map((s: any) => s.phrase)
      .slice(0, 2);
    const previousFocus = prior?.focusLabel ?? null;

    const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'OpenAI-Safety-Identifier': `sprout-parent-${childId}`
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: REALTIME_MODEL,
          instructions: buildInterviewInstructions({
            childName: child?.nickname ?? 'your child',
            strongest,
            trickiest,
            previousFocus,
            reInterview: reInterview ?? false
          }),
          tools: INTERVIEW_TOOLS,
          audio: {
            input: { transcription: { model: 'whisper-1' } },
            output: { voice: VOICE }
          }
        }
      })
    });
    if (!res.ok) throw new Error(`Realtime token ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return { value: data.value ?? data.client_secret?.value, model: REALTIME_MODEL };
  }
});
