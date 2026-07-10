<script lang="ts">
  import { inspectEqualGroups, type EqualGroupsTarget, type Inspection } from '$lib/lesson/workspace';
  import { feedback } from '$lib/feedback.svelte';
  import { Plus, RotateCcw, Check, X } from '@lucide/svelte';

  let {
    target,
    onInteract,
    onCheck,
    celebrate = false
  }: {
    target: EqualGroupsTarget;
    onInteract?: (action: string, groups: number[]) => void;
    onCheck?: (result: Inspection, groups: number[]) => void;
    celebrate?: boolean;
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
    feedback.play('place');
    emit('add_group');
  }
  function removeGroup(i: number) {
    groups = groups.filter((_, idx) => idx !== i);
    feedback.play('remove');
    emit('remove_group');
  }
  function addCounter(i: number) {
    groups = groups.map((g, idx) => (idx === i ? g + 1 : g));
    feedback.play('place');
    emit('add_counter');
  }
  function removeCounter(i: number) {
    groups = groups.map((g, idx) => (idx === i && g > 0 ? g - 1 : g));
    feedback.play('remove');
    emit('remove_counter');
  }
  function reset() {
    groups = [];
    feedback.play('remove');
    emit('reset');
  }
  function check() {
    const result = inspectEqualGroups($state.snapshot(groups), target);
    onCheck?.(result, $state.snapshot(groups));
  }

  const total = $derived(groups.reduce((a, b) => a + b, 0));
</script>

<div class:workspace-success={celebrate} class="workspace-board rounded-[1.35rem] bg-green-deep p-4 text-paper-3 sm:p-5">
  <div class="flex items-center justify-between">
    <div class="text-xs font-bold uppercase tracking-widest text-paper-3/60">
      Make {target.groups} group{target.groups === 1 ? '' : 's'} of {target.perGroup}
    </div>
    <div class="text-xs font-semibold text-paper-3/75" aria-live="polite">
      {#key total}<span class="count-flip">{total}</span>{/key} counters
    </div>
  </div>

  <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {#each groups as count, i}
      <div class="workspace-group rounded-xl border border-white/20 bg-white/8 p-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-paper-3/70">
            Group {i + 1}
          </span>
          <button
            type="button"
            onclick={() => removeGroup(i)}
            aria-label={`Remove group ${i + 1}`}
            class="workspace-button grid size-10 place-items-center rounded-full text-paper-3/60 hover:bg-white/10 hover:text-paper-3"
          >
            <X class="size-4" />
          </button>
        </div>
        <div
          class="mt-1 flex min-h-16 w-full flex-wrap content-start gap-1 rounded-lg bg-white/5 p-1.5"
          role="group"
          aria-label={`Counters in group ${i + 1}`}
        >
          {#each Array(count) as _, ci (ci)}
            <button
              type="button"
              onclick={() => removeCounter(i)}
              class="workspace-button grid size-10 place-items-center rounded-full hover:bg-white/10"
              aria-label={`Remove counter ${ci + 1} from group ${i + 1}`}
            >
              <span class="counter-token size-5 rounded-full bg-gold"></span>
            </button>
          {/each}
          <button
            type="button"
            onclick={() => addCounter(i)}
            class="workspace-button grid size-10 place-items-center rounded-full border border-dashed border-white/35 text-paper-3/80 hover:bg-white/10"
            aria-label={`Add a counter to group ${i + 1}`}
          >
            <Plus class="size-4" />
          </button>
        </div>
        <div class="mt-2 text-center text-xs font-bold text-paper-3/80">{count} in this group</div>
      </div>
    {/each}

    <button
      type="button"
      onclick={addGroup}
      class="workspace-button grid min-h-28 place-items-center rounded-xl border-2 border-dashed border-white/30 text-paper-3/80 hover:bg-white/8"
    >
      <span class="flex flex-col items-center gap-1 text-xs font-semibold">
        <Plus class="size-6" /> {groups.length ? 'Add another group' : 'Add your first group'}
      </span>
    </button>
  </div>

  <div class="mt-3 flex items-center gap-2">
    <button
      data-feedback="tap"
      type="button"
      onclick={check}
      disabled={groups.length === 0}
      class="workspace-button inline-flex min-h-12 items-center gap-1.5 rounded-full bg-paper-3 px-5 py-2 text-sm font-bold text-green disabled:opacity-50"
    >
      <Check class="size-4" /> Check my working
    </button>
    <button
      type="button"
      onclick={reset}
      disabled={groups.length === 0}
      class="workspace-button inline-flex min-h-12 items-center gap-1.5 rounded-full bg-white/12 px-4 py-2 text-sm font-semibold text-paper-3 hover:bg-white/20 disabled:opacity-45"
    >
      <RotateCcw class="size-4" /> Reset
    </button>
  </div>
  <p class="mt-2 text-xs text-paper-3/70">
    Use + to add a counter. Tap a gold counter to take it away.
  </p>
</div>
