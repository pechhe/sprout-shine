<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Logo from '$lib/components/Logo.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import Toggle from '$lib/components/Toggle.svelte';
  import { parentKey, getChildId, setChildId } from '$lib/identity';
  import { getDashboard } from '$lib/remote/parents.remote';
  import { resetTutorStyle } from '$lib/remote/children.remote';
  import { updatePrivacy, requestDeletion } from '$lib/remote/consent.remote';
  import { learnerModel } from '$lib/remote/lesson.remote';

  const coachMap: Record<string, { emoji: string; name: string; role: string }> = {
    willow: { emoji: '🌿', name: 'Willow', role: 'Calm coach' },
    pip: { emoji: '🧩', name: 'Pip', role: 'Puzzle guide' },
    bolt: { emoji: '⚡', name: 'Bolt', role: 'Challenge coach' }
  };

  let loading = $state(true);
  let dash = $state<Awaited<ReturnType<typeof getDashboard>> | null>(null);
  let savingPrivacy = $state(false);
  let privacyMsg = $state<string | null>(null);
  let model = $state<Awaited<ReturnType<typeof learnerModel>> | null>(null);

  const settings = $state({
    saveAudio: false,
    weeklyDigest: true,
    shareWithSchool: false,
    fullTranscriptAccess: false,
    productImprovement: false
  });

  async function load() {
    loading = true;
    dash = await getDashboard(parentKey());
    if (!dash?.child) {
      await goto('/start');
      return;
    }
    if (dash.child._id) setChildId(dash.child._id);
    if (dash.consent?.settings) Object.assign(settings, dash.consent.settings);
    // #10 — read the Learner Model (Skill States + Pattern Signals, decay
    // applied on read). Stays humble: phrases, never scores/diagnoses.
    try {
      model = await learnerModel(dash.child._id);
    } catch {
      model = null;
    }
    loading = false;
  }

  onMount(load);

  const child = $derived(dash?.child ?? null);
  const coach = $derived(child?.tutorStyle ? coachMap[child.tutorStyle] : null);

  async function savePrivacy() {
    if (!child) return;
    savingPrivacy = true;
    privacyMsg = null;
    try {
      await updatePrivacy({ childId: child._id, settings: $state.snapshot(settings) });
      privacyMsg = 'Saved.';
    } catch (e) {
      privacyMsg = e instanceof Error ? e.message : 'Could not save.';
    } finally {
      savingPrivacy = false;
    }
  }

  async function resetCoach() {
    if (!child) return;
    await resetTutorStyle(child._id);
    await goto('/child/onboarding');
  }

  async function deleteData() {
    if (!child) return;
    if (!confirm('Request deletion of all of this child’s data? This cannot be undone.')) return;
    await requestDeletion(child._id);
    await load();
  }
</script>

<svelte:head><title>Parent home · Sprout Shine</title></svelte:head>

