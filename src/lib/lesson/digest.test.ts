import { describe, it, expect } from 'vitest';
import {
  weekStartMs,
  weekRangeMs,
  weekKeyForDate,
  buildEvidencePack,
  rankShineCandidates,
  scanLabels,
  hasCautiousPhrase,
  guardSectionText,
  guardShine,
  fallbackFor,
  footerText,
  guardAndRepair,
  DIGEST_FOOTER_TEMPLATE,
  type EvidencePack,
  type SessionEventLike,
  type SkillLevelSnapshot,
  type DigestDraft,
  type ShineCandidate,
  type PriorLevel
} from '$convex/lesson/digest';

const T0 = 1_700_000_000_000; // a fixed instant
const DAY = 86_400_000;

// --- fixtures -------------------------------------------------------------

function resolvedAttempt(opts: {
  skillTag?: string;
  taskId?: string;
  phase?: string;
  status?: string;
  attempts?: number;
  hintUsed?: boolean;
  answerType?: string;
  observed?: unknown;
  at?: number;
  sessionId?: string;
}): SessionEventLike {
  const o = {
    skillTag: opts.skillTag ?? 'multiplication_as_arrays',
    taskId: opts.taskId ?? 't1',
    phase: opts.phase ?? 'practice',
    answerType: opts.answerType ?? 'numeric',
    status: opts.status ?? 'correct',
    attempts: opts.attempts ?? 1,
    hintUsed: opts.hintUsed ?? false,
    resolved: true,
    observed: opts.observed
  };
  const ev: SessionEventLike = { type: 'task_attempt', at: opts.at ?? T0, meta: o };
  // attach sessionId for the tricky/misconception join (SessionEventLike omits it
  // but the Convex doc carries it; mirror the real shape).
  (ev as { sessionId?: string }).sessionId = opts.sessionId ?? 's1';
  return ev;
}

function makeSkills(
  rows: { tag: string; level: 'emerging' | 'developing' | 'secure'; score: number; conf?: number }[]
): SkillLevelSnapshot[] {
  return rows.map((r) => ({
    skillTag: r.tag,
    level: r.level,
    levelScore: r.score,
    confidence: r.conf ?? 0.5,
    evidenceCount: 3,
    source: 'lesson',
    lastSeen: T0
  }));
}

const TEMPLATES = {
  improvedTemplate: '{child} is starting to see multiplication as equal rows and columns.',
  trickyTemplate: '{child} sometimes mixes up the number of rows with the number in each row.'
};

function basePackInput(overrides: Partial<Parameters<typeof buildEvidencePack>[0]> = {}) {
  return {
    childId: 'c1',
    childNickname: 'Maya',
    weekKey: '2023-W41',
    window: [T0, T0 + 7 * DAY] as [number, number],
    generatedAt: T0 + 6 * DAY,
    skills: makeSkills([
      { tag: 'multiplication_as_arrays', level: 'developing', score: 0.6 }
    ]),
    patterns: [],
    events: [],
    priorLevels: null,
    templates: TEMPLATES,
    ...overrides
  };
}

// =========================================================================
// Week math
// =========================================================================

describe('#11 week math', () => {
  it('weekStartMs lands on Monday 00:00 UTC', () => {
    // 2023-10-04 was a Wednesday.
    const wed = Date.UTC(2023, 9, 4, 10, 30);
    const monday = weekStartMs(wed);
    expect(new Date(monday).getUTCDay()).toBe(1); // Monday
    expect(new Date(monday).getUTCHours()).toBe(0);
  });

  it('weekRangeMs is a half-open 7-day window', () => {
    const [start, end] = weekRangeMs(Date.UTC(2023, 9, 4));
    expect(end - start).toBe(7 * DAY);
  });

  it('weekKeyForDate gives a stable ISO week key', () => {
    // 2023-10-04 (Wed) is ISO week 40 of 2023.
    expect(weekKeyForDate(Date.UTC(2023, 9, 4))).toBe('2023-W40');
    // 2023-01-01 (Sun) belongs to ISO week 52 of 2022 (edge case).
    expect(weekKeyForDate(Date.UTC(2023, 0, 1))).toBe('2022-W52');
  });
});

