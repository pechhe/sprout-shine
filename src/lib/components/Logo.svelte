<script lang="ts">
  let { size = 'md' }: { size?: 'sm' | 'md' | 'lg' } = $props();
  const text = $derived({ sm: 'text-base', md: 'text-xl', lg: 'text-2xl' }[size]);
  const leaf = $derived({ sm: 'text-lg', md: 'text-2xl', lg: 'text-3xl' }[size]);
</script>

<span class="inline-flex items-center gap-2 font-display font-semibold text-ink">
  <span class={leaf}>🌿</span>
  <span class={text}>Sprout Shine</span>
</span>