<div class="mx-auto max-w-3xl px-5 py-8">
  <div class="flex items-center justify-between">
    <Logo />
    <span class="text-xs font-bold uppercase tracking-widest text-muted">Parent</span>
  </div>

  {#if loading}
    <p class="mt-12 text-center text-muted">Loading…</p>
  {:else if child}
    <!-- Child summary -->
    <Card class="mt-8">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <div class="grid size-14 place-items-center rounded-2xl bg-mint text-2xl">{coach?.emoji ?? '🌱'}</div>
          <div>
            <h1 class="font-display text-2xl font-bold text-ink">{child.nickname}</h1>
            <p class="text-sm text-muted">
              Age {child.age}{child.schoolYear ? ` · ${child.schoolYear}` : ''} · maths {child.mathsConfidence}
            </p>
          </div>
        </div>
        {#if coach}
          <div class="rounded-xl bg-paper px-4 py-2 text-right">
            <div class="font-display font-semibold text-ink">{coach.name}</div>
            <div class="text-xs text-muted">{coach.role}</div>
          </div>
        {/if}
      </div>

      <div class="mt-5 flex flex-wrap gap-3">
        {#if child.onboardedAt}
          <Button variant="primary" onclick={() => goto('/child/lesson')}>Start a session</Button>
          <Button variant="ghost" onclick={resetCoach}>Change coach</Button>
        {:else}
          <Button onclick={() => goto('/child/onboarding')}>Finish child onboarding →</Button>
        {/if}
      </div>
    </Card>

    <!-- #10 Learner Model read surface: a humble "how they seem to be getting on" card.
         Phrases only — never a score or a diagnosis. Stale skills are shown softer,
         pattern signals stay working hypotheses. The weekly digest (#11) will reuse this read. -->
    {#if model && (model.skills.length > 0 || model.patterns.length > 0)}
      <Card class="mt-5">
        <h2 class="font-display text-lg font-semibold text-ink">How {child.nickname} seems to be getting on</h2>
        <p class="mt-1 text-sm text-muted">Built up gently from session evidence — working notes, not a label.</p>

        {#if model.skills.length > 0}
          <ul class="mt-4 grid gap-2">
            {#each model.skills as s}
              <li class="flex items-center justify-between gap-3 rounded-xl bg-paper px-4 py-2">
                <span class="text-sm font-medium text-ink">{s.phrase}</span>
                <span class="text-xs text-muted">
                  {s.stale ? 'worth a gentle re-check soon' : 'recent'}
                </span>
              </li>
            {/each}
          </ul>
        {/if}

        {#if model.patterns.filter((p) => p.level === 'present' && p.phrase).length > 0}
          <h3 class="mt-5 text-sm font-semibold text-ink">How they seem to learn best</h3>
          <ul class="mt-2 grid gap-2">
            {#each model.patterns.filter((p) => p.level === 'present' && p.phrase) as p}
              <li class="text-sm text-muted">· {p.phrase}</li>
            {/each}
          </ul>
        {/if}
      </Card>
    {/if}

    <!-- Weekly digest placeholder -->
    <Card class="mt-5">
      <h2 class="font-display text-lg font-semibold text-ink">This week's learning insight</h2>
      <div class="mt-3 rounded-xl border border-dashed border-cream-line bg-paper p-6 text-center text-muted">
        <div class="text-2xl">🌱</div>
        <p class="mt-2 text-sm">
          Your first weekly digest appears after a few sessions — what improved, what was tricky, and
          one shine moment. Built from evidence, never a transcript dump.
        </p>
      </div>
    </Card>

    <!-- Privacy controls -->
    <Card class="mt-5">
      <h2 class="font-display text-lg font-semibold text-ink">Privacy & data</h2>
      <p class="mt-1 text-sm text-muted">Change any of this any time.</p>
      <div class="mt-4 grid gap-3">
        <Toggle bind:checked={settings.saveAudio} label="Save voice recordings" description="Kept 30 days then deleted." />
        <Toggle bind:checked={settings.weeklyDigest} label="Weekly progress email" />
        <Toggle bind:checked={settings.shareWithSchool} label="Share progress with school" />
        <Toggle bind:checked={settings.fullTranscriptAccess} label="Full transcript access" />
        <Toggle bind:checked={settings.productImprovement} label="Help improve Sprout Shine" />
      </div>
      <div class="mt-4 flex items-center gap-3">
        <Button onclick={savePrivacy} disabled={savingPrivacy}>{savingPrivacy ? 'Saving…' : 'Save changes'}</Button>
        {#if privacyMsg}<span class="text-sm text-muted">{privacyMsg}</span>{/if}
      </div>

      <hr class="my-5 border-cream-line" />
      {#if dash?.consent?.deletionRequestedAt}
        <p class="text-sm font-semibold text-coral">Deletion requested — we'll process this shortly.</p>
      {:else}
        <button class="text-sm font-semibold text-coral hover:underline" onclick={deleteData}>
          Request deletion of {child.nickname}'s data
        </button>
      {/if}
    </Card>
  {/if}
</div>
