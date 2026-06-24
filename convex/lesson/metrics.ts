// #15 — Pilot metrics & retention dashboard. Pure aggregation over the
// existing event-ledger + consent records (ADR-0002: aggregate, recomputable).
// No materialised rollup at pilot volume — every figure is computed at read time
// from the record bundle passed in. The Convex query (convex/metrics.ts) is a
// thin read surface that loads records, resolves a cohort→child scope, and
// hands the bundle to `computeDashboard`. This file owns NONE of that I/O.
//
// Every metric degrades to zero (or an empty bucket) when its source records
// don't exist — a fresh pilot never errors; it shows the funnel stages that
// have data. Metrics that have no instrumented source yet degrade to
// `{ available: false }` rather than fabricating a number.
//
// Sources (all pre-existing tables): applications, interviews, children,
// sessions, sessionEvents (incl. the new `digest_opened` event), digests,
// parentFeedback, consents. The Learner Model tables (skillStates /
// patternSignals) are deliberately NOT a source here — "learning" is read from
// session events (mastery_result / misconception / hint_shown), recomputable
// from the ledger, consistent with how the parent dashboard already surfaces
// the model separately.

import { weekKeyForDate } from './digest';

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Input record projections. Structurally typed so tests construct plain objects
// without Convex Ids / _creationTime. Only the fields metrics read are listed.
// ---------------------------------------------------------------------------

export type ApplicationRecord = {
  status: string; // "new" | "contacted" | "accepted" | "declined"
  cohort?: string;
  willingnessToPay: string;
  createdAt: number;
};

export type ChildRecord = {
  _id: string;
  createdAt: number;
  onboardedAt?: number;
};

export type SessionRecord = {
  childId: string;
  status: string; // "active" | "ended"
  startedAt: number;
  endedAt?: number;
  masteryResult?: string; // "passed" | "unresolved" | undefined
};

export type SessionEventRecord = {
  type: string;
  childId?: string; // present for child-scoped events; absent for orphaned ones
  sessionId?: string; // absent for `digest_opened` (no lesson session)
  meta?: unknown;
  at: number;
};

export type DigestRecord = {
  _id: string;
  childId: string;
  status: string; // "visible" | "draft" | "rejected"
  createdAt: number;
};

export type FeedbackRecord = {
  childId: string;
  channel: string; // "model" | "presentation"
  reaction: string; // sounds_right | doesn't_sound_right | useful | not_useful | want_less | want_more
  at: number;
};

export type ConsentRecord = {
  childId: string;
  settings: {
    saveAudio: boolean;
    weeklyDigest: boolean;
    shareWithSchool: boolean;
    fullTranscriptAccess: boolean;
    productImprovement: boolean;
  };
  deletionRequestedAt?: number;
};

export type MetricsInput = {
  applications: ApplicationRecord[];
  children: ChildRecord[];
  interviewedChildIds: string[];
  sessions: SessionRecord[];
  events: SessionEventRecord[];
  digests: DigestRecord[];
  feedback: FeedbackRecord[];
  consents: ConsentRecord[];
  /** childIds in the selected cohort; null = all children. The query resolves
   *  this from applications.cohort → parent.email → children; here it is just a
   *  set used to scope child-keyed records. */
  scope: Set<string> | null;
  /** cohort label echoed back (null = all). Applications are scoped by this. */
  cohort: string | null;
  now: number;
};

// ---------------------------------------------------------------------------
// Result shapes.
// ---------------------------------------------------------------------------

export type FunnelStage = { stage: string; count: number };
export type Rate = { value: number; total: number; rate: number };
export type WeekBucket = { weekKey: string; count: number };
/** A metric with no instrumented source yet — surfaces "not yet available"
 *  rather than a misleading zero. */
export type Metric =
  | { available: true; value: number; total?: number }
  | { available: false; reason: string };

export type Gate1Metrics = {
  applications: number;
  funnel: FunnelStage[];
  willingnessToPay: FunnelStage[];
  interviewCompletion: Rate;
  childActivation: Rate;
};
export type Gate2Metrics = {
  sessionsStarted: number;
  sessionsPerWeek: WeekBucket[];
  completionRate: Rate;
  masteryPassRate: Rate;
  avgHintsPerSession: number;
  hintsTrend: { thisWeek: number; lastWeek: number };
  returningChildren: Rate;
  misconceptionRecurrence: { recurring: number; distinct: number };
};
export type Gate3Metrics = {
  digestsVisible: number;
  digestOpenRate: Rate;
  feedbackAccuracy: Rate;
  feedbackUtility: Rate;
  feedbackVolume: number;
  sectionTuning: { wantMore: number; wantLess: number };
};
export type Gate4Metrics = {
  optOutRate: Rate;
  deletionRequests: number;
  fullTranscriptEnabled: number;
  weeklyActiveChildren: number;
  retentionWow: Rate;
  monthOneRetention: Metric;
  paidConversion: Metric;
  referralRate: Metric;
};

