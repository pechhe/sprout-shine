<script lang="ts">
  import { RotateCcw, Check } from '@lucide/svelte';

  let {
    target,
    onInteract,
    onCheck
  }: {
    target: { min: number; max: number; step: number; answer: number };
    onInteract?: (action: string, value: number | null) => void;
    onCheck?: (value: number | null) => void;
  } = $props();

  // The child's marker position (a tick value), or null if not placed yet.
  let value = $state<number | null>(null);

  // Reset whenever the target changes (new task).
  let lastKey = $state('');
  $effect(() => {
    const key = `${target.min}-${target.max}-${target.step}-${target.answer}`;
    if (key !== lastKey) {
      lastKey = key;
      value = null;
    }
  });

  const ticks = $derived.by(() => {
    const out: number[] = [];
    for (let t = target.min; t <= target.max + 1e-9; t += target.step) {
      out.push(Math.round(t * 1e6) / 1e6);
    }
    return out;
  });

  // Label whole numbers always; label every tick when the line is short.
  const labelAll = $derived(ticks.length <= 11);

  function fmt(n: number): string {
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  }

  function place(t: number) {
    value = value === t ? null : t;
    onInteract?.(value === null ? 'remove_marker' : 'place_marker', value);
  }
  function reset() {
    value = null;
    onInteract?.('reset', null);
  }
</script>

<div>
  <div class="flex items-center justify-between">
    <div class="text-xs font-bold uppercase tracking-widest text-paper-3/60">
      Tap the number line to place your marker
    </div>
    {#if value !== null}
      <div class="text-xs font-semibold text-paper-3/70">Marker at {fmt(value)}</div>
    {/if}
  </div>

  <div class="mt-4 rounded-xl border border-white/20 bg-white/8 px-4 pb-2 pt-8">
    <div class="relative">
      <!-- the line -->
      <div class="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-paper-3/50"></div>
      <div class="relative flex items-center justify-between">
        {#each ticks as t}
          <button
            onclick={() => place(t)}
            aria-label={`Place marker at ${fmt(t)}`}
            class="group relative flex h-12 w-6 flex-col items-center justify-center"
          >
            <!-- marker -->
            {#if value === t}
              <span class="absolute -top-5 text-xl leading-none">📍</span>
            {/if}
            <!-- tick -->
            <span
              class="h-4 w-0.5 rounded {Number.isInteger(t)
                ? 'bg-paper-3/80'
                : 'bg-paper-3/40'} group-hover:bg-gold"
            ></span>
            <!-- label -->
            <span class="mt-1 text-[0.65rem] font-bold text-paper-3/70">
              {labelAll || Number.isInteger(t) ? fmt(t) : ''}
            </span>
          </button>
        {/each}
      </div>
    </div>
  </div>

  <div class="mt-3 flex items-center gap-2">
    <button
      onclick={() => onCheck?.(value)}
      disabled={value === null}
      class="inline-flex items-center gap-1.5 rounded-full bg-paper-3 px-4 py-2 text-sm font-bold text-green disabled:opacity-50"
    >
      <Check class="size-4" /> Check my working
    </button>
    <button
      onclick={reset}
      class="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-2 text-sm font-semibold text-paper-3 hover:bg-white/20"
    >
      <RotateCcw class="size-4" /> Reset
    </button>
  </div>
  <p class="mt-2 text-xs text-paper-3/50">Tap a tick to put your marker there. Tap it again to pick it up.</p>
</div>
