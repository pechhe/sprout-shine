export type FeedbackCue =
  | 'tap'
  | 'select'
  | 'place'
  | 'remove'
  | 'hint'
  | 'success'
  | 'complete';

type Tone = {
  at: number;
  duration: number;
  frequency: number;
  endFrequency?: number;
  gain: number;
  type?: OscillatorType;
};

const STORAGE_KEY = 'sprout-shine-sound-effects';

const CUES: Record<FeedbackCue, Tone[]> = {
  tap: [
    { at: 0, duration: 0.045, frequency: 260, endFrequency: 210, gain: 0.018, type: 'triangle' }
  ],
  select: [
    { at: 0, duration: 0.065, frequency: 360, endFrequency: 470, gain: 0.022, type: 'sine' }
  ],
  place: [
    { at: 0, duration: 0.055, frequency: 500, endFrequency: 610, gain: 0.018, type: 'sine' }
  ],
  remove: [
    { at: 0, duration: 0.05, frequency: 330, endFrequency: 250, gain: 0.014, type: 'sine' }
  ],
  hint: [
    { at: 0, duration: 0.1, frequency: 392, gain: 0.022, type: 'sine' },
    { at: 0.075, duration: 0.13, frequency: 523.25, gain: 0.02, type: 'sine' }
  ],
  success: [
    { at: 0, duration: 0.11, frequency: 523.25, gain: 0.026, type: 'sine' },
    { at: 0.075, duration: 0.14, frequency: 659.25, gain: 0.024, type: 'sine' },
    { at: 0.15, duration: 0.2, frequency: 783.99, gain: 0.022, type: 'sine' }
  ],
  complete: [
    { at: 0, duration: 0.14, frequency: 392, gain: 0.024, type: 'sine' },
    { at: 0.09, duration: 0.16, frequency: 523.25, gain: 0.026, type: 'sine' },
    { at: 0.18, duration: 0.2, frequency: 659.25, gain: 0.024, type: 'sine' },
    { at: 0.29, duration: 0.3, frequency: 783.99, gain: 0.021, type: 'sine' }
  ]
};

class FeedbackSystem {
  soundEnabled = $state(true);
  initialised = $state(false);
  ducked = $state(false);

  #context?: AudioContext;

  initialise() {
    if (typeof window === 'undefined' || this.initialised) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    this.soundEnabled = stored === null ? true : stored === 'on';
    this.initialised = true;
  }

  setDucked(value: boolean) {
    this.ducked = value;
  }

  setSoundEnabled(value: boolean) {
    if (value === this.soundEnabled) return;

    if (!value) this.play('tap');
    this.soundEnabled = value;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
    }
    if (value) this.play('select');
  }

  toggleSound() {
    this.setSoundEnabled(!this.soundEnabled);
  }

  play(cue: FeedbackCue) {
    if (typeof window === 'undefined' || !this.soundEnabled || document.visibilityState === 'hidden') {
      return;
    }

    try {
      if (!this.#context || this.#context.state === 'closed') this.#context = new AudioContext();
      const context = this.#context;
      const render = () => this.#render(context, CUES[cue]);
      if (context.state === 'suspended') void context.resume().then(render).catch(() => undefined);
      else render();
    } catch {
      // Sound is progressive enhancement. Unsupported or blocked audio should never interrupt learning.
    }
  }

  #render(context: AudioContext, tones: Tone[]) {
    const now = context.currentTime + 0.004;
    const volume = this.ducked ? 0.32 : 1;

    for (const tone of tones) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + tone.at;
      const end = start + tone.duration;

      oscillator.type = tone.type ?? 'sine';
      oscillator.frequency.setValueAtTime(tone.frequency, start);
      if (tone.endFrequency) {
        oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, end);
      }

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, tone.gain * volume), start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end + 0.015);
    }
  }
}

export const feedback = new FeedbackSystem();
