import { describe, it, expect } from 'vitest';
import {
  selectStrand,
  STUCK_THRESHOLD_UNRESOLVED,
  ACTIVE_WINDOW_DAYS,
  CONSOLIDATION_LESSONS,
  type SelectorSkillState,
  type SelectorInput
} from '$convex/lesson/strandSelector';
import { STRAND_ANCHOR_SKILL } from '$convex/lesson/vocab';

const T0 = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

// Helper: build a skill-state row the selector consumes.
function skill(opts: Partial<SelectorSkillState> & { skillTag: string }): SelectorSkillState {
  return {
    level: 'developing',
    levelScore: 0.5,
    confidence: 0.5,
    evidenceCount: 1,
    lastSeen: T0,
    ...opts
  };
}

function input(skills: SelectorSkillState[], extra: Partial<SelectorInput> = {}): SelectorInput {
  return { skills, now: T0, ...extra };
}

describe('#14 selectStrand — priorities, highest first', () => {
  it('consolidation (just-passed mastery) ranks above the weakest active skill', () => {
    const skills = [
      // just passed arrays 1 day ago
      skill({ skillTag: 'multiplication_as_arrays', level: 'secure', confidence: 0.7, lastSeen: T0 - DAY }),
      // weakest active skill, shakier
      skill({ skillTag: 'number_sense_basic', level: 'emerging', confidence: 0.2, lastSeen: T0 })
    ];
    const ranked = selectStrand(
      input(skills, { recentMasteryResults: { multiplication_as_arrays: ['passed'] } })
    );
    expect(ranked[0].skillTag).toBe('multiplication_as_arrays');
    expect(ranked[0].reason).toBe('consolidation');
    expect(ranked[1].skillTag).toBe('number_sense_basic');
    expect(ranked[1].reason).toBe('weakest_active');
  });

  it('weakest active skill: lowest confidence among active, non-stuck ranks first', () => {
    const skills = [
      skill({ skillTag: 'multiplication_as_arrays', confidence: 0.6, lastSeen: T0 }),
      skill({ skillTag: 'number_sense_basic', confidence: 0.25, lastSeen: T0 }),
      skill({ skillTag: 'fractions_equal_parts', confidence: 0.4, lastSeen: T0 })
    ];
    const ranked = selectStrand(input(skills));
    expect(ranked[0].skillTag).toBe('number_sense_basic');
    expect(ranked.map((c) => c.skillTag)).toEqual([
      'number_sense_basic',
      'fractions_equal_parts',
      'multiplication_as_arrays'
    ]);
  });

  it('stuck skills are deprioritised below active-weak and consolidation', () => {
    const skills = [
      // stuck: unresolved across the threshold
      skill({ skillTag: 'fractions_equal_parts', confidence: 0.3, lastSeen: T0 }),
      // weak but active, not stuck
      skill({ skillTag: 'number_sense_basic', confidence: 0.4, lastSeen: T0 })
    ];
    const ranked = selectStrand(
      input(skills, { unresolvedCounts: { fractions_equal_parts: STUCK_THRESHOLD_UNRESOLVED } })
    );
    expect(ranked[0].reason).toBe('weakest_active');
    expect(ranked[0].skillTag).toBe('number_sense_basic');
    expect(ranked[1].reason).toBe('stuck');
    expect(ranked[1].skillTag).toBe('fractions_equal_parts');
  });

  it('drops inactive (stale) skills that are neither just-passed nor stuck', () => {
    const skills = [
      // last seen 40 days ago — outside the active window, no recent pass, not stuck
      skill({ skillTag: 'fractions_equal_parts', confidence: 0.5, lastSeen: T0 - 40 * DAY })
    ];
    expect(selectStrand(input(skills))).toEqual([]);
  });
});

describe('#14 selectStrand — recency reuses the decay clock', () => {
  it('a just-passed mastery counts as consolidation while decayed confidence stays high', () => {
    const skills = [
      skill({ skillTag: 'multiplication_as_arrays', confidence: 0.7, lastSeen: T0 - 3 * DAY })
    ];
    const ranked = selectStrand(
      input(skills, { recentMasteryResults: { multiplication_as_arrays: ['passed'] } })
    );
    expect(ranked[0].reason).toBe('consolidation');
  });

  it('a pass decayed below the recency floor is no longer "just passed"', () => {
    const skills = [
      // 100 days stale: decay factor 0.85^(100/14) ≈ 0.32; 0.6 * 0.32 ≈ 0.19 < 0.4
      skill({ skillTag: 'multiplication_as_arrays', confidence: 0.6, lastSeen: T0 - 100 * DAY })
    ];
    const ranked = selectStrand(
      input(skills, { recentMasteryResults: { multiplication_as_arrays: ['passed'] } })
    );
    // Not consolidation (pass decayed below floor), not active (stale), not stuck → empty.
    expect(ranked).toEqual([]);
  });

  it('active window boundary: a skill seen within ACTIVE_WINDOW_DAYS is active', () => {
    const within = skill({ skillTag: 'number_sense_basic', confidence: 0.3, lastSeen: T0 - (ACTIVE_WINDOW_DAYS - 1) * DAY });
    const outside = skill({ skillTag: 'fractions_equal_parts', confidence: 0.3, lastSeen: T0 - (ACTIVE_WINDOW_DAYS + 1) * DAY });
    const ranked = selectStrand(input([within, outside]));
    expect(ranked.map((c) => c.skillTag)).toEqual(['number_sense_basic']);
  });
});

