<script lang="ts">
  import { Plus, Minus, RotateCcw, Check } from '@lucide/svelte';

  let {
    target,
    onInteract,
    onCheck
  }: {
    target: { parts: number; shaded: number };
    onInteract?: (action: string, state: { parts: number; shaded: number }) => void;
    onCheck?: (state: { parts: number; shaded: number }) => void;
  } = $props();

  // The child's bar: how many equal pieces, and which are coloured in.
  let parts = $state(1);
  let shaded = $state<boolean[]>([false]);

  // Reset whenever the target changes (new task).
  let lastKey = $state('');
  $effect(() => {
    const key = `${target.parts}/${target.shaded}`;
    if (key !== lastKey) {
      lastKey = key;
      parts = 1;
      shaded = [false];
    }
  });

  const shadedCount = $derived(shaded.filter(Boolean).length);

  function emit(action: string) {
    onInteract?.(action, { parts, shaded: shadedCount });
  }
  function setParts(n: number) {
    parts = Math.min(12, Math.max(1, n));
    shaded = Array(parts).fill(false); // re-splitting clears the colouring
    emit('split_bar');
  }
  function toggle(i: number) {
    shaded = shaded.map((s, idx) => (idx === i ? !s : s));
    emit(shaded[i] ? 'shade_piece' : 'unshade_piece');
  }
  function reset() {
    parts = 1;
    shaded = [false];
    emit('reset');
  }
</script>

<div>
  <div class="flex items-center justify-between">
    <div class="text-xs font-bold uppercase tracking-widest text-paper-3/60">
      Split the bar, then colour pieces in
    </div>
    <div class="text-xs font-semibold text-paper-3/70">{shadedCount} of {parts} coloured</div>
  </div>

  <!-- the bar -->
  <div class="mt-3 flex h-16 w-full overflow-hidden rounded-xl border-2 border-paper-3/60">
    {#each shaded as isShaded, i}
      <button
        onclick={() => toggle(i)}
        aria-label={`Piece ${i + 1}${isShaded ? ', coloured' : ''}`}
        class="h-full flex-1 transition-colors {isShaded
          ? 'bg-gold'
          : 'bg-white/8 hover:bg-white/15'} {i > 0 ? 'border-l-2 border-paper-3/60' : ''}"
      ></button>
    {/each}
  </div>

  <!-- split controls -->
  <div class="mt-3 flex items-center gap-2">
    <span class="text-xs font-semibold text-paper-3/70">Pieces:</span>
    <button
      onclick={() => setParts(parts - 1)}
      disabled={parts <= 1}
      aria-label="Fewer pieces"
      class="grid size-8 place-items-center rounded-full bg-white/12 hover:bg-white/20 disabled:opacity-40"
    >
      <Minus class="size-4" />
    </button>
    <span class="w-6 text-center text-sm font-bold">{parts}</span>
    <button
      onclick={() => setParts(parts + 1)}
      disabled={parts >= 12}
      aria-label="More pieces"
      class="grid size-8 place-items-center rounded-full bg-white/12 hover:bg-white/20 disabled:opacity-40"
    >
      <Plus class="size-4" />
    </button>
  </div>

  <div class="mt-3 flex items-center gap-2">
    <button
      onclick={() => onCheck?.({ parts, shaded: shadedCount })}
      disabled={shadedCount === 0}
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
  <p class="mt-2 text-xs text-paper-3/50">
    Use + and − to split the bar into equal pieces. Tap a piece to colour it in.
  </p>
</div>
