// #5 — tutor guardrails. Runs on every child utterance before lesson logic.
// No diagnosis, no shame, no companion behaviour, no secrecy, no unnecessary
// sensitive-topic discussion. When triggered, the tutor gives a safe, kind,
// age-appropriate redirect and the turn is logged as a guardrail event.

export type GuardrailCategory =
  | 'sensitive'
  | 'secrecy'
  | 'companion'
  | 'personal_info'
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
  return { category: null, response: null };
}
