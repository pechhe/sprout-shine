// #5/#22 — the no-labels / no-harm guardrail. The single canonical home for
// checkGuardrails so both the client (during a Realtime conversation) and the
// Convex server (at extraction) share one implementation. Runs on every child
// utterance before lesson logic, on parent + interviewer turns during the
// Parent Interview, and on the five free-text fields at extraction (#22).

export type GuardrailCategory =
  | 'sensitive'
  | 'secrecy'
  | 'companion'
  | 'personal_info'
  | 'label' // #22 — diagnosis / fixed-label vocabulary the product must not mint
  | null;

export type GuardrailResult = {
  category: GuardrailCategory;
  /** Safe spoken response, or null if the utterance is fine to pass through. */
  response: string | null;
};

const SENSITIVE = [
  'hurt myself',
  'kill myself',
  'want to die',
  'self harm',
  'self-harm',
  'suicide',
  'abuse',
  'hit me',
  'touch me',
  'scared at home',
  'not safe',
  'medicine',
  'medical',
  'diagnose',
  'depressed',
  'anxiety'
];
const SECRECY = ["don't tell", 'dont tell', 'keep a secret', 'keep it secret', "won't tell"];
const COMPANION = [
  'are you my friend',
  'be my friend',
  'do you love me',
  'are you real',
  'are you a person',
  'do you like me',
  'are you alive'
];
const PERSONAL = [
  'my address',
  'where i live',
  'my phone number',
  'my school is',
  'my full name is',
  'my password'
];
// #22 — fixed-label / diagnosis vocabulary. The product never labels a child;
// the parent interview surfaces the same guardrail so an over-rapport-building
// interviewer (or a parent echoing one) can't mint a diagnosis at the intake
// edge. Reused at extraction on the five free-text fields.
const LABELS = [
  'dyscalculia',
  'dyslexic',
  'dyslexia',
  'adhd',
  'autistic',
  'autism',
  'gifted',
  'clever',
  'lazy',
  'stupid',
  'behind',
  'bad focus',
  'disabled',
  'special needs'
];

function has(text: string, list: string[]): boolean {
  return list.some((k) => text.includes(k));
}

export function checkGuardrails(raw: string): GuardrailResult {
  const text = raw.toLowerCase();

  if (has(text, SENSITIVE)) {
    return {
      category: 'sensitive',
      response:
        "That sounds really important — but it's not something I can help with. Please tell a grown-up you trust about that. For now, let's keep going with our maths when you're ready."
    };
  }
  if (has(text, SECRECY)) {
    return {
      category: 'secrecy',
      response:
        "I don't keep secrets, and I'd never ask you to hide things from your grown-up. Let's stick with our maths — what do you think the answer is?"
    };
  }
  if (has(text, COMPANION)) {
    return {
      category: 'companion',
      response:
        "I'm an AI learning helper, not a real person or a friend — but I'm a great maths partner! Shall we carry on?"
    };
  }
  if (has(text, PERSONAL)) {
    return {
      category: 'personal_info',
      response:
        "You don't need to share things like that with me — let's keep it about the maths. Ready for the next bit?"
    };
  }
  if (has(text, LABELS)) {
    return {
      category: 'label',
      response:
        "I'll keep this about the maths itself rather than any labels. Let's focus on what feels easy or tricky right now."
    };
  }
  return { category: null, response: null };
}

/** True if any banned category trips on the text. Pure helper for validators. */
export function guardrailed(raw: string): boolean {
  return checkGuardrails(raw).category !== null;
}
