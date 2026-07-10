<script lang="ts">
  let {
    class: klass = 'size-6',
    title
  }: {
    class?: string;
    title?: string;
  } = $props();
</script>

<svg
  class={klass}
  viewBox="0 0 32 32"
  fill="none"
  role={title ? 'img' : undefined}
  aria-hidden={title ? undefined : 'true'}
  xmlns="http://www.w3.org/2000/svg"
>
  {#if title}<title>{title}</title>{/if}
  <path d="M16 25.5V13.2" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
  <path
    d="M15.4 15.3C10.1 15.5 6.7 12.7 6.4 7.2c5.5-.4 8.8 2.3 9 8.1Z"
    fill="currentColor"
    opacity=".72"
  />
  <path d="M16.5 12.7c.8-5.1 4.2-7.7 9.4-7.1-.3 5.4-3.9 8-9.4 7.1Z" fill="currentColor" />
  <path d="M9.2 26.4c2.1-1.1 4.3-1.6 6.8-1.6 2.6 0 4.9.5 6.9 1.6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
</svg>