export type MetricsDashboard = {
  cohort: string | null;
  generatedAt: number;
  gate1: Gate1Metrics;
  gate2: Gate2Metrics;
  gate3: Gate3Metrics;
  gate4: Gate4Metrics;
};

// ---------------------------------------------------------------------------
// Small pure helpers.
// ---------------------------------------------------------------------------

export function ratio(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) / 100 : 0;
}

export function rateOf(value: number, total: number): Rate {
  return { value, total, rate: ratio(value, total) };
}

/** Last `n` iso week keys ending at the current week (oldest first). */
export function recentWeekKeys(now: number, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(weekKeyForDate(now - i * 7 * DAY_MS));
  return out;
}

function inScope(childId: string | undefined, scope: Set<string> | null): boolean {
  if (!scope) return true;
  return !!childId && scope.has(childId);
}

// ---------------------------------------------------------------------------
// Per-gate pure functions. Each takes pre-scoped records (the query scopes by
// cohort); tests construct record sets and assert observable behaviour.
// ---------------------------------------------------------------------------

// --- Gate 1: Problem validation (commercial funnel top + parent intent) ---

export function applicationFunnel(apps: ApplicationRecord[]): FunnelStage[] {
  const stages = ['new', 'contacted', 'accepted', 'declined'];
  return stages.map((stage) => ({
    stage,
    count: apps.filter((a) => a.status === stage).length
  }));
}

export function willingnessBreakdown(apps: ApplicationRecord[]): FunnelStage[] {
  const counts = new Map<string, number>();
  for (const a of apps) {
    const key = a.willingnessToPay?.trim() || 'unsure';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count);
}

export function interviewCompletion(
  children: ChildRecord[],
  interviewedChildIds: string[]
): Rate {
  const set = new Set(interviewedChildIds);
  const completed = children.filter((c) => set.has(c._id)).length;
  return rateOf(completed, children.length);
}

/** Children who have started at least one session / total children. */
export function childActivation(
  children: ChildRecord[],
  sessions: SessionRecord[]
): Rate {
  const active = new Set(sessions.map((s) => s.childId));
  const activated = children.filter((c) => active.has(c._id)).length;
  return rateOf(activated, children.length);
}

// --- Gate 2: Lesson-loop validation (child engagement + learning) ---

export function sessionsPerWeek(
  sessions: SessionRecord[],
  now: number,
  weeks = 8
): WeekBucket[] {
  const keys = recentWeekKeys(now, weeks);
  const counts = new Map<string, number>();
  for (const s of sessions) {
    const k = weekKeyForDate(s.startedAt);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return keys.map((weekKey) => ({ weekKey, count: counts.get(weekKey) ?? 0 }));
}

export function completionRate(sessions: SessionRecord[]): Rate {
  const total = sessions.length;
  const completed = sessions.filter((s) => s.status === 'ended').length;
  return rateOf(completed, total);
}

/** Passed / (passed + unresolved) across sessions that reached mastery. */
export function masteryPassRate(sessions: SessionRecord[]): Rate {
  const reached = sessions.filter((s) => s.masteryResult === 'passed' || s.masteryResult === 'unresolved');
  const passed = reached.filter((s) => s.masteryResult === 'passed').length;
  return rateOf(passed, reached.length);
}

export function avgHintsPerSession(
  events: SessionEventRecord[],
  sessions: SessionRecord[]
): number {
  if (sessions.length === 0) return 0;
  const hints = events.filter((e) => e.type === 'hint_shown').length;
  return Math.round((hints / sessions.length) * 100) / 100;
}

/** Average hints per session for the current vs previous week (fewer = learning). */
export function hintsTrend(
  events: SessionEventRecord[],
  sessions: SessionRecord[],
  now: number
): { thisWeek: number; lastWeek: number } {
  const thisKey = weekKeyForDate(now);
  const lastKey = weekKeyForDate(now - 7 * DAY_MS);
  const sessionsIn = (k: string) => sessions.filter((s) => weekKeyForDate(s.startedAt) === k);
  const hintsIn = (k: string) =>
    events.filter((e) => e.type === 'hint_shown' && weekKeyForDate(e.at) === k).length;
  const avg = (k: string) => {
    const n = sessionsIn(k).length;
    return n > 0 ? Math.round((hintsIn(k) / n) * 100) / 100 : 0;
  };
  return { thisWeek: avg(thisKey), lastWeek: avg(lastKey) };
}

/** Children active (a session) in >=2 distinct weeks — proxy for "wants another". */
export function returningChildren(sessions: SessionRecord[], children: ChildRecord[]): Rate {
  const weeksByChild = new Map<string, Set<string>>();
  for (const s of sessions) {
    const set = weeksByChild.get(s.childId) ?? new Set<string>();
    set.add(weekKeyForDate(s.startedAt));
    weeksByChild.set(s.childId, set);
  }
  const returning = [...weeksByChild.values()].filter((w) => w.size >= 2).length;
  return rateOf(returning, children.length);
}

/** Distinct misconception tags seen across >=2 distinct weeks (recurring). */
export function misconceptionRecurrence(events: SessionEventRecord[]): {
  recurring: number;
  distinct: number;
} {
  const tagWeeks = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.type !== 'misconception') continue;
    const tag = (e.meta as { tag?: string } | null)?.tag;
    if (!tag) continue;
    const set = tagWeeks.get(tag) ?? new Set<string>();
    set.add(weekKeyForDate(e.at));
    tagWeeks.set(tag, set);
  }
  const distinct = tagWeeks.size;
  const recurring = [...tagWeeks.values()].filter((w) => w.size >= 2).length;
  return { recurring, distinct };
}

