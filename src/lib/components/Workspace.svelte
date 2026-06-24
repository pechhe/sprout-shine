<script lang="ts">
  import { inspectEqualGroups, type EqualGroupsTarget, type Inspection } from '$lib/lesson/workspace';
  import { Plus, RotateCcw, Check, X } from '@lucide/svelte';

  let {
    target,
    onInteract,
    onCheck
  }: {
    target: EqualGroupsTarget;
    onInteract?: (action: string, groups: number[]) => void;
    onCheck?: (result: Inspection, groups: number[]) => void;
  } = $props();

  // One entry per group = how many counters it holds.
  let groups = $state<number[]>([]);

  // Reset whenever the target changes (new question).
  let lastKey = $state('');
  $effect(() => {
    const key = `${target.groups}x${target.perGroup}`;
    if (key !== lastKey) {
      lastKey = key;
      groups = [];
    }
  });

  function emit(action: string) {
    onInteract?.(action, $state.snapshot(groups));
  }

  function addGroup() {
    groups = [...groups, 0];
    emit('add_group');
  }
  function removeGroup(i: number) {
    groups = groups.filter((_, idx) => idx !== i);
    emit('remove_group');
  }
  function addCounter(i: number) {
    groups = groups.map((g, idx) => (idx === i ? g + 1 : g));
    emit('add_counter');
  }
  function removeCounter(i: number) {
    groups = groups.map((g, idx) => (idx === i && g > 0 ? g - 1 : g));
    emit('remove_counter');
  }
  function reset() {
    groups = [];
    emit('reset');
  }
  function check() {
    const result = inspectEqualGroups($state.snapshot(groups), target);
    onCheck?.(result, $state.snapshot(groups));
  }

  const total = $derived(groups.reduce((a, b) => a + b, 0));
</script>

<div>
  <div class="flex items-center justify-between">
    <div class="text-xs font-bold uppercase tracking-widest text-paper-3/60">
      Make {target.groups} group{target.groups === 1 ? '' : 's'} of {target.perGroup}
    </div>
    <div class="text-xs font-semibold text-paper-3/70">{total} counters</div>
  </div>

  <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
    {#each groups as count, i}
      <div class="rounded-xl border border-white/20 bg-white/8 p-2">
        <div class="flex items-center justify-between">
          <span class="text-[0.65rem] font-bold uppercase tracking-wider text-paper-3/50">
            Group {i + 1}
          </span>
          <button onclick={() => removeGroup(i)} aria-label="Remove group" class="text-paper-3/50 hover:text-paper-3">
            <X class="size-3.5" />
          </button>
        </div>
        <!-- tap the pad to add a counter; tap a counter to remove it -->
        <button
          onclick={() => addCounter(i)}
          class="mt-1 flex min-h-14 w-full flex-wrap content-start gap-1 rounded-lg bg-white/5 p-1.5"
          aria-label="Add counter"
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
              class="size-4 rounded-full bg-gold shadow-sm"
            ></span>
          {/each}
        </button>
        <div class="mt-1 text-center text-xs font-bold text-paper-3/80">{count}</div>
      </div>
    {/each}

    <button
      onclick={addGroup}
      class="grid min-h-[5.5rem] place-items-center rounded-xl border-2 border-dashed border-white/25 text-paper-3/70 hover:bg-white/5"
    >
      <span class="flex flex-col items-center gap-1 text-xs font-semibold">
        <Plus class="size-5" /> Add a group
      </span>
    </button>
  </div>

  <div class="mt-3 flex items-center gap-2">
    <button
      onclick={check}
      disabled={groups.length === 0}
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
    Tap a group to drop in a counter. Tap a counter to take it away.
  </p>
</div>
