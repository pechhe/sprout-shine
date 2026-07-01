<script lang="ts">
  // #12 — per-section feedback affordance. The four model/presentation
  // reactions attach to a section; want_less / want_more attach to the relevant
  // skill/pattern within a section (handled by the caller via targetRef).
  import { ThumbsUp, ThumbsDown, Smile, Frown, Minus, Plus } from '@lucide/svelte';
  import { cn } from '$lib/utils';

  type Reaction =
    | 'sounds_right'
    | "doesn't_sound_right"
    | 'useful'
    | 'not_useful'
    | 'want_less'
    | 'want_more';

  let {
    submitted = new Set<string>(),
    onReact
  }: {
    /** reactions already submitted for this section, e.g. {"sounds_right"} */
    submitted?: Set<string>;
    /** invoked with the chosen reaction */
    onReact: (r: Reaction) => void;
  } = $props();

  // Grouped: model channel (truth-claims), then presentation (surfacing prefs).
  const model: { r: Extract<Reaction, 'sounds_right' | "doesn't_sound_right">; icon: typeof ThumbsUp; label: string }[] = [
    { r: 'sounds_right', icon: ThumbsUp, label: 'Sounds right' },
    { r: "doesn't_sound_right", icon: ThumbsDown, label: "Doesn't sound right" }
  ];
  const presentation: { r: Extract<Reaction, 'useful' | 'not_useful' | 'want_less' | 'want_more'>; icon: typeof ThumbsUp; label: string }[] = [
    { r: 'useful', icon: Smile, label: 'Useful' },
    { r: 'not_useful', icon: Frown, label: 'Not useful' },
    { r: 'want_less', icon: Minus, label: 'Less of this' },
    { r: 'want_more', icon: Plus, label: 'More detail' }
  ];

  function react(r: Reaction) {
    onReact(r);
  }
</script>

<div class="mt-3 flex flex-wrap items-center gap-1">
  {#each model as m (m.r)}
    <button
      class={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition',
        submitted.has(m.r)
          ? 'border-green bg-mint text-green-deep'
          : 'border-cream-line bg-paper text-muted hover:border-green/40 hover:text-ink'
      )}
      onclick={() => react(m.r)}
      title={m.label}
      aria-label={m.label}
    >
      <m.icon class="size-3.5" /><span class="hidden sm:inline">{m.label}</span>
    </button>
  {/each}
  <span class="mx-1 hidden h-4 w-px bg-cream-line sm:inline-block"></span>
  {#each presentation as p (p.r)}
    <button
      class={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition',
        submitted.has(p.r)
          ? 'border-green bg-mint text-green-deep'
          : 'border-cream-line bg-paper text-muted hover:border-green/40 hover:text-ink'
      )}
      onclick={() => react(p.r)}
      title={p.label}
      aria-label={p.label}
    >
      <p.icon class="size-3.5" /><span class="hidden sm:inline">{p.label}</span>
    </button>
  {/each}
</div>
