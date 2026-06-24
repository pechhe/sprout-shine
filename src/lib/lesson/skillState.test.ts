import { describe, it, expect } from 'vitest';
import {
  estimateSkillFromDiagnostic,
  levelFromScore,
  parentSkillView,
  closingFeedback
} from '$convex/lesson/skillState';

describe('#9 estimateSkillFromDiagnostic', () => {
  it('first-try correct, no hint -> secure, confidence capped at 0.5', () => {
    const e = estimateSkillFromDiagnostic({ verdict: 'correct', attempts: 1, hintUsed: false, resolved: true });
    expect(e.level).toBe('secure');
    expect(e.levelScore).toBeGreaterThanOrEqual(0.7);
    expect(e.confidence).toBeLessThanOrEqual(0.5); // weak: single signal
    expect(e.evidenceCount).toBe(1);
  });

  it('second-try correct -> developing', () => {
    const e = estimateSkillFromDiagnostic({ verdict: 'correct', attempts: 2, hintUsed: false, resolved: true });
    expect(e.level).toBe('developing');
  });

  it('needed a hint -> developing, lower confidence', () => {
    const e = estimateSkillFromDiagnostic({ verdict: 'correct', attempts: 3, hintUsed: true, resolved: true });
    expect(e.level).toBe('developing');
    expect(e.confidence).toBeLessThanOrEqual(0.5);
  });

  it('never resolved -> emerging', () => {
    const e = estimateSkillFromDiagnostic({ verdict: 'incorrect', attempts: 3, hintUsed: true, resolved: false });
    expect(e.level).toBe('emerging');
  });

  it('explanation (captured) -> neutral, very low confidence, no level claim', () => {
    const e = estimateSkillFromDiagnostic({ verdict: 'captured', attempts: 1, hintUsed: false, resolved: true });
    expect(e.level).toBe('developing');
    expect(e.confidence).toBeLessThanOrEqual(0.35);
    expect(e.misconceptions).toEqual([]);
  });

  it('carries a validator misconception', () => {
    const e = estimateSkillFromDiagnostic(
      { verdict: 'partial', attempts: 3, hintUsed: true, resolved: true },
      'rows_columns_confused'
    );
    expect(e.misconceptions).toContain('rows_columns_confused');
  });
});

describe('#9 levelFromScore bands', () => {
  it('bands map correctly', () => {
    expect(levelFromScore(0.1)).toBe('emerging');
    expect(levelFromScore(0.4)).toBe('developing');
    expect(levelFromScore(0.69)).toBe('developing');
    expect(levelFromScore(0.7)).toBe('secure');
  });
});

describe('#9 humble parent view (no harsh scores/labels)', () => {
  it('phrases are gentle, never a score', () => {
    const emerging = parentSkillView('number_sense_basic', 'emerging');
    const secure = parentSkillView('multiplication_as_arrays', 'secure');
    for (const p of [emerging, secure]) {
      expect(p.phrase).not.toMatch(/\d/); // no numbers/scores to parent
    }
    expect(emerging.phrase).toContain('starting');
    expect(secure.phrase).toContain('comfortable');
  });

  it('closing feedback names a strength specifically', () => {
    const msg = closingFeedback(
      [{ level: 'secure', levelScore: 0.85, confidence: 0.5, evidenceCount: 1, misconceptions: [] }],
      ['making equal groups']
    );
    expect(msg).toContain('equal groups');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('closing feedback is still positive with no strong areas', () => {
    const msg = closingFeedback([], []);
    expect(msg).toMatch(/well done|try/i);
  });
});
