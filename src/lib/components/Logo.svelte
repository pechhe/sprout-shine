<script lang="ts">
  import SproutMark from './SproutMark.svelte';

  let { size = 'md' }: { size?: 'sm' | 'md' | 'lg' } = $props();
  const text = $derived({ sm: 'text-base', md: 'text-xl', lg: 'text-2xl' }[size]);
  const mark = $derived({ sm: 'size-5', md: 'size-7', lg: 'size-8' }[size]);
</script>

<span class="logo-lockup inline-flex items-center gap-2 font-display font-semibold text-ink">
  <span class="logo-mark grid place-items-center rounded-full bg-mint text-green-deep">
    <SproutMark class={mark} />
  </span>
  <span class={text}>Sprout Shine</span>
</span>