describe('#14 selectStrand — ranked list (top N distinct strands)', () => {
  it('emits distinct strands so the cache covers continue + switch paths', () => {
    // Two arrays skills (same strand) + one number sense — only one arrays
    // candidate survives de-dup so the cache holds distinct strands.
    const skills = [
      skill({ skillTag: 'multiplication_as_arrays', confidence: 0.4, lastSeen: T0 }),
      skill({ skillTag: 'multiplication_as_groups', confidence: 0.35, lastSeen: T0 }),
      skill({ skillTag: 'number_sense_basic', confidence: 0.45, lastSeen: T0 })
    ];
    const ranked = selectStrand(input(skills));
    const strands = ranked.map((c) => c.strand);
    expect(new Set(strands).size).toBe(strands.length);
    expect(strands).toContain('multiplication_division');
    expect(strands).toContain('number_sense');
  });

  it('respects CONSOLIDATION_LESSONS by treating a single recent pass as consolidate-once', () => {
    expect(CONSOLIDATION_LESSONS).toBe(1);
    const skills = [skill({ skillTag: 'multiplication_as_arrays', confidence: 0.7, lastSeen: T0 - DAY })];
    const ranked = selectStrand(
      input(skills, { recentMasteryResults: { multiplication_as_arrays: ['passed'] } })
    );
    expect(ranked[0].reason).toBe('consolidation');
  });
});

describe('#14 selectStrand — trapped at threshold (boundary values)', () => {
  it('STUCK_THRESHOLD_UNRESOLVED boundary: N-1 unresolved is NOT stuck, N is', () => {
    const skills = [skill({ skillTag: 'fractions_equal_parts', confidence: 0.3, lastSeen: T0 })];
    // just below threshold -> active, not stuck
    const below = selectStrand(
      input(skills, { unresolvedCounts: { fractions_equal_parts: STUCK_THRESHOLD_UNRESOLVED - 1 } })
    );
    expect(below[0]?.reason).toBe('weakest_active');
    // at threshold -> stuck
    const at = selectStrand(
      input(skills, { unresolvedCounts: { fractions_equal_parts: STUCK_THRESHOLD_UNRESOLVED } })
    );
    expect(at[0]?.reason).toBe('stuck');
  });
});

describe('#14 selectStrand — Focus Strand override (#1 candidate only)', () => {
  it('a focus strand already surfaced is promoted to rank 1 without reordering the rest', () => {
    const skills = [
      skill({ skillTag: 'multiplication_as_arrays', confidence: 0.7, lastSeen: T0 - DAY }),
      skill({ skillTag: 'fractions_equal_parts', confidence: 0.3, lastSeen: T0 })
    ];
    const ranked = selectStrand(
      input(skills, {
        recentMasteryResults: { multiplication_as_arrays: ['passed'] },
        focusStrand: 'fractions'
      })
    );
    expect(ranked[0].strand).toBe('fractions');
    expect(ranked[0].skillTag).toBe('fractions_equal_parts');
    // conservation: consolidation candidate still present
    expect(ranked.find((c) => c.reason === 'consolidation')?.skillTag).toBe('multiplication_as_arrays');
  });

  it('a focus strand with NO candidate surfacing is still the rank-1 override (anchor covers it)', () => {
    const skills = [skill({ skillTag: 'number_sense_basic', confidence: 0.4, lastSeen: T0 })];
    const ranked = selectStrand(input(skills, { focusStrand: 'fractions' }));
    expect(ranked[0].strand).toBe('fractions');
    expect(ranked[0].skillTag).toBe(STRAND_ANCHOR_SKILL['fractions']);
    // the surfaced candidate is retained at rank 2 (override affects ONLY #1)
    expect(ranked[1].skillTag).toBe('number_sense_basic');
  });

  it('override is stable and idempotent when focusStrand is already rank 1', () => {
    const skills = [skill({ skillTag: 'fractions_equal_parts', confidence: 0.3, lastSeen: T0 })];
    const ranked = selectStrand(input(skills, { focusStrand: 'fractions' }));
    expect(ranked[0].strand).toBe('fractions');
    expect(ranked.length).toBe(1);
  });

  it('null focus strand = no override (algorithmic selector only)', () => {
    const skills = [skill({ skillTag: 'fractions_equal_parts', confidence: 0.3, lastSeen: T0 })];
    const ranked = selectStrand(input(skills, { focusStrand: null }));
    expect(ranked[0].skillTag).toBe('fractions_equal_parts');
  });
});

describe('#14 selectStrand — determinism', () => {
  it('same input yields the same ranked output (pure function)', () => {
    const skills = [
      skill({ skillTag: 'multiplication_as_arrays', confidence: 0.7, lastSeen: T0 - DAY }),
      skill({ skillTag: 'number_sense_basic', confidence: 0.3, lastSeen: T0 }),
      skill({ skillTag: 'fractions_equal_parts', confidence: 0.4, lastSeen: T0 })
    ];
    const inp = input(skills, { recentMasteryResults: { multiplication_as_arrays: ['passed'] } });
    expect(selectStrand(inp)).toEqual(selectStrand(inp));
  });

  it('ranks are 1-indexed and contiguous', () => {
    const skills = [
      skill({ skillTag: 'number_sense_basic', confidence: 0.3, lastSeen: T0 }),
      skill({ skillTag: 'fractions_equal_parts', confidence: 0.5, lastSeen: T0 })
    ];
    const ranked = selectStrand(input(skills));
    expect(ranked.map((c) => c.rank)).toEqual([1, 2]);
  });

  it('drops skills with no strand mapping (defensive: unknown skill tag)', () => {
    const skills = [
      skill({ skillTag: 'number_sense_basic', confidence: 0.3, lastSeen: T0 }),
      skill({ skillTag: 'not_a_real_skill', confidence: 0.1, lastSeen: T0 })
    ];
    const ranked = selectStrand(input(skills));
    expect(ranked.map((c) => c.skillTag)).toEqual(['number_sense_basic']);
  });
});
