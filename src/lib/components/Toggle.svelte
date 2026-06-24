<script lang="ts">
  let {
    checked = $bindable(false),
    label,
    description
  }: { checked?: boolean; label: string; description?: string } = $props();
</script>

<div class="flex items-start justify-between gap-4 rounded-xl border border-cream-line bg-paper p-4">
  <div>
    <div class="font-display text-base font-semibold text-ink">{label}</div>
    {#if description}<div class="mt-0.5 text-sm text-muted">{description}</div>{/if}
  </div>
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onclick={() => (checked = !checked)}
    class="relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition {checked
      ? 'bg-green'
      : 'bg-cream-line'}"
  >
    <span
      class="absolute top-0.5 size-6 rounded-full bg-white shadow transition-all {checked
        ? 'left-[1.4rem]'
        : 'left-0.5'}"
    ></span>
  </button>
</div>
