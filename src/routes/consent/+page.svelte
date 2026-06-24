<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Logo from '$lib/components/Logo.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import Toggle from '$lib/components/Toggle.svelte';
  import { getChildId } from '$lib/identity';
  import { giveConsent } from '$lib/remote/consent.remote';
  import { getDashboard } from '$lib/remote/parents.remote';
  import { parentKey } from '$lib/identity';
  import { MessageCircleHeart } from '@lucide/svelte';

  let childId = $state<string | null>(null);
  let nickname = $state('your child');
  let consented = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);

  // Conservative defaults: only the weekly digest is on.
  const settings = $state({
    saveAudio: false,
    weeklyDigest: true,
    shareWithSchool: false,
    fullTranscriptAccess: false,
    productImprovement: false
  });

  onMount(async () => {
    childId = getChildId();
    if (!childId) {
      await goto('/start');
      return;
    }
    const dash = await getDashboard(parentKey());
    if (dash?.child) nickname = dash.child.nickname;
  });

  async function submit() {
    error = null;
    if (!consented) {
      error = 'Please confirm your consent to continue.';
      return;
    }
    if (!childId) return;
    busy = true;
    try {
      await giveConsent({ childId, settings: $state.snapshot(settings) });
      await goto('/child/onboarding');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Something went wrong.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Consent & privacy · Sprout Shine</title></svelte:head>

<div class="mx-auto max-w-2xl px-5 py-8">
  <Logo />

  <Card class="mt-8">
    <h1 class="font-display text-2xl font-bold text-ink">Set up {nickname}'s account</h1>
    <p class="mt-2 text-muted">You're in control of what Sprout Shine can do. Change any of this any time.</p>

    <div class="mt-5 flex items-start gap-3 rounded-xl bg-blue-soft p-4 text-blue">
      <MessageCircleHeart class="mt-0.5 size-5 shrink-0" />
      <p class="text-sm font-semibold">
        {nickname} will always be told she's talking to an AI helper — never a real person or friend.
      </p>
    </div>

    <div class="mt-6 grid gap-3">
      <Toggle
        bind:checked={settings.saveAudio}
        label="Save voice recordings"
        description="Off by default. If on, kept 30 days for quality, then deleted."
      />
      <Toggle
        bind:checked={settings.weeklyDigest}
        label="Weekly progress email"
        description="A short evidence-based learning digest, Sundays."
      />
      <Toggle
        bind:checked={settings.shareWithSchool}
        label="Share progress with school"
        description="Off until you connect a teacher."
      />
      <Toggle
        bind:checked={settings.fullTranscriptAccess}
        label="Full transcript access"
        description="Off by default. The digest is evidence, not every word said."
      />
      <Toggle
        bind:checked={settings.productImprovement}
        label="Help improve Sprout Shine"
        description="Off unless you opt in. Lets us learn from anonymised sessions."
      />
    </div>

    <label class="mt-5 flex items-start gap-3 rounded-xl border border-cream-line bg-paper p-4">
      <input type="checkbox" class="mt-1 size-5 accent-[#2f9e6f]" bind:checked={consented} />
      <span class="text-sm text-ink-soft">
        I'm {nickname}'s parent or guardian and I consent to her using Sprout Shine under these settings.
      </span>
    </label>

    {#if error}
      <p class="mt-4 rounded-lg bg-coral/15 px-4 py-3 text-sm font-semibold text-coral">{error}</p>
    {/if}

    <Button class="mt-6 w-full" size="lg" onclick={submit} disabled={busy}>
      {busy ? 'Saving…' : 'Continue to onboarding →'}
    </Button>
  </Card>
</div>
