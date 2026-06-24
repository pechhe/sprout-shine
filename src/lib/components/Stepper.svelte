<script lang="ts">
  let { steps, current }: { steps: string[]; current: number } = $props();
</script>

<div class="flex items-center gap-2">
  {#each steps as label, i}
    <div class="flex items-center gap-2">
      <div
        class="grid size-7 place-items-center rounded-full font-display text-sm font-semibold transition
          {i < current ? 'bg-green text-paper-3' : i === current ? 'bg-green text-paper-3 ring-4 ring-green/20' : 'bg-cream text-muted'}"
      >
        {#if i < current}✓{:else}{i + 1}{/if}
      </div>
      <span class="hidden text-sm font-semibold sm:inline {i === current ? 'text-ink' : 'text-muted'}"
        >{label}</span
      >
    </div>
    {#if i < steps.length - 1}
      <div class="h-px w-4 bg-cream-line sm:w-8"></div>
    {/if}
  {/each}
</div>
