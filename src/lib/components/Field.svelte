<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    hint,
    required = false,
    children
  }: { label: string; hint?: string; required?: boolean; children: Snippet } = $props();
</script>

<label class="block">
  <span class="mb-1.5 flex items-center gap-1 font-display text-sm font-semibold text-ink-soft">
    {label}
    {#if required}<span class="text-coral">*</span>{/if}
  </span>
  {@render children()}
  {#if hint}
    <span class="mt-1 block text-xs text-muted">{hint}</span>
  {/if}
</label>
