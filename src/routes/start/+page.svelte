<script lang="ts">
  import { goto } from '$app/navigation';
  import Logo from '$lib/components/Logo.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import Field from '$lib/components/Field.svelte';
  import Stepper from '$lib/components/Stepper.svelte';
  import { parentKey, setChildId } from '$lib/identity';
  import { confirmGuardian } from '$lib/remote/parents.remote';
  import { saveChildProfile, saveInterview } from '$lib/remote/children.remote';

  let step = $state(0);
  let busy = $state(false);
  let error = $state<string | null>(null);

  const guardian = $state({ name: '', email: '', confirmed: false });
  const profile = $state({
    nickname: '',
    age: '',
    schoolYear: '',
    mathsConfidence: '',
    mainConcern: '',
    enjoys: '',
    frustrations: '',
    preferredTone: ''
  });
  const interview = $state({
    findsEasy: '',
    avoids: '',
    whenStuck: '',
    triedBefore: '',
    wantToUnderstand: ''
  });

  let childId = $state<string | null>(null);

  async function next() {
    error = null;
    busy = true;
    try {
      if (step === 0) {
        if (!guardian.confirmed) {
          error = 'Please confirm you are the parent or guardian.';
          return;
        }
        await confirmGuardian({ parentKey: parentKey(), name: guardian.name, email: guardian.email });
        step = 1;
      } else if (step === 1) {
        const age = Number(profile.age);
        if (!profile.nickname.trim() || !Number.isFinite(age) || age < 4 || age > 16) {
          error = 'A nickname and an age between 4 and 16 are needed.';
          return;
        }
        if (!profile.mathsConfidence) {
          error = 'Please pick a maths confidence level.';
          return;
        }
        const res = await saveChildProfile({
          parentKey: parentKey(),
          nickname: profile.nickname,
          age,
          schoolYear: profile.schoolYear,
          mathsConfidence: profile.mathsConfidence,
          mainConcern: profile.mainConcern,
          enjoys: profile.enjoys,
          frustrations: profile.frustrations,
          preferredTone: profile.preferredTone
        });
        childId = res.childId;
        setChildId(res.childId);
        step = 2;
      } else if (step === 2) {
        if (!childId) {
          error = 'Something went wrong — please go back a step.';
          return;
        }
        await saveInterview({ childId, ...interview });
        await goto('/consent');
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Something went wrong.';
    } finally {
      busy = false;
    }
  }

  function back() {
    error = null;
    if (step > 0) step -= 1;
  }
</script>

<svelte:head><title>Set up · Sprout Shine</title></svelte:head>

<div class="mx-auto max-w-2xl px-5 py-8">
  <div class="flex items-center justify-between">
    <Logo />
    <Stepper steps={['Guardian', 'Child', 'Interview']} current={step} />
  </div>

  <Card class="mt-8">
    {#if step === 0}
      <h1 class="font-display text-2xl font-bold text-ink">First, a quick check</h1>
      <p class="mt-2 text-muted">
        Sprout Shine is set up by a grown-up. We keep child data minimal — a nickname and age are
        enough.
      </p>
      <div class="mt-6 grid gap-5">
        <Field label="Your name">
          <input class="ss-input" bind:value={guardian.name} placeholder="Parent / guardian name" />
        </Field>
        <Field label="Email" hint="Where we send the weekly digest.">
          <input class="ss-input" type="email" bind:value={guardian.email} placeholder="you@example.com" />
        </Field>
        <label class="flex items-start gap-3 rounded-xl border border-cream-line bg-paper p-4">
          <input type="checkbox" class="mt-1 size-5 accent-[#2f9e6f]" bind:checked={guardian.confirmed} />
          <span class="text-sm text-ink-soft">
            I am the child's parent or guardian and I consent to setting up Sprout Shine for them.
          </span>
        </label>
      </div>
    {:else if step === 1}
      <h1 class="font-display text-2xl font-bold text-ink">About your child</h1>
      <p class="mt-2 text-muted">Just enough to make the first session feel personal.</p>
      <div class="mt-6 grid gap-5">
        <div class="grid gap-5 sm:grid-cols-2">
          <Field label="Nickname" required hint="No full name needed.">
            <input class="ss-input" bind:value={profile.nickname} placeholder="e.g. Maya" />
          </Field>
          <Field label="Age" required>
            <input class="ss-input" type="number" min="4" max="16" bind:value={profile.age} placeholder="8" />
          </Field>
        </div>
        <div class="grid gap-5 sm:grid-cols-2">
          <Field label="School year (if known)">
            <input class="ss-input" bind:value={profile.schoolYear} placeholder="e.g. Year 4" />
          </Field>
          <Field label="Maths confidence" required>
            <select class="ss-select" bind:value={profile.mathsConfidence}>
              <option value="">Choose…</option>
              <option value="shaky">A bit shaky</option>
              <option value="mixed">Mixed — good and tricky bits</option>
              <option value="confident">Pretty confident</option>
            </select>
          </Field>
        </div>
        <Field label="Main thing you'd like help with">
          <input class="ss-input" bind:value={profile.mainConcern} placeholder="e.g. times tables, word problems" />
        </Field>
        <div class="grid gap-5 sm:grid-cols-2">
          <Field label="What they enjoy">
            <input class="ss-input" bind:value={profile.enjoys} placeholder="e.g. puzzles, stories" />
          </Field>
          <Field label="What frustrates them">
            <input class="ss-input" bind:value={profile.frustrations} placeholder="e.g. getting stuck, time pressure" />
          </Field>
        </div>
        <Field label="Tutor tone you'd prefer">
          <select class="ss-select" bind:value={profile.preferredTone}>
            <option value="">No preference</option>
            <option value="calm">Calm and gentle</option>
            <option value="playful">Playful and fun</option>
            <option value="energetic">Energetic and challenging</option>
          </select>
        </Field>
      </div>
    {:else}
      <h1 class="font-display text-2xl font-bold text-ink">A short interview</h1>
      <p class="mt-2 text-muted">
        Your answers stay private and help the tutor understand your child from day one.
      </p>
      <div class="mt-6 grid gap-5">
        <Field label="What does your child find easy?">
          <textarea class="ss-textarea" bind:value={interview.findsEasy}></textarea>
        </Field>
        <Field label="What do they tend to avoid?">
          <textarea class="ss-textarea" bind:value={interview.avoids}></textarea>
        </Field>
        <Field label="What happens when they get stuck?">
          <textarea class="ss-textarea" bind:value={interview.whenStuck}></textarea>
        </Field>
        <Field label="What have you already tried?">
          <textarea class="ss-textarea" bind:value={interview.triedBefore}></textarea>
        </Field>
        <Field label="What do you most want to understand?">
          <textarea class="ss-textarea" bind:value={interview.wantToUnderstand}></textarea>
        </Field>
      </div>
    {/if}

    {#if error}
      <p class="mt-5 rounded-lg bg-coral/15 px-4 py-3 text-sm font-semibold text-coral">{error}</p>
    {/if}

    <div class="mt-7 flex items-center justify-between">
      {#if step > 0}
        <Button variant="ghost" onclick={back} disabled={busy}>← Back</Button>
      {:else}
        <span></span>
      {/if}
      <Button onclick={next} disabled={busy}>
        {busy ? 'Saving…' : step === 2 ? 'Save & set privacy →' : 'Continue →'}
      </Button>
    </div>
  </Card>
</div>
