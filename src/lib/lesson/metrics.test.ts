import { describe, it, expect } from 'vitest';
import {
  computeDashboard,
  scopeInput,
  ratio,
  rateOf,
  recentWeekKeys,
  applicationFunnel,
  willingnessBreakdown,
  interviewCompletion,
  childActivation,
  completionRate,
  masteryPassRate,
  avgHintsPerSession,
  hintsTrend,
  returningChildren,
  misconceptionRecurrence,
  sessionsPerWeek,
  digestOpenRate,
  feedbackAccuracy,
  feedbackUtility,
  sectionTuning,
  optOutRate,
  deletionRequests,
  fullTranscriptEnabled,
  weeklyActiveChildren,
  retentionWow,
  monthOneRetention,
  type MetricsInput
} from '$convex/lesson/metrics';

const DAY = 86_400_000;
const NOW = 1_750_000_000_000; // a fixed anchor; tests use relative offsets

// --- fresh pilot: every metric degrades to zero / empty, never errors ---
const empty: MetricsInput = {
  applications: [],
  children: [],
  interviewedChildIds: [],
  sessions: [],
  events: [],
  digests: [],
  feedback: [],
  consents: [],
  scope: null,
  cohort: null,
  now: NOW
};

describe('#15 graceful degradation (fresh pilot)', () => {
  it('never errors and zeros everything out', () => {
    const d = computeDashboard(empty);
    expect(d.cohort).toBeNull();
    expect(d.gate1.applications).toBe(0);
    expect(d.gate1.funnel).toHaveLength(4);
    expect(d.gate1.funnel.every((s) => s.count === 0)).toBe(true);
    expect(d.gate1.childActivation.rate).toBe(0);
    expect(d.gate2.sessionsStarted).toBe(0);
    expect(d.gate2.completionRate).toEqual({ value: 0, total: 0, rate: 0 });
    expect(d.gate3.digestOpenRate).toEqual({ value: 0, total: 0, rate: 0 });
    expect(d.gate4.optOutRate.rate).toBe(0);
  });

  it('degrades uninstrumented commercial metrics to "not available"', () => {
    const d = computeDashboard(empty);
    expect(d.gate4.paidConversion.available).toBe(false);
    expect(d.gate4.referralRate.available).toBe(false);
  });

  it('month-one retention is unavailable before any child is 4+ weeks in', () => {
    expect(monthOneRetention([], NOW).available).toBe(false);
  });
});

describe('#15 helpers', () => {
  it('ratio guards divide-by-zero and rounds to 2dp', () => {
    expect(ratio(1, 3)).toBe(0.33);
    expect(ratio(0, 0)).toBe(0);
    expect(ratio(2, 2)).toBe(1);
  });
  it('rateOf composes value/total/rate', () => {
    expect(rateOf(3, 4)).toEqual({ value: 3, total: 4, rate: 0.75 });
    expect(rateOf(0, 0).rate).toBe(0);
  });
  it('recentWeekKeys returns n distinct keys oldest-first', () => {
    const keys = recentWeekKeys(NOW, 8);
    expect(keys).toHaveLength(8);
    expect(new Set(keys).size).toBe(8);
  });
});

describe('#15 gate 1 — problem validation', () => {
  const apps = [
    { status: 'new', cohort: 'alpha', willingnessToPay: '£29/month', createdAt: 1 },
    { status: 'accepted', cohort: 'alpha', willingnessToPay: '£49 pilot', createdAt: 2 },
    { status: 'declined', cohort: 'beta', willingnessToPay: 'unsure', createdAt: 3 },
    { status: 'contacted', cohort: 'alpha', willingnessToPay: '£29/month', createdAt: 4 }
  ];
  it('applicationFunnel counts each stage', () => {
    const f = applicationFunnel(apps);
    expect(f.find((s) => s.stage === 'new')!.count).toBe(1);
    expect(f.find((s) => s.stage === 'accepted')!.count).toBe(1);
    expect(f.find((s) => s.stage === 'contacted')!.count).toBe(1);
    expect(f.find((s) => s.stage === 'declined')!.count).toBe(1);
  });
  it('willingnessBreakdown buckets free-text sorted desc', () => {
    const b = willingnessBreakdown(apps);
    expect(b[0].stage).toBe('£29/month');
    expect(b[0].count).toBe(2);
  });
  it('interviewCompletion: completed / total children', () => {
    const children = [
      { _id: 'c1', createdAt: 1 },
      { _id: 'c2', createdAt: 2 }
    ];
    expect(interviewCompletion(children, ['c1'])).toEqual({ value: 1, total: 2, rate: 0.5 });
  });
  it('childActivation: children with >=1 session / total', () => {
    const children = [
      { _id: 'c1', createdAt: 1 },
      { _id: 'c2', createdAt: 2 }
    ];
    const sessions = [{ childId: 'c1', status: 'ended', startedAt: NOW }];
    expect(childActivation(children, sessions).rate).toBe(0.5);
  });
});

