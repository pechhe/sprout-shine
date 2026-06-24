<script lang="ts">
  import { Plus, RotateCcw, Check, X } from '@lucide/svelte';

  let {
    target,
    onInteract,
    onCheck
  }: {
    target: { rows: number; columns: number };
    onInteract?: (action: string, rows: number[]) => void;
    onCheck?: (rows: number[]) => void;
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
    emit('add_row');
  }
  function removeRow(i: number) {
    rows = rows.filter((_, idx) => idx !== i);
    emit('remove_row');
  }
  function addCounter(i: number) {
    rows = rows.map((r, idx) => (idx === i ? r + 1 : r));
    emit('add_counter');
  }
  function removeCounter(i: number) {
    rows = rows.map((r, idx) => (idx === i && r > 0 ? r - 1 : r));
    emit('remove_counter');
  }
  function reset() {
    rows = [];
    emit('reset');
  }

  const total = $derived(rows.reduce((a, b) => a + b, 0));
</script>

<div>
  <div class="flex items-center justify-between">
    <div class="text-xs font-bold uppercase tracking-widest text-paper-3/60">
      Build an array of rows and columns
    </div>
    <div class="text-xs font-semibold text-paper-3/70">{total} counters</div>
  </div>

  <div class="mt-3 space-y-2">
    {#each rows as count, i}
      <div class="flex items-center gap-2 rounded-xl border border-white/20 bg-white/8 p-2">
        <span class="w-12 shrink-0 text-[0.65rem] font-bold uppercase tracking-wider text-paper-3/50">
          Row {i + 1}
        </span>
        <!-- tap the strip to add a counter; tap a counter to remove it -->
        <button
          onclick={() => addCounter(i)}
          class="flex min-h-10 flex-1 flex-wrap content-center items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1.5"
          aria-label="Add counter to this row"
        >
          {#each Array(count) as _, ci}
            <span
              role="button"
              tabindex="0"
              onclick={(e) => {
                e.stopPropagation();
                removeCounter(i);
              }}
              onkeydown={() => {}}
              class="size-5 rounded-full bg-gold shadow-sm"
            ></span>
          {/each}
        </button>
        <span class="w-5 text-center text-xs font-bold text-paper-3/80">{count}</span>
        <button onclick={() => removeRow(i)} aria-label="Remove row" class="text-paper-3/50 hover:text-paper-3">
          <X class="size-4" />
        </button>
      </div>
    {/each}

    <button
      onclick={addRow}
      class="grid min-h-12 w-full place-items-center rounded-xl border-2 border-dashed border-white/25 text-paper-3/70 hover:bg-white/5"
    >
      <span class="flex items-center gap-1.5 text-xs font-semibold"><Plus class="size-5" /> Add a row</span>
    </button>
  </div>

  <div class="mt-3 flex items-center gap-2">
    <button
      onclick={() => onCheck?.($state.snapshot(rows))}
      disabled={rows.length === 0}
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
  <p class="mt-2 text-xs text-paper-3/50">Add rows, then tap a row to drop counters in. Make every row the same.</p>
</div>
