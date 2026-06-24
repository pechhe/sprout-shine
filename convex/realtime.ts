import { action } from './_generated/server';
import { v } from 'convex/values';
import { api } from './_generated/api';
import { MISCONCEPTION_TAGS, PATTERN_TAGS } from './lesson/vocab';

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