describe('#15 gate 2 — lesson-loop validation', () => {
  const sessions = [
    { childId: 'c1', status: 'ended', startedAt: NOW, masteryResult: 'passed' },
    { childId: 'c1', status: 'ended', startedAt: NOW - 8 * DAY, masteryResult: 'passed' },
    { childId: 'c2', status: 'ended', startedAt: NOW - 8 * DAY, masteryResult: 'unresolved' },
    { childId: 'c1', status: 'active', startedAt: NOW }
  ];
  it('completionRate: ended / started', () => {
    expect(completionRate(sessions)).toEqual({ value: 3, total: 4, rate: 0.75 });
  });
  it('masteryPassRate: passed / (passed+unresolved) reaching mastery', () => {
    expect(masteryPassRate(sessions)).toEqual({ value: 2, total: 3, rate: 0.67 });
  });
  it('avgHintsPerSession: hint_shown events / sessions', () => {
    const events = [
      { type: 'hint_shown', at: NOW },
      { type: 'hint_shown', at: NOW },
      { type: 'task_attempt', at: NOW }
    ];
    expect(avgHintsPerSession(events, sessions)).toBe(0.5); // 2 / 4
  });
  it('hintsTrend: avg hints this week vs last week', () => {
    const events = [
      { type: 'hint_shown', at: NOW }, // this week (1 hint)
      { type: 'hint_shown', at: NOW - 8 * DAY }, // last week
      { type: 'hint_shown', at: NOW - 8 * DAY } // last week (2 hints)
    ];
    const t = hintsTrend(events, sessions, NOW);
    expect(t.thisWeek).toBe(0.5); // 1 hint / 2 sessions this week
    expect(t.lastWeek).toBe(1); // 2 hints / 2 sessions last week
  });
  it('returningChildren: active in >=2 distinct weeks', () => {
    const children = [
      { _id: 'c1', createdAt: 1 },
      { _id: 'c2', createdAt: 2 }
    ];
    expect(returningChildren(sessions, children)).toEqual({ value: 1, total: 2, rate: 0.5 });
  });
  it('sessionsPerWeek: 8 buckets, counts sum to total', () => {
    const b = sessionsPerWeek(sessions, NOW, 8);
    expect(b).toHaveLength(8);
    expect(b.reduce((a, x) => a + x.count, 0)).toBe(4);
  });
  it('misconceptionRecurrence: tag seen across >=2 weeks recurs', () => {
    const events = [
      { type: 'misconception', at: NOW, meta: { tag: 'rows_columns_confused' } },
      { type: 'misconception', at: NOW - 8 * DAY, meta: { tag: 'rows_columns_confused' } },
      { type: 'misconception', at: NOW, meta: { tag: 'unequal_groups' } }
    ];
    expect(misconceptionRecurrence(events)).toEqual({ recurring: 1, distinct: 2 });
  });
});

describe('#15 gate 3 — parent-insight validation', () => {
  const digests = [
    { _id: 'd1', childId: 'c1', status: 'visible', createdAt: 1 },
    { _id: 'd2', childId: 'c1', status: 'visible', createdAt: 2 },
    { _id: 'd3', childId: 'c2', status: 'draft', createdAt: 3 }
  ];
  it('digestOpenRate (new instrumentation): opened visible digests / total visible', () => {
    // d1 opened, d2 not opened, d3 is draft (excluded from denominator)
    const events = [{ type: 'digest_opened', childId: 'c1', at: NOW, meta: { digestId: 'd1' } }];
    expect(digestOpenRate(events, digests)).toEqual({ value: 1, total: 2, rate: 0.5 });
  });
  it('digestOpenRate is 0 when no digests are opened', () => {
    expect(digestOpenRate([], digests).rate).toBe(0);
  });
  it('feedbackAccuracy: sounds_right / model truth-claims', () => {
    const fb = [
      { childId: 'c1', channel: 'model', reaction: 'sounds_right', at: 1 },
      { childId: 'c1', channel: 'model', reaction: "doesn't_sound_right", at: 2 },
      { childId: 'c1', channel: 'presentation', reaction: 'useful', at: 3 }
    ];
    expect(feedbackAccuracy(fb)).toEqual({ value: 1, total: 2, rate: 0.5 });
  });
  it('feedbackUtility: useful / (useful+not_useful) presentation', () => {
    const fb = [
      { childId: 'c1', channel: 'presentation', reaction: 'useful', at: 1 },
      { childId: 'c1', channel: 'presentation', reaction: 'not_useful', at: 2 },
      { childId: 'c1', channel: 'presentation', reaction: 'want_more', at: 3 }
    ];
    expect(feedbackUtility(fb)).toEqual({ value: 1, total: 2, rate: 0.5 });
  });
  it('sectionTuning tallies want_more / want_less', () => {
    const fb = [
      { childId: 'c1', channel: 'presentation', reaction: 'want_more', at: 1 },
      { childId: 'c1', channel: 'presentation', reaction: 'want_more', at: 2 },
      { childId: 'c1', channel: 'presentation', reaction: 'want_less', at: 3 }
    ];
    expect(sectionTuning(fb)).toEqual({ wantMore: 2, wantLess: 1 });
  });
});

