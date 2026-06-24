// #5 — a minimal *scripted* lesson used to prove the voice-first session shell.
// This is NOT the structured lesson engine (that is #7); it only needs enough
// turn-by-turn content to demonstrate end-to-end voice + turn-taking + events.

export type ShellQuestion = { prompt: string; answer: number; expr: string };

export const shellLesson = {
  id: 'shell-x6',
  title: 'Times tables · ×6',
  intro: "Hi! I'm Willow. Let's warm up your sixes together — I'll ask a few, you say the answer. Ready?",
  questions: [
    { prompt: 'What is six times one?', answer: 6, expr: '6 × 1' },
    { prompt: 'Nice one. What is six times two?', answer: 12, expr: '6 × 2' },
    { prompt: "Let's try a bigger one. What is six times four?", answer: 24, expr: '6 × 4' }
  ] as ShellQuestion[],
  outro: 'Great work today! Your sixes are really starting to click. See you next time. 🌿'
};

const WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60
};

/** Pull a number out of spoken/typed text. Handles digits and number words
 *  including "twenty four" -> 24. Returns null if none found. */
export function parseNumber(raw: string): number | null {
  const text = raw.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
  const digit = text.match(/\d+/);
  if (digit) return Number(digit[0]);

  const tokens = text.split(/[\s-]+/).filter(Boolean);
  let total = 0;
  let found = false;
  for (const t of tokens) {
    if (t in WORDS) {
      total += WORDS[t];
      found = true;
    }
  }
  return found ? total : null;
}
