<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Button from '$lib/components/Button.svelte';
  import { getChildId } from '$lib/identity';
  import { completeOnboarding } from '$lib/remote/children.remote';
  import { Lock, ChevronDown } from '@lucide/svelte';

  const coaches = [
    {
      id: 'willow',
      emoji: '🌿',
      name: 'Calm and steady',
      role: 'TAKE MY TIME',
      blurb: 'Willow gives you thinking time and keeps each step small.'
    },
    {
      id: 'pip',
      emoji: '🧩',
      name: 'Make it a puzzle',
      role: 'LET ME EXPLORE',
      blurb: 'Willow turns questions into little puzzles to crack.'
    },
    {
      id: 'bolt',
      emoji: '⚡',
      name: 'Give me a challenge',
      role: 'KEEP IT MOVING',
      blurb: 'Willow uses quick rounds and an extra challenge when you are ready.'
    }
  ];

  let childId = $state<string | null>(null);
  let tutorStyle = $state('willow');
  const prefs = $state({ pace: 'steady', hints: 'small', likes: 'puzzles' });
  let showParentAnswer = $state(false);
  let busy = $state(false);

  onMount(async () => {
    childId = getChildId();
    if (!childId) await goto('/start');
  });

  async function start() {
    if (!childId) return;
    busy = true;
    try {
      await completeOnboarding({ childId, tutorStyle, prefs: $state.snapshot(prefs) });
      await goto('/child/diagnostic');
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Meet Willow · Sprout Shine</title></svelte:head>

<div class="min-h-screen bg-green">
  <div class="mx-auto max-w-3xl px-5 py-8 text-paper-3">
    <div class="flex items-center justify-between">
      <span class="text-xs font-bold uppercase tracking-widest text-paper-3/70">Meet Willow · 1 of 2</span>
      <span class="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
        <Lock class="size-3.5" /> A grown-up set this up
      </span>
    </div>

    <div class="mt-6 flex items-center gap-3">
      <div class="grid size-12 place-items-center rounded-full bg-paper-3 text-2xl">🌿</div>
      <div>
        <h1 class="font-display text-2xl font-bold">How should Willow help?</h1>
        <p class="text-paper-3/80">Willow is an AI maths helper. Choose what feels good today.</p>
      </div>
    </div>

    <!-- Coaches -->
    <div class="mt-6 grid gap-3">
      {#each coaches as c}
        <button
          type="button"
          onclick={() => (tutorStyle = c.id)}
          aria-pressed={tutorStyle === c.id}
          class="flex min-h-24 items-center gap-4 rounded-2xl border-2 p-4 text-left transition
            {tutorStyle === c.id
            ? 'border-paper-3 bg-white/15'
            : 'border-white/20 bg-white/5 hover:bg-white/10'}"
        >
          <div class="grid size-14 shrink-0 place-items-center rounded-xl bg-paper-3 text-3xl">{c.emoji}</div>
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <span class="font-display text-lg font-bold">{c.name}</span>
              <span class="rounded-full bg-white/20 px-2 py-0.5 text-[0.65rem] font-bold tracking-wider">{c.role}</span>
            </div>
            <p class="text-sm text-paper-3/80">{c.blurb}</p>
          </div>
          <div class="grid size-7 place-items-center rounded-full {tutorStyle === c.id ? 'bg-paper-3 text-green' : 'border-2 border-white/30'}">
            {#if tutorStyle === c.id}✓{/if}
          </div>
        </button>
      {/each}
    </div>

    <!-- Prefs -->
    <div class="mt-6 grid gap-5 rounded-2xl bg-white/10 p-5 sm:grid-cols-3">
      {#snippet group(title: string, options: { v: string; label: string }[], get: () => string, set: (v: string) => void)}
        <div>
          <div class="mb-2 text-xs font-bold uppercase tracking-widest text-paper-3/70">{title}</div>
          <div class="flex flex-wrap gap-2">
            {#each options as o}
              <button
                type="button"
                onclick={() => set(o.v)}
                aria-pressed={get() === o.v}
                class="min-h-11 rounded-full px-4 py-2 text-sm font-semibold transition
                  {get() === o.v ? 'bg-paper-3 text-green-deep' : 'bg-white/10 text-paper-3 hover:bg-white/20'}"
              >
                {o.label}
              </button>
            {/each}
          </div>
        </div>
      {/snippet}

      {@render group(
        'Pace',
        [
          { v: 'steady', label: 'Steady' },
          { v: 'zippy', label: 'Zippy' }
        ],
        () => prefs.pace,
        (v) => (prefs.pace = v)
      )}
      {@render group(
        'Hints',
        [
          { v: 'big', label: 'Big help' },
          { v: 'small', label: 'Small nudge' }
        ],
        () => prefs.hints,
        (v) => (prefs.hints = v)
      )}
      {@render group(
        'I like',
        [
          { v: 'stories', label: 'Stories' },
          { v: 'puzzles', label: 'Puzzles' },
          { v: 'questions', label: 'Just questions' }
        ],
        () => prefs.likes,
        (v) => (prefs.likes = v)
      )}
    </div>

    <!-- Transparency -->
    <div class="mt-6 rounded-2xl bg-white/10 p-5">
      <p class="text-sm text-paper-3/90">
        Willow remembers which maths you practise and what kinds of help work well. Your grown-up gets
        a short learning summary — not every word you say.
      </p>
      <button
        type="button"
        onclick={() => (showParentAnswer = !showParentAnswer)}
        class="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-paper-3 underline-offset-2 hover:underline"
      >
        What do you tell my grown-up?
        <ChevronDown class="size-4 transition {showParentAnswer ? 'rotate-180' : ''}" />
      </button>
      {#if showParentAnswer}
        <p class="mt-2 rounded-xl bg-white/10 p-3 text-sm text-paper-3/90">
          Willow tells them which maths you practised, what got easier, what was tricky, and one
          moment you can feel proud of. Willow will never ask you to keep a secret.
        </p>
      {/if}
    </div>

    <Button class="mt-7 w-full" size="lg" variant="soft" onclick={start} disabled={busy}>
      {busy ? 'Getting ready…' : 'Next: a quick maths check →'}
    </Button>
  </div>
</div>