describe('#15 gate 4 — productisation (safety / trust / retention)', () => {
  const consents = [
    {
      childId: 'c1',
      settings: { saveAudio: false, weeklyDigest: false, shareWithSchool: false, fullTranscriptAccess: false, productImprovement: false },
      deletionRequestedAt: 99
    },
    {
      childId: 'c2',
      settings: { saveAudio: false, weeklyDigest: true, shareWithSchool: false, fullTranscriptAccess: true, productImprovement: false }
    }
  ];
  it('optOutRate: weeklyDigest off / total consents', () => {
    expect(optOutRate(consents)).toEqual({ value: 1, total: 2, rate: 0.5 });
  });
  it('deletionRequests counts consent rows with deletionRequestedAt', () => {
    expect(deletionRequests(consents)).toBe(1);
  });
  it('fullTranscriptEnabled counts enabled', () => {
    expect(fullTranscriptEnabled(consents)).toBe(1);
  });
  it('weeklyActiveChildren: distinct children with a session this week', () => {
    const sessions = [
      { childId: 'c1', status: 'ended', startedAt: NOW },
      { childId: 'c1', status: 'ended', startedAt: NOW },
      { childId: 'c2', status: 'ended', startedAt: NOW - 8 * DAY }
    ];
    expect(weeklyActiveChildren(sessions, NOW)).toBe(1);
  });
  it('retentionWow: last-week active children who returned this week', () => {
    const sessions = [
      { childId: 'c1', status: 'ended', startedAt: NOW - 8 * DAY }, // active last week
      { childId: 'c2', status: 'ended', startedAt: NOW - 8 * DAY }, // active last week
      { childId: 'c1', status: 'ended', startedAt: NOW } // returned this week
    ];
    expect(retentionWow(sessions, NOW)).toEqual({ value: 1, total: 2, rate: 0.5 });
  });
  it('retentionWow is 0 when nobody was active last week', () => {
    expect(retentionWow([], NOW)).toEqual({ value: 0, total: 0, rate: 0 });
  });
  it('monthOneRetention: available once a child is 4+ weeks in AND returned within 7d', () => {
    const sessions = [
      { childId: 'c1', status: 'ended', startedAt: NOW - 30 * DAY }, // first session 30d ago
      { childId: 'c1', status: 'ended', startedAt: NOW - DAY }, // recent session
      { childId: 'c2', status: 'ended', startedAt: NOW } // too new to be eligible
    ];
    const r = monthOneRetention(sessions, NOW);
    expect(r.available).toBe(true);
    if (r.available) {
      expect(r.total).toBe(1); // only c1 is 4+ weeks in
      expect(r.value).toBe(1);
    }
  });
});