// =========================================================================
// Layer 1 — improved (named-week diff)
// =========================================================================

describe('#11 improved diff (named-week)', () => {
  it('flags a skill whose score rose past the noise threshold', () => {
    const pack = buildEvidencePack(
      basePackInput({
        skills: makeSkills([{ tag: 'mult', level: 'secure', score: 0.85 }]),
        priorLevels: { mult: { level: 'developing', levelScore: 0.55 } as PriorLevel }
      })
    );
    expect(pack.improved).toHaveLength(1);
    expect(pack.improved[0].delta).toBeGreaterThan(0.2);
    expect(pack.improved[0].priorLevel).toBe('developing');
  });

  it('flags a level step-up even with a small score rise', () => {
    const pack = buildEvidencePack(
      basePackInput({
        skills: makeSkills([{ tag: 'mult', level: 'developing', score: 0.42 }]),
        priorLevels: { mult: { level: 'emerging', levelScore: 0.38 } as PriorLevel }
      })
    );
    expect(pack.improved).toHaveLength(1);
    expect(pack.improved[0].priorLevel).toBe('emerging');
  });

  it('does not flag a flat skill', () => {
    const pack = buildEvidencePack(
      basePackInput({
        skills: makeSkills([{ tag: 'mult', level: 'developing', score: 0.5 }]),
        priorLevels: { mult: { level: 'developing', levelScore: 0.5 } as PriorLevel }
      })
    );
    expect(pack.improved).toHaveLength(0);
  });

  it('flags a newly-seen skill only once past emerging', () => {
    const secure = buildEvidencePack(
      basePackInput({
        skills: makeSkills([{ tag: 'new_skill', level: 'secure', score: 0.8 }])
        // priorLevels: null -> brand new this week
      })
    );
    expect(secure.improved).toHaveLength(1);

    const emerging = buildEvidencePack(
      basePackInput({
        skills: makeSkills([{ tag: 'new_skill', level: 'emerging', score: 0.3 }])
      })
    );
    expect(emerging.improved).toHaveLength(0);
  });

  it('persists frozen end-of-week levels for next week', () => {
    const pack = buildEvidencePack(
      basePackInput({
        skills: makeSkills([
          { tag: 'a', level: 'secure', score: 0.8 },
          { tag: 'b', level: 'developing', score: 0.5 }
        ])
      })
    );
    const map = Object.fromEntries(pack.levels.map((l) => [l.skillTag, l]));
    expect(map.a.level).toBe('secure');
    expect(map.a.levelScore).toBe(0.8);
    expect(map.b.level).toBe('developing');
  });
});

// =========================================================================
// Layer 1 — tricky
// =========================================================================

