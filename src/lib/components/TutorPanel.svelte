<script lang="ts">
  import SproutMark from './SproutMark.svelte';

  let {
    name = 'Willow',
    text,
    status,
    speaking = false,
    error = null,
    onRetry
  }: {
    name?: string;
    text: string;
    status: string;
    speaking?: boolean;
    error?: string | null;
    onRetry?: () => void | Promise<void>;
  } = $props();
</script>

<section class="tutor-panel" aria-label={`${name}, your maths coach`}>
  <div class="tutor-avatar" class:speaking aria-hidden="true">
    <SproutMark class="size-8" />
  </div>
  <div class="min-w-0 flex-1">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <h2 class="font-display text-lg font-bold text-ink">{name}</h2>
      <div class="tutor-status" aria-live="polite">
        <span class:talking={speaking} class="tutor-status-dot">
          <i></i><i></i><i></i>
        </span>
        {status}
      </div>
    </div>
    {#key text}
      <p class="tutor-caption mt-2 font-display text-xl font-medium leading-snug text-ink sm:text-2xl" aria-live="polite">
        {text}
      </p>
    {/key}
    {#if error}
      <div class="mt-3 rounded-xl bg-coral-soft px-3 py-3 text-sm text-coral-deep" role="alert">
        <p class="font-semibold">Willow could not connect. Check microphone access, then try again.</p>
        <p class="mt-1 text-xs">{error}</p>
        {#if onRetry}
          <button
            type="button"
            class="mt-2 min-h-10 rounded-full bg-coral-deep px-4 font-bold text-paper-3 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-coral/50"
            onclick={onRetry}
          >
            Try connecting again
          </button>
        {/if}
      </div>
    {/if}
  </div>
</section>