// --- Gate 3: Parent-insight validation ---

/** digest_opened events / visible digests (the one piece of new instrumentation). */
export function digestOpenRate(
  events: SessionEventRecord[],
  digests: DigestRecord[]
): Rate {
  const visible = digests.filter((d) => d.status === 'visible');
  const openedIds = new Set<string>();
  for (const e of events) {
    if (e.type !== 'digest_opened') continue;
    const id = (e.meta as { digestId?: string } | null)?.digestId;
    if (id) openedIds.add(id);
  }
  const opened = visible.filter((d) => openedIds.has(d._id)).length;
  return rateOf(opened, visible.length);
}

export function feedbackAccuracy(feedback: FeedbackRecord[]): Rate {
  const model = feedback.filter((f) => f.channel === 'model');
  const agreed = model.filter((f) => f.reaction === 'sounds_right').length;
  const total = model.filter((f) =>
    ['sounds_right', "doesn't_sound_right"].includes(f.reaction)
  ).length;
  return rateOf(agreed, total);
}

export function feedbackUtility(feedback: FeedbackRecord[]): Rate {
  const pres = feedback.filter((f) => f.channel === 'presentation');
  const useful = pres.filter((f) => f.reaction === 'useful').length;
  const total = pres.filter((f) => ['useful', 'not_useful'].includes(f.reaction)).length;
  return rateOf(useful, total);
}

export function sectionTuning(feedback: FeedbackRecord[]): {
  wantMore: number;
  wantLess: number;
} {
  let wantMore = 0;
  let wantLess = 0;
  for (const f of feedback) {
    if (f.reaction === 'want_more') wantMore++;
    if (f.reaction === 'want_less') wantLess++;
  }
  return { wantMore, wantLess };
}

// --- Gate 4: Productisation (safety/trust + retention + commercial) ---

export function optOutRate(consents: ConsentRecord[]): Rate {
  const total = consents.length;
  const optedOut = consents.filter((c) => !c.settings.weeklyDigest).length;
  return rateOf(optedOut, total);
}

export function deletionRequests(consents: ConsentRecord[]): number {
  return consents.filter((c) => c.deletionRequestedAt != null).length;
}

export function fullTranscriptEnabled(consents: ConsentRecord[]): number {
  return consents.filter((c) => c.settings.fullTranscriptAccess).length;
}

/** Children with a session in the current iso week. */
export function weeklyActiveChildren(
  sessions: SessionRecord[],
  now: number
): number {
  const key = weekKeyForDate(now);
  return new Set(sessions.filter((s) => weekKeyForDate(s.startedAt) === key).map((s) => s.childId)).size;
}

/** Week-over-week retention: of children active last week, how many are active this week. */
export function retentionWow(sessions: SessionRecord[], now: number): Rate {
  const thisKey = weekKeyForDate(now);
  const lastKey = weekKeyForDate(now - 7 * DAY_MS);
  const activeIn = (k: string) =>
    new Set(sessions.filter((s) => weekKeyForDate(s.startedAt) === k).map((s) => s.childId));
  const last = activeIn(lastKey);
  const total = last.size;
  if (total === 0) return { value: 0, total: 0, rate: 0 };
  const retained = sessions
    .filter((s) => weekKeyForDate(s.startedAt) === thisKey)
    .map((s) => s.childId)
    .filter((id) => last.has(id));
  return rateOf(new Set(retained).size, total);
}