describe('#11 tricky from persistent struggle', () => {
  it('flags a maxed-out (resolved incorrect) attempt', () => {
    const events: SessionEventLike[] = [
      resolvedAttempt({
        skillTag: 'division_sharing',
        taskId: 'd1',
        status: 'incorrect',
        attempts: 3,
        at: T0 + DAY
      })
    ];
    const pack = buildEvidencePack(basePackInput({ events }));
    const tricky = pack.tricky.find((t) => t.skillTag === 'division_sharing');
    expect(tricky).toBeTruthy();
  });

  it('flags an unresolved mastery check', () => {
    const events: SessionEventLike[] = [
      resolvedAttempt({
        skillTag: 'fractions_equal_parts',
        taskId: 'm1',
        phase: 'mastery_check',
        status: 'partial',
        attempts: 3,
        at: T0 + DAY
      })
    ];
    const pack = buildEvidencePack(basePackInput({ events }));
    expect(pack.tricky.some((t) => t.skillTag === 'fractions_equal_parts')).toBe(true);
  });

  it('joins an observed misconception to its skill', () => {
    const events: SessionEventLike[] = [
      resolvedAttempt({
        skillTag: 'multiplication_as_arrays',
        taskId: 'p1',
        status: 'correct',
        at: T0 + DAY
      }),
      {
        type: 'misconception',
        at: T0 + DAY + 1,
        meta: { taskId: 'p1', tag: 'rows_columns_confused', source: 'validator', confidence: 0.9 }
      }
    ];
    (events[1] as { sessionId?: string }).sessionId = 's1';
    const pack = buildEvidencePack(basePackInput({ events }));
    const tricky = pack.tricky.find((t) => t.skillTag === 'multiplication_as_arrays');
    expect(tricky?.misconceptions).toContain('rows_columns_confused');
  });

  it('ignores struggle outside the week window', () => {
    const events: SessionEventLike[] = [
      resolvedAttempt({
        skillTag: 'division_sharing',
        status: 'incorrect',
        attempts: 3,
        at: T0 - 10 * DAY // before the window
      })
    ];
    const pack = buildEvidencePack(basePackInput({ events }));
    expect(pack.tricky).toHaveLength(0);
  });
});

// =========================================================================
// Layer 1 — patterns surfaced from patternSignals
// =========================================================================

describe('#11 learning patterns', () => {
  it('surfaces present patterns above the confidence floor', () => {
    const pack = buildEvidencePack(
      basePackInput({
        patterns: [
          { tag: 'benefits_from_visuals', level: 'present', score: 0.8, confidence: 0.6 },
          { tag: 'rushes_when_confident', level: 'present', score: 0.7, confidence: 0.3 }
        ]
      })
    );
    const tags = pack.patterns.map((p) => p.tag);
    expect(tags).toContain('benefits_from_visuals');
    expect(tags).not.toContain('rushes_when_confident'); // below floor
  });

  it('gives a parent-facing phrase, not a tag string', () => {
    const pack = buildEvidencePack(
      basePackInput({
        patterns: [{ tag: 'benefits_from_visuals', level: 'present', score: 0.8, confidence: 0.6 }]
      })
    );
    expect(pack.patterns[0].phrase).toContain('seeing and moving');
  });
});

// =========================================================================
// Layer 1 — shine candidate ranking
// =========================================================================

