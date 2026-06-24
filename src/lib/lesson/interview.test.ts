import { describe, it, expect } from 'vitest';
import {
  SKILL_STRANDS,
  SKILL_TAGS,
  strandToSkillTags,
  isSkillStrand,
  STRAND_LABELS
} from '$convex/lesson/vocab';
import { validateInterviewResult } from '$convex/lesson/interview';
import { guardrailed } from '$convex/lesson/guardrail';

// #22 — Seam 1: the trust-bearing pieces of the Parent Interview are (1) the
// controlled vocabularies and (2) the pure validator. Conduct is verified at
// integration by inspecting the persisted submitted result, not here.

const FIELDS = {
  findsEasy: 'times tables',
  avoids: 'wordy questions',
  whenStuck: 'gets quiet',
  triedBefore: 'workbooks',
  wantToUnderstand: 'why fractions feel hard'
};

describe('#22 SKILL_STRANDS + strandToSkillTags', () => {
  it('has the five families issue #14 names', () => {
    expect(SKILL_STRANDS).toHaveLength(5);
    expect(SKILL_STRANDS.map((s) => STRAND_LABELS[s])).toEqual([
      'number sense',
      'multiplication & division',
      'fractions',
      'word problems',
      'explaining an answer'
    ]);
  });

  it('maps every strand to at least one skill tag', () => {
    for (const strand of SKILL_STRANDS) {
      expect(strandToSkillTags[strand].length).toBeGreaterThanOrEqual(1);
    }
  });

  it('partitions every SKILL_TAG into exactly one strand', () => {
    const occurrences = new Map<string, number>();
    for (const strand of SKILL_STRANDS) {
      for (const tag of strandToSkillTags[strand]) {
        occurrences.set(tag, (occurrences.get(tag) ?? 0) + 1);
      }
    }
    // every known skill tag is covered exactly once
    for (const tag of SKILL_TAGS) {
      expect(occurrences.get(tag)).toBe(1);
    }
    // and nothing else slipped in
    expect(occurrences.size).toBe(SKILL_TAGS.length);
  });

  it('isSkillStrand accepts known strands and rejects minted ones', () => {
    expect(isSkillStrand('fractions')).toBe(true);
    expect(isSkillStrand('number_sense')).toBe(true);
    expect(isSkillStrand('not_a_strand')).toBe(false);
    expect(isSkillStrand('')).toBe(false);
  });
});

describe('#22 validateInterviewResult', () => {
  it('accepts a valid focusStrand from SKILL_STRANDS', () => {
    const r = validateInterviewResult({ focusStrand: 'fractions', ...FIELDS });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.focusStrand).toBe('fractions');
  });

  it('accepts focusStrand: null (selector decides)', () => {
    const r = validateInterviewResult({ focusStrand: null, ...FIELDS });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.focusStrand).toBeNull();
  });

  it('accepts a missing/empty focusStrand as null (parent had no preference)', () => {
    const r = validateInterviewResult({ focusStrand: undefined, ...FIELDS });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.focusStrand).toBeNull();
    const empty = validateInterviewResult({ focusStrand: '', ...FIELDS });
    expect(empty.ok).toBe(true);
  });

  it('rejects a focusStrand the model minted (not in SKILL_STRANDS) and returns feedback', () => {
    const r = validateInterviewResult({ focusStrand: 'calculus', ...FIELDS });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.feedback).toContain('calculus');
      expect(r.feedback).toMatch(/options|one of/i);
    }
  });

  it('rejects a free-text field that trips the no-labels guardrail, naming the field', () => {
    // 'dyscalculic' is banned-label vocabulary the product must never mint.
    const r = validateInterviewResult({
      focusStrand: null,
      ...FIELDS,
      avoids: 'she seems dyscalculic with numbers'
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.feedback).toMatch(/avoid|rephrase/i);
      expect(r.feedback).toMatch(/label|diagnos/i);
    }
  });

  it('accepts all-blank context fields — the conversation is participation-based', () => {
    const r = validateInterviewResult({
      focusStrand: null,
      findsEasy: '',
      avoids: '',
      whenStuck: '',
      triedBefore: '',
      wantToUnderstand: ''
    });
    expect(r.ok).toBe(true);
  });
});

// Belt-and-braces: the guardrail helper the validator leans on actually trips
// on the label vocabulary, and passes on clean maths talk.
describe('#22 guardrailed (reused, no new vocabulary)', () => {
  it('trips on a diagnosis label', () => {
    expect(guardrailed('maybe she is dyscalculic')).toBe(true);
    expect(guardrailed('he is just gifted')).toBe(true);
  });
  it('passes on plain behaviour talk', () => {
    expect(guardrailed('she finds fractions tricky')).toBe(false);
    expect(guardrailed('he gets stuck on word problems')).toBe(false);
  });
});