/** Month-one retention: children whose first session was >=28d ago AND who have
 *  a session in the last 7 days. Available only when at least one child is old
 *  enough (eligibility window has elapsed); otherwise degrades gracefully. */
export function monthOneRetention(
  sessions: SessionRecord[],
  now: number
): Metric {
  const firstByChild = new Map<string, number>();
  const lastByChild = new Map<string, number>();
  for (const s of sessions) {
    const f = firstByChild.get(s.childId);
    if (f === undefined || s.startedAt < f) firstByChild.set(s.childId, s.startedAt);
    const l = lastByChild.get(s.childId);
    if (l === undefined || s.startedAt > l) lastByChild.set(s.childId, s.startedAt);
  }
  const eligible = [...firstByChild.entries()].filter(([, first]) => now - first >= 28 * DAY_MS);
  if (eligible.length === 0) return { available: false, reason: 'no children are 4+ weeks into the pilot yet' };
  const retainedCount = eligible.filter(([childId]) => {
    const last = lastByChild.get(childId) ?? 0;
    return now - last <= 7 * DAY_MS;
  }).length;
  return { available: true, value: retainedCount, total: eligible.length };
}

// ---------------------------------------------------------------------------
// Cohort scoping (pure). The query resolves cohort → childIds upstream; here we
// apply the scope to child-keyed records and filter applications by cohort.
// ---------------------------------------------------------------------------

export function scopeInput(input: MetricsInput): MetricsInput {
  if (!input.scope) return input;
  const sc = input.scope;
  const childHas = (id?: string) => !!id && sc.has(id);
  return {
    ...input,
    applications: input.cohort
      ? input.applications.filter((a) => a.cohort === input.cohort)
      : input.applications,
    children: input.children.filter((c) => sc.has(c._id)),
    interviewedChildIds: input.interviewedChildIds.filter((id) => sc.has(id)),
    sessions: input.sessions.filter((s) => sc.has(s.childId)),
    events: input.events.filter((e) => e.childId === undefined || sc.has(e.childId)),
    digests: input.digests.filter((d) => sc.has(d.childId)),
    feedback: input.feedback.filter((f) => sc.has(f.childId)),
    consents: input.consents.filter((c) => sc.has(c.childId))
  };
}

// ---------------------------------------------------------------------------
// Top-level assemble. The single call the query makes; the thing tests drive.
// ---------------------------------------------------------------------------

export function computeDashboard(input: MetricsInput): MetricsDashboard {
  const scoped = scopeInput(input);
  const { applications, children, interviewedChildIds, sessions, events, digests, feedback, consents, now, cohort } =
    scoped;

  return {
    cohort,
    generatedAt: now,
    gate1: {
      applications: applications.length,
      funnel: applicationFunnel(applications),
      willingnessToPay: willingnessBreakdown(applications),
      interviewCompletion: interviewCompletion(children, interviewedChildIds),
      childActivation: childActivation(children, sessions)
    },
    gate2: {
      sessionsStarted: sessions.length,
      sessionsPerWeek: sessionsPerWeek(sessions, now),
      completionRate: completionRate(sessions),
      masteryPassRate: masteryPassRate(sessions),
      avgHintsPerSession: avgHintsPerSession(events, sessions),
      hintsTrend: hintsTrend(events, sessions, now),
      returningChildren: returningChildren(sessions, children),
      misconceptionRecurrence: misconceptionRecurrence(events)
    },
    gate3: {
      digestsVisible: digests.filter((d) => d.status === 'visible').length,
      digestOpenRate: digestOpenRate(events, digests),
      feedbackAccuracy: feedbackAccuracy(feedback),
      feedbackUtility: feedbackUtility(feedback),
      feedbackVolume: feedback.length,
      sectionTuning: sectionTuning(feedback)
    },
    gate4: {
      optOutRate: optOutRate(consents),
      deletionRequests: deletionRequests(consents),
      fullTranscriptEnabled: fullTranscriptEnabled(consents),
      weeklyActiveChildren: weeklyActiveChildren(sessions, now),
      retentionWow: retentionWow(sessions, now),
      monthOneRetention: monthOneRetention(sessions, now),
      // No payment / referral instrumentation exists yet — degrade rather than
      // fabricate. willingnessToPay (Gate 1) is the pricing-test proxy.
      paidConversion: { available: false, reason: 'no payment flow instrumented yet (willingnessToPay is the pricing-test proxy)' },
      referralRate: { available: false, reason: 'no referral tracking instrumented yet' }
    }
  };
}
