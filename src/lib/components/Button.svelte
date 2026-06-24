<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils';

  type Variant = 'primary' | 'soft' | 'ghost' | 'blue';
  type Size = 'md' | 'lg';

  let {
    variant = 'primary',
    size = 'md',
    class: klass,
    children,
    ...rest
  }: HTMLButtonAttributes & { variant?: Variant; size?: Size; children: Snippet } = $props();

  const base =
    'inline-flex items-center justify-center gap-2 rounded-full font-display font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green/40';
  const variants: Record<Variant, string> = {
    primary: 'bg-green text-paper-3 hover:bg-green-deep shadow-[0_8px_20px_rgba(47,158,111,0.28)]',
    blue: 'bg-blue text-white hover:brightness-95 shadow-[0_8px_20px_rgba(58,134,214,0.28)]',
    soft: 'bg-mint text-green-deep hover:bg-mint-2',
    ghost: 'bg-transparent text-ink hover:bg-cream'
  };
  const sizes: Record<Size, string> = {
    md: 'h-11 px-5 text-[0.95rem]',
    lg: 'h-13 px-7 text-base'
  };
</script>

<button class={cn(base, variants[variant], sizes[size], klass)} {...rest}>
  {@render children()}
</button>