describe('#11 shine candidate ranking', () => {
  it('surfaces first-try, hint-recovery, persistence, and mastery candidates', () => {
    const inWindow = (t: number) => t >= T0 && t < T0 + 7 * DAY;
    const events: SessionEventLike[] = [
      resolvedAttempt({ skillTag: 'a', taskId: 't_first', status: 'correct', attempts: 1, at: T0 + DAY }),
      resolvedAttempt({ skillTag: 'a', taskId: 't_hint', status: 'correct', attempts: 2, hintUsed: true, at: T0 + 2 * DAY }),
      resolvedAttempt({ skillTag: 'a', taskId: 't_persist', status: 'correct', attempts: 3, at: T0 + 3 * DAY }),
      resolvedAttempt({ skillTag: 'a', taskId: 't_mastery', phase: 'mastery_check', status: 'correct', attempts: 1, at: T0 + 4 * DAY })
    ];
    const cands = rankShineCandidates(events, inWindow);
    const types = cands.map((c) => c.type);
    expect(types).toContain('first_try');
    expect(types).toContain('hint_recovery');
    expect(types).toContain('persistence');
    expect(types).toContain('mastery_first_try');
  });

  it('ranks a mastery_first_try above a plain first_try', () => {
    const inWindow = (t: number) => t >= T0 && t < T0 + 7 * DAY;
    const events: SessionEventLike[] = [
      resolvedAttempt({ skillTag: 'a', taskId: 't_first', status: 'correct', attempts: 1, at: T0 + DAY }),
      resolvedAttempt({ skillTag: 'a', taskId: 't_mastery', phase: 'mastery_check', status: 'correct', attempts: 1, at: T0 + 2 * DAY })
    ];
    const cands = rankShineCandidates(events, inWindow);
    expect(cands[0].type).toBe('mastery_first_try');
  });

  it('caps the candidate list to 5', () => {
    const inWindow = (t: number) => t >= T0 && t < T0 + 7 * DAY;
    const events: SessionEventLike[] = Array.from({ length: 10 }, (_, i) =>
      resolvedAttempt({ skillTag: 'a', taskId: `t${i}`, status: 'correct', attempts: 1, at: T0 + i * 1000 })
    );
    expect(rankShineCandidates(events, inWindow).length).toBeLessThanOrEqual(5);
  });

  it('ignores wrong attempts and out-of-window events', () => {
    const inWindow = (t: number) => t >= T0 && t < T0 + 7 * DAY;
    const events: SessionEventLike[] = [
      resolvedAttempt({ skillTag: 'a', taskId: 'wrong', status: 'incorrect', attempts: 3, at: T0 + DAY }),
      resolvedAttempt({ skillTag: 'a', taskId: 'old', status: 'correct', attempts: 1, at: T0 - 10 * DAY })
    ];
    expect(rankShineCandidates(events, inWindow)).toHaveLength(0);
  });

  it('requires a substantive explanation for an explanation-type candidate', () => {
    const inWindow = (t: number) => t >= T0 && t < T0 + 7 * DAY;
    const short = rankShineCandidates(
      [resolvedAttempt({ skillTag: 'a', taskId: 't', status: 'captured', answerType: 'explanation', observed: 'um', at: T0 + DAY })],
      inWindow
    );
    expect(short).toHaveLength(0);
    const rich = rankShineCandidates(
      [resolvedAttempt({ skillTag: 'a', taskId: 't', status: 'captured', answerType: 'explanation', observed: 'I made three rows because three times four is twelve', at: T0 + DAY })],
      inWindow
    );
    expect(rich[0].type).toBe('explanation');
  });

  it('every candidate is traceable: id + evidence string present', () => {
    const inWindow = (t: number) => t >= T0 && t < T0 + 7 * DAY;
    const cands = rankShineCandidates(
      [resolvedAttempt({ skillTag: 'a', taskId: 't1', status: 'correct', attempts: 1, at: T0 + DAY })],
      inWindow
    );
    expect(cands[0].id).toBeTruthy();
    expect(cands[0].evidence).toContain('t1');
  });
});

// =========================================================================
// Layer 3 — guardrail
// =========================================================================

describe('#11 banned-label scan (negation-aware)', () => {
  it('trips on "gifted"', () => {
    expect(scanLabels('Your child is gifted at maths.')).toContain('gifted');
  });

  it('trips on "not gifted" — labelling either way is forbidden', () => {
    expect(scanLabels('Your child is not gifted.')).toContain('gifted');
  });

  it('trips on diagnoses: adhd, dyslexia, autism', () => {
    expect(scanLabels('May show signs of ADHD.')).toContain('adhd');
    expect(scanLabels('Possibly dyslexic.')).toContain('dyslexic');
    expect(scanLabels('On the spectrum.')).toContain('on the spectrum');
  });

  it('trips on behaviour labels', () => {
    expect(scanLabels('This is a behaviour problem.')).toContain('behaviour problem');
    expect(scanLabels('Seems like a bad focus week.')).toContain('bad focus');
  });

  it('does not trip on benign text', () => {
    expect(scanLabels('This week, Maya may respond well to drawing it out.')).toEqual([]);
  });

  it('is case-insensitive and whole-word', () => {
    expect(scanLabels('VERY LAZY today')).toContain('lazy');
    // whole-word: "adding" should not match "adhd"
    expect(scanLabels('Maya was adding numbers')).toEqual([]);
  });
});

