<script lang="ts">
  let {
    checked = $bindable(false),
    label,
    description,
    onChange
  }: { checked?: boolean; label: string; description?: string; onChange?: (checked: boolean) => void } = $props();

  function toggle() {
    checked = !checked;
    onChange?.(checked);
  }
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  data-feedback="select"
  onclick={toggle}
  class="group flex w-full min-h-18 items-start justify-between gap-4 rounded-xl border border-cream-line bg-paper p-4 text-left transition-[border-color,background-color] duration-150 hover:border-green/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-green/60"
>
  <span class="block">
    <span class="block font-display text-base font-semibold text-ink">{label}</span>
    {#if description}<span class="mt-0.5 block text-sm text-muted">{description}</span>{/if}
  </span>
  <span
    aria-hidden="true"
    class="relative -my-2 grid h-11 w-13 shrink-0 place-items-center rounded-full transition-colors duration-200 {checked
      ? 'bg-green'
      : 'bg-cream-line'}"
  >
    <span
      class="size-6 rounded-full bg-paper-3 shadow transition-transform duration-200 {checked
        ? 'translate-x-3'
        : '-translate-x-3'}"
    ></span>
  </span>
</button>
