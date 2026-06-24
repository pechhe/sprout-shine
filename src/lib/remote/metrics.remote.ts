import { query } from '$app/server';
import { convex } from '$lib/server/convex';
import { api } from '$convex/_generated/api';

// #15 — read-only pilot metrics dashboard. Pure aggregation over the existing
// ledger + consent records; no writes come from this surface.
export const getMetrics = query('unchecked', async (cohort?: string) =>
  await convex.query(api.metrics.dashboard, { cohort })
);

export const getCohorts = query(async () =>
  await convex.query(api.metrics.cohorts, {})
);