describe('#11 cautious-phrase check', () => {
  it('passes text containing a hedge', () => {
    expect(hasCautiousPhrase('This week, things went well.')).toBe(true);
    expect(hasCautiousPhrase('Maya may respond well to visuals.')).toBe(true);
    expect(hasCautiousPhrase('It seems to click when she draws it.')).toBe(true);
    expect(hasCautiousPhrase('Worth trying counters at home.')).toBe(true);
  });

  it('flags text with no hedge', () => {
    expect(hasCautiousPhrase('Maya is great at arrays.')).toBe(false);
  });
});

describe('#11 guardSectionText', () => {
  it('passes a safe section', () => {
    const r = guardSectionText('This week, Maya seems to be getting more confident with arrays.');
    expect(r.ok).toBe(true);
  });

  it('flags a label', () => {
    const r = guardSectionText('Maya is gifted at maths this week.');
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes('banned'))).toBe(true);
  });

  it('flags a missing cautious phrase', () => {
    const r = guardSectionText('Maya worked on arrays and got faster.');
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes('cautious'))).toBe(true);
  });
});

describe('#11 guardShine (candidate-bounded)', () => {
  const candidates: ShineCandidate[] = [
    { id: 'shine_0', skillTag: 'a', taskId: 't1', type: 'first_try', when: T0, evidence: 'x', score: 3 }
  ];

  it('passes a traceable shine moment', () => {
    const r = guardShine({ chosenCandidateId: 'shine_0', text: 'This week, Maya solved a task first try — lovely.' }, candidates);
    expect(r.ok).toBe(true);
  });

  it('rejects a shine moment not traceable to a candidate', () => {
    const r = guardShine({ chosenCandidateId: 'made_up', text: 'This week, Maya was brilliant.' }, candidates);
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes('traceable'))).toBe(true);
  });

  it('rejects any shine narrative when candidates are empty', () => {
    const r = guardShine({ chosenCandidateId: null, text: 'This week, Maya shone brightly.' }, []);
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes('no shine candidates'))).toBe(true);
  });
});

// =========================================================================
// Layer 3 — fallbacks (the safety floor)
// =========================================================================

describe('#11 fallbackFor', () => {
  const pack = buildEvidencePack(basePackInput());

  it('improved/tricky use the plan templates, sanitised to pass the guard', () => {
    const imp = fallbackFor('improved', pack);
    const tri = fallbackFor('tricky', pack);
    expect(guardSectionText(imp).ok).toBe(true);
    expect(guardSectionText(tri).ok).toBe(true);
    expect(imp).toContain('Maya');
  });

  it('patterns fallback names the present patterns', () => {
    const p = buildEvidencePack(
      basePackInput({
        patterns: [{ tag: 'benefits_from_visuals', level: 'present', score: 0.8, confidence: 0.6 }]
      })
    );
    const fb = fallbackFor('patterns', p);
    expect(guardSectionText(fb).ok).toBe(true);
    expect(fb).toContain('seeing and moving');
  });

  it('shine fallback is gentle when there are no candidates', () => {
    const fb = fallbackFor('shine', pack); // basePackInput has no events -> no candidates
    expect(guardSectionText(fb).ok).toBe(true);
    expect(fb.toLowerCase()).toContain('settling');
  });

  it('home fallback is actionable and guard-safe', () => {
    const fb = fallbackFor('home', pack);
    expect(guardSectionText(fb).ok).toBe(true);
  });
});

describe('#11 footer is verbatim and deterministic', () => {
  it('is injected by the guardrail, never by the LLM', () => {
    const f = footerText('Maya');
    expect(f).toBe(DIGEST_FOOTER_TEMPLATE.replaceAll('{child}', 'Maya'));
    expect(f).toContain('not fixed labels or a diagnosis');
    expect(f).toContain('Maya');
  });
});

// =========================================================================
// Layer 3 — regenerate-once-then-fallback repair loop
// =========================================================================

