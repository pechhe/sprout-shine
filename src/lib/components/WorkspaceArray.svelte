<script lang="ts">
  import { feedback } from '$lib/feedback.svelte';
  import { Plus, RotateCcw, Check, X } from '@lucide/svelte';

  let {
    target,
    onInteract,
    onCheck,
    celebrate = false
  }: {
    target: { rows: number; columns: number };
    onInteract?: (action: string, rows: number[]) => void;
    onCheck?: (rows: number[]) => void;
    celebrate?: boolean;
  } = $props();

  // One entry per row = how many counters are in that row.
  let rows = $state<number[]>([]);

  // Reset whenever the target changes (new task).
  let lastKey = $state('');
  $effect(() => {
    const key = `${target.rows}x${target.columns}`;
    if (key !== lastKey) {
      lastKey = key;
      rows = [];
    }
  });

  function emit(action: string) {
    onInteract?.(action, $state.snapshot(rows));
  }
  function addRow() {
    rows = [...rows, 0];
    feedback.play('place');
    emit('add_row');
  }
  function removeRow(i: number) {
    rows = rows.filter((_, idx) => idx !== i);
    feedback.play('remove');
    emit('remove_row');
  }
  function addCounter(i: number) {
    rows = rows.map((r, idx) => (idx === i ? r + 1 : r));
    feedback.play('place');
    emit('add_counter');
  }
  function removeCounter(i: number) {
    rows = rows.map((r, idx) => (idx === i && r > 0 ? r - 1 : r));
    feedback.play('remove');
    emit('remove_counter');
  }
  function reset() {
    rows = [];
    feedback.play('remove');
    emit('reset');
  }

  const total = $derived(rows.reduce((a, b) => a + b, 0));
</script>

<div class:workspace-success={celebrate} class="workspace-board rounded-[1.35rem] bg-green-deep p-4 text-paper-3 sm:p-5">
  <div class="flex items-center justify-between">
    <div class="text-xs font-bold uppercase tracking-widest text-paper-3/60">
      Build an array of rows and columns
    </div>
    <div class="text-xs font-semibold text-paper-3/75" aria-live="polite">
      {#key total}<span class="count-flip">{total}</span>{/key} counters
    </div>
  </div>

  <div class="mt-3 space-y-2">
    {#each rows as count, i}
      <div class="workspace-row flex flex-wrap items-center gap-2 rounded-xl border border-white/20 bg-white/8 p-2.5 sm:flex-nowrap">
        <span class="w-12 shrink-0 text-xs font-bold uppercase tracking-wider text-paper-3/70">
          Row {i + 1}
        </span>
        <div
          class="order-3 flex min-h-12 w-full flex-1 flex-wrap content-center items-center gap-1 rounded-lg bg-white/5 px-2 py-1 sm:order-none sm:w-auto"
          role="group"
          aria-label={`Counters in row ${i + 1}`}
        >
          {#each Array(count) as _, ci (ci)}
            <button
              type="button"
              onclick={() => removeCounter(i)}
              class="workspace-button grid size-9 place-items-center rounded-full hover:bg-white/10"
              aria-label={`Remove counter ${ci + 1} from row ${i + 1}`}
            >
              <span class="counter-token size-5 rounded-full bg-gold"></span>
            </button>
          {/each}
          <button
            type="button"
            onclick={() => addCounter(i)}
            class="workspace-button grid size-9 place-items-center rounded-full border border-dashed border-white/35 text-paper-3/80 hover:bg-white/10"
            aria-label={`Add a counter to row ${i + 1}`}
          >
            <Plus class="size-4" />
          </button>
        </div>
        <span class="w-5 text-center text-xs font-bold text-paper-3/80">{count}</span>
        <button
          type="button"
          onclick={() => removeRow(i)}
          aria-label={`Remove row ${i + 1}`}
          class="workspace-button grid size-10 place-items-center rounded-full text-paper-3/60 hover:bg-white/10 hover:text-paper-3"
        >
          <X class="size-4" />
        </button>
      </div>
    {/each}

    <button
      type="button"
      onclick={addRow}
      class="workspace-button grid min-h-14 w-full place-items-center rounded-xl border-2 border-dashed border-white/30 text-paper-3/80 hover:bg-white/8"
    >
      <span class="flex items-center gap-1.5 text-xs font-semibold">
        <Plus class="size-5" /> {rows.length ? 'Add another row' : 'Add your first row'}
      </span>
    </button>
  </div>

  <div class="mt-3 flex items-center gap-2">
    <button
      data-feedback="tap"
      type="button"
      onclick={() => onCheck?.($state.snapshot(rows))}
      disabled={rows.length === 0}
      class="workspace-button inline-flex min-h-12 items-center gap-1.5 rounded-full bg-paper-3 px-5 py-2 text-sm font-bold text-green disabled:opacity-50"
    >
      <Check class="size-4" /> Check my working
    </button>
    <button
      type="button"
      onclick={reset}
      disabled={rows.length === 0}
      class="workspace-button inline-flex min-h-12 items-center gap-1.5 rounded-full bg-white/12 px-4 py-2 text-sm font-semibold text-paper-3 hover:bg-white/20 disabled:opacity-45"
    >
      <RotateCcw class="size-4" /> Reset
    </button>
  </div>
  <p class="mt-2 text-xs text-paper-3/60">Add rows, then use + to add counters. Make every row the same.</p>
</div>
