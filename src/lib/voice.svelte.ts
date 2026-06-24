// #5 — browser voice I/O with turn-taking. Wraps the Web Speech API:
//  - speechSynthesis for tutor voice output
//  - SpeechRecognition for child voice input
// The controller never listens while it is speaking, which gives clean
// turn-taking. Everything degrades gracefully to text when unsupported.

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
}

export type VoiceState = 'idle' | 'speaking' | 'listening';

export class VoiceController {
  state = $state<VoiceState>('idle');
  muted = $state(false);
  partial = $state('');

  readonly supportsTTS = typeof window !== 'undefined' && 'speechSynthesis' in window;
  readonly supportsSTT = getRecognitionCtor() !== null;

  #recognition: RecognitionLike | null = null;

  /** Speak text aloud (skipped when muted). Resolves when finished. */
  speak(text: string): Promise<void> {
    this.state = 'speaking';
    if (this.muted || !this.supportsTTS) {
      // Brief pause so the UI shows the turn even without audio.
      return new Promise((r) => setTimeout(() => { this.state = 'idle'; r(); }, 350));
    }
    return new Promise((resolve) => {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-GB';
        u.rate = 0.98;
        u.pitch = 1.08;
        u.onend = () => { this.state = 'idle'; resolve(); };
        u.onerror = () => { this.state = 'idle'; resolve(); };
        window.speechSynthesis.speak(u);
      } catch {
        this.state = 'idle';
        resolve();
      }
    });
  }

  /** Listen for one child utterance. Resolves with transcript, or null. */
  listen(): Promise<string | null> {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return Promise.resolve(null);

    this.partial = '';
    this.state = 'listening';
    const rec = new Ctor();
    this.#recognition = rec;
    rec.lang = 'en-GB';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    return new Promise((resolve) => {
      let final = '';
      rec.onresult = (e: any) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) final += r[0].transcript;
          else interim += r[0].transcript;
        }
        this.partial = (final + interim).trim();
      };
      rec.onerror = () => { this.#finishListen(); resolve(final.trim() || null); };
      rec.onend = () => { this.#finishListen(); resolve(final.trim() || null); };
      try {
        rec.start();
      } catch {
        this.#finishListen();
        resolve(null);
      }
    });
  }

  #finishListen() {
    this.state = 'idle';
    this.#recognition = null;
  }

  /** Stop any in-flight listening immediately. */
  stopListening() {
    try {
      this.#recognition?.abort();
    } catch {
      /* ignore */
    }
    this.#finishListen();
  }

  /** Stop everything (used on session end / unmount). */
  shutdown() {
    this.stopListening();
    if (this.supportsTTS) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
    this.state = 'idle';
  }
}