describe('#15 cohort scoping (pure)', () => {
  it('filters child-keyed records by scope and apps by cohort', () => {
    const input: MetricsInput = {
      applications: [
        { status: 'accepted', cohort: 'alpha', willingnessToPay: 'x', createdAt: 1 },
        { status: 'new', cohort: 'beta', willingnessToPay: 'y', createdAt: 2 }
      ],
      children: [
        { _id: 'c1', createdAt: 1 },
        { _id: 'c2', createdAt: 2 }
      ],
      interviewedChildIds: ['c1', 'c2'],
      sessions: [
        { childId: 'c1', status: 'ended', startedAt: NOW },
        { childId: 'c2', status: 'ended', startedAt: NOW }
      ],
      events: [
        { type: 'hint_shown', childId: 'c1', at: NOW },
        { type: 'hint_shown', childId: 'c2', at: NOW }
      ],
      digests: [
        { _id: 'd1', childId: 'c1', status: 'visible', createdAt: 1 },
        { _id: 'd2', childId: 'c2', status: 'visible', createdAt: 2 }
      ],
      feedback: [{ childId: 'c1', channel: 'model', reaction: 'sounds_right', at: 1 }],
      consents: [
        {
          childId: 'c1',
          settings: { saveAudio: false, weeklyDigest: true, shareWithSchool: false, fullTranscriptAccess: false, productImprovement: false }
        }
      ],
      scope: new Set(['c1']),
      cohort: 'alpha',
      now: NOW
    };
    const scoped = scopeInput(input);
    expect(scoped.children).toHaveLength(1);
    expect(scoped.children[0]._id).toBe('c1');
    expect(scoped.sessions).toHaveLength(1);
    expect(scoped.digests).toHaveLength(1);
    expect(scoped.feedback).toHaveLength(1);
    expect(scoped.consents).toHaveLength(1);
    expect(scoped.interviewedChildIds).toEqual(['c1']);
    expect(scoped.applications.every((a) => a.cohort === 'alpha')).toBe(true);
    // child-less events are preserved, child-keyed ones scoped
    expect(scoped.events).toHaveLength(1);
    expect(scoped.events[0].childId).toBe('c1');
  });

  it('null scope leaves everything untouched', () => {
    const scoped = scopeInput({ ...empty, scope: null, cohort: null });
    expect(scoped.children).toEqual([]);
  });
});

describe('#15 computeDashboard (end-to-end bundle)', () => {
  it('assembles all four gates from a constructed record set', () => {
    const input: MetricsInput = {
      applications: [
        { status: 'accepted', cohort: 'alpha', willingnessToPay: '£29/month', createdAt: 1 },
        { status: 'new', cohort: 'alpha', willingnessToPay: '£49 pilot', createdAt: 2 }
      ],
      children: [
        { _id: 'c1', createdAt: 1 },
        { _id: 'c2', createdAt: 2 }
      ],
      interviewedChildIds: ['c1'],
      sessions: [
        { childId: 'c1', status: 'ended', startedAt: NOW, masteryResult: 'passed' },
        { childId: 'c1', status: 'ended', startedAt: NOW - 8 * DAY, masteryResult: 'passed' },
        { childId: 'c2', status: 'ended', startedAt: NOW - 8 * DAY, masteryResult: 'unresolved' }
      ],
      events: [
        { type: 'hint_shown', childId: 'c1', at: NOW },
        { type: 'hint_shown', childId: 'c1', at: NOW - 8 * DAY },
        { type: 'digest_opened', childId: 'c1', at: NOW, meta: { digestId: 'd1' } }
      ],
      digests: [
        { _id: 'd1', childId: 'c1', status: 'visible', createdAt: 1 },
        { _id: 'd2', childId: 'c2', status: 'visible', createdAt: 2 }
      ],
      feedback: [
        { childId: 'c1', channel: 'model', reaction: 'sounds_right', at: 1 },
        { childId: 'c2', channel: 'presentation', reaction: 'useful', at: 2 }
      ],
      consents: [
        {
          childId: 'c1',
          settings: { saveAudio: false, weeklyDigest: true, shareWithSchool: false, fullTranscriptAccess: true, productImprovement: false }
        },
        {
          childId: 'c2',
          settings: { saveAudio: false, weeklyDigest: false, shareWithSchool: false, fullTranscriptAccess: false, productImprovement: false }
        }
      ],
      scope: null,
      cohort: null,
      now: NOW
    };
    const d = computeDashboard(input);

    // Gate 1
    expect(d.gate1.applications).toBe(2);
    expect(d.gate1.interviewCompletion.rate).toBe(0.5);
    // Gate 2 — returning: c1 active in 2 weeks, c2 in 1 -> 1/2
    expect(d.gate2.sessionsStarted).toBe(3);
    expect(d.gate2.completionRate).toEqual({ value: 3, total: 3, rate: 1 });
    expect(d.gate2.returningChildren.rate).toBe(0.5);
    // Gate 3 — d1 opened of 2 visible -> 0.5
    expect(d.gate3.digestOpenRate).toEqual({ value: 1, total: 2, rate: 0.5 });
    expect(d.gate3.feedbackVolume).toBe(2);
    // Gate 4 — one of two consents opted out
    expect(d.gate4.optOutRate.rate).toBe(0.5);
    expect(d.gate4.fullTranscriptEnabled).toBe(1);
  });
});