describe('#11 guardAndRepair repair loop', () => {
  function packWithCandidates(): EvidencePack {
    return buildEvidencePack(
      basePackInput({
        events: [
          resolvedAttempt({ skillTag: 'a', taskId: 't1', status: 'correct', attempts: 1, at: T0 + DAY })
        ]
      })
    );
  }

  it('passes a fully-safe draft untouched and injects the footer', async () => {
    const pack = packWithCandidates();
    const draft: DigestDraft = {
      improved: 'This week, Maya seems more confident with arrays.',
      tricky: 'This week, rows and columns may still be tricky.',
      patterns: 'This week, Maya may respond well to drawing it out.',
      shine: { chosenCandidateId: pack.shineCandidates[0].id, text: 'This week, Maya solved a task first try.' },
      home: 'This week, worth trying counters at the table.'
    };
    const regenerate = async () => 'unused';
    const out = await guardAndRepair(draft, pack, regenerate);
    expect(out.improved).toBe(draft.improved);
    expect(out.flags.every((f) => f.action === 'passed')).toBe(true);
    expect(out.footer).toContain('not fixed labels or a diagnosis');
  });

  it('regenerates a flagged section once, then passes it', async () => {
    const pack = packWithCandidates();
    const draft: DigestDraft = {
      improved: 'Maya is gifted.', // label + no hedge -> flagged
      tricky: 'This week, things were okay.',
      patterns: 'This week, seems fine.',
      shine: { chosenCandidateId: pack.shineCandidates[0].id, text: 'This week, a nice moment.' },
      home: 'This week, worth trying drawing.'
    };
    const regenerate = async () => 'This week, Maya seems to be growing in confidence with arrays.';
    const out = await guardAndRepair(draft, pack, regenerate);
    expect(out.improved).toContain('This week');
    expect(out.improved).not.toContain('gifted');
    const improvedFlag = out.flags.find((f) => f.section === 'improved');
    expect(improvedFlag?.action).toBe('regenerated');
  });

  it('falls back to the template when regen still fails', async () => {
    const pack = packWithCandidates();
    const draft: DigestDraft = {
      improved: 'Maya is gifted.',
      tricky: 'This week, okay.',
      patterns: 'This week, okay.',
      shine: { chosenCandidateId: pack.shineCandidates[0].id, text: 'This week, nice.' },
      home: 'This week, okay.'
    };
    // regen keeps returning a labelled sentence -> must fall back
    const regenerate = async () => 'Maya is lazy again.';
    const out = await guardAndRepair(draft, pack, regenerate);
    expect(out.improved).not.toContain('lazy');
    expect(out.improved).not.toContain('gifted');
    const improvedFlag = out.flags.find((f) => f.section === 'improved');
    expect(improvedFlag?.action).toBe('fell_back');
    expect(guardSectionText(out.improved).ok).toBe(true);
  });

  it('shine with no candidates always degrades to the gentle fallback', async () => {
    const pack = buildEvidencePack(basePackInput()); // no events -> no candidates
    const draft: DigestDraft = {
      improved: 'This week, okay.',
      tricky: 'This week, okay.',
      patterns: 'This week, okay.',
      shine: { chosenCandidateId: null, text: 'Maya had an amazing moment this week.' }, // fabricated
      home: 'This week, okay.'
    };
    const out = await guardAndRepair(draft, pack, async () => 'This week, a fine moment.');
    expect(out.shineFallbackUsed).toBe(true);
    expect(out.shine.toLowerCase()).toContain('settling');
    expect(out.chosenCandidateId).toBeNull();
  });

  it('never leaves a sentence broken: every section passes the guard', async () => {
    const pack = packWithCandidates();
    const draft: DigestDraft = {
      improved: 'broken',
      tricky: 'broken',
      patterns: 'broken',
      shine: { chosenCandidateId: 'nope', text: 'broken' },
      home: 'broken'
    };
    const regenerate = async () => 'still broken with a label: gifted';
    const out = await guardAndRepair(draft, pack, regenerate);
    for (const section of [out.improved, out.tricky, out.patterns, out.shine, out.home]) {
      expect(guardSectionText(section).ok).toBe(true);
    }
  });
});
