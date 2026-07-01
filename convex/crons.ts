// #11 — weekly digest cron. WIRED BUT DISABLED: enabling automatic weekly
// generation is a deliberate flip, tied to the #13 review gate (so digests
// are never auto-shipped unattended before review exists). The registration is
// here so turning it on later is not a retrofit.
//
// To enable: set the `ENABLE_DIGEST_CRON` env var to "1" (and later, gate the
// fan-out behind #13's review status). When disabled this file exports an
// empty cron table, which is a valid no-op.
import { cronJobs } from 'convex/server';
import { api } from './_generated/api';

const crons = cronJobs();

declare const process: { env: Record<string, string | undefined> };

if (process.env.ENABLE_DIGEST_CRON === '1') {
  // Sunday 23:00 UTC — after a full week of sessions, before the parent reads
  // on Monday. Disabled by default for the concierge pilot (manual generate).
  crons.weekly(
    'weekly-digest',
    { dayOfWeek: 'sunday', hourUTC: 23, minuteUTC: 0 },
    api.digests.generateForAllChildren
  );
}

export default crons;
