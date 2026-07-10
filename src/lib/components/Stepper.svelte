<script lang="ts">
  let { steps, current }: { steps: string[]; current: number } = $props();
</script>

<div
  class="flex items-center gap-2"
  role="progressbar"
  aria-label={`Set-up progress: step ${current + 1} of ${steps.length}, ${steps[current]}`}
  aria-valuemin="1"
  aria-valuemax={steps.length}
  aria-valuenow={current + 1}
>
  {#each steps as label, i}
    <div class="flex items-center gap-2">
      <div
        class="stepper-dot grid size-7 place-items-center rounded-full font-display text-sm font-semibold
          {i < current ? 'bg-green text-paper-3' : i === current ? 'bg-green text-paper-3 ring-4 ring-green/20' : 'bg-cream text-muted'}"
      >
        {#if i < current}<span class="stepper-check">✓</span>{:else}{i + 1}{/if}
      </div>
      <span class="hidden text-sm font-semibold sm:inline {i === current ? 'text-ink' : 'text-muted'}"
        >{label}</span
      >
    </div>
    {#if i < steps.length - 1}
      <div class="stepper-connector w-4 sm:w-8" aria-hidden="true">
        <span class:complete={i < current}></span>
      </div>
    {/if}
  {/each}
</div>
