import { form, query } from '$app/server';
import { convex } from '$lib/server/convex';
import { api } from '$convex/_generated/api';

// #1 — founder-pilot application form.
export const submitApplication = form('unchecked', async (data: Record<string, string>) => {
  const required = [
    'parentName',
    'email',
    'childAge',
    'mathsExperience',
    'triedBefore',
    'wantToUnderstand',
    'weeklyAvailability',
    'interviewAvailability',
    'willingnessToPay'
  ];
  const missing = required.filter((k) => !data[k]?.trim());
  if (missing.length) {
    return { ok: false as const, error: `Please fill in: ${missing.join(', ')}` };
  }
  const age = Number(data.childAge);
  if (!Number.isFinite(age) || age < 4 || age > 16) {
    return { ok: false as const, error: 'Please enter a child age between 4 and 16.' };
  }

  await convex.mutation(api.applications.submit, {
    parentName: data.parentName.trim(),
    email: data.email.trim(),
    childAge: age,
    mathsExperience: data.mathsExperience.trim(),
    triedBefore: data.triedBefore.trim(),
    wantToUnderstand: data.wantToUnderstand.trim(),
    weeklyAvailability: data.weeklyAvailability.trim(),
    interviewAvailability: data.interviewAvailability.trim(),
    willingnessToPay: data.willingnessToPay.trim(),
    privacyConcerns: data.privacyConcerns?.trim() || undefined
  });

  return { ok: true as const };
});

// Team-facing list (pilot console).
export const listApplications = query(async () => {
  return await convex.query(api.applications.list, {});
});
