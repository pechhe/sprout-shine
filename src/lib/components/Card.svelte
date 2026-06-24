<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  let {
    class: klass,
    padded = true,
    children
  }: { class?: string; padded?: boolean; children: Snippet } = $props();
</script>

<div
  class={cn(
    'rounded-[var(--radius-card)] border border-cream-line bg-paper-3 shadow-[var(--shadow-soft)]',
    padded && 'p-6 sm:p-8',
    klass
  )}
>
  {@render children()}
</div>
