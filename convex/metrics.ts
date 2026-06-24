// #15 — Pilot metrics & retention dashboard: read-only read surface. Loads the
// existing tables, resolves an optional cohort → child scope (applications.cohort
// joined through parent.email → children), projects to the pure record shapes,
// and hands the bundle to `computeDashboard` in ./lesson/metrics. No writes, no
// materialised rollup (ADR-0002: aggregate over the ledger at read time).
//
// The parent-facing digest route owns the one write #15 introduces
// (`digest_opened`); this surface only reads. Every metric degrades to zero /
// "not yet available" when its source records are absent, so a fresh pilot never
// errors — it shows the funnel stages that have data.

import { query } from './_generated/server';
import { v } from 'convex/values';
import {
  computeDashboard,
  type ApplicationRecord,
  type ChildRecord,
  type SessionRecord,
  type SessionEventRecord,
  type DigestRecord,
  type FeedbackRecord,
  type ConsentRecord,
  type MetricsDashboard
} from './lesson/metrics';

function lower(s: string | undefined): string {
  return s?.trim().toLowerCase() ?? '';
}

/**
 * Resolves the cohort filter to the set of child ids whose parent's email
 * matches an application tagged with that cohort (the join path called out in
 * the issue: applications.cohort → parent → child). Returns null when no cohort
 * is selected (all children).
 */
async function childScopeForCohort(
  ctx: any,
  cohort: string | null
): Promise<Set<string> | null> {
  if (!cohort) return null;
  const apps = await ctx.db.query('applications').collect();
  const emails = new Set(
    apps.filter((a: any) => a.cohort === cohort).map((a: any) => lower(a.email)).filter(Boolean) as string[]
  );
  if (emails.size === 0) return new Set();
  const parents = await ctx.db.query('parents').collect();
  const parentIds = new Set(
    parents.filter((p: any) => emails.has(lower(p.email))).map((p: any) => p._id)
  );
  const children = await ctx.db.query('children').collect();
  return new Set(children.filter((c: any) => parentIds.has(c.parentId)).map((c: any) => c._id));
}

export const dashboard = query({
  args: { cohort: v.optional(v.string()) },
  handler: async (ctx, args): Promise<MetricsDashboard> => {
    const now = Date.now();
    const cohort = args.cohort?.trim() || null;
    const scope = await childScopeForCohort(ctx, cohort);

    const [applications, children, interviews, sessions, events, digests, feedback, consents] =
      await Promise.all([
        ctx.db.query('applications').collect(),
        ctx.db.query('children').collect(),
        ctx.db.query('interviews').collect(),
        ctx.db.query('sessions').collect(),
        ctx.db.query('sessionEvents').collect(),
        ctx.db.query('digests').collect(),
        ctx.db.query('parentFeedback').collect(),
        ctx.db.query('consents').collect()
      ]);

    const appRows: ApplicationRecord[] = applications.map((a: any) => ({
      status: a.status,
      cohort: a.cohort,
      willingnessToPay: a.willingnessToPay,
      createdAt: a.createdAt
    }));
    const childRows: ChildRecord[] = children.map((c: any) => ({
      _id: c._id,
      createdAt: c.createdAt,
      onboardedAt: c.onboardedAt
    }));
    const interviewedChildIds: string[] = interviews.map((i: any) => i.childId);
    const sessionRows: SessionRecord[] = sessions.map((s: any) => ({
      childId: s.childId,
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      masteryResult: s.masteryResult
    }));
    const eventRows: SessionEventRecord[] = events.map((e: any) => ({
      type: e.type,
      childId: e.childId,
      sessionId: e.sessionId,
      meta: e.meta,
      at: e.at
    }));
    const digestRows: DigestRecord[] = digests.map((d: any) => ({
      _id: d._id,
      childId: d.childId,
      status: d.status,
      createdAt: d.createdAt
    }));
    const feedbackRows: FeedbackRecord[] = feedback.map((f: any) => ({
      childId: f.childId,
      channel: f.channel,
      reaction: f.reaction,
      at: f.at
    }));
    const consentRows: ConsentRecord[] = consents.map((c: any) => ({
      childId: c.childId,
      settings: c.settings,
      deletionRequestedAt: c.deletionRequestedAt
    }));

    return computeDashboard({
      applications: appRows,
      children: childRows,
      interviewedChildIds,
      sessions: sessionRows,
      events: eventRows,
      digests: digestRows,
      feedback: feedbackRows,
      consents: consentRows,
      scope,
      cohort,
      now
    });
  }
});

/** Distinct cohorts present on applications (for the filter UI). */
export const cohorts = query({
  args: {},
  handler: async (ctx) => {
    const apps = await ctx.db.query('applications').collect();
    const set = new Set<string>();
    for (const a of apps) if (a.cohort) set.add(a.cohort);
    return [...set].sort();
  }
});
