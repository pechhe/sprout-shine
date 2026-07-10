<script lang="ts">
  import { feedback } from '$lib/feedback.svelte';
  import { AudioLines, VolumeX } from '@lucide/svelte';

  let { label = true, inverted = false }: { label?: boolean; inverted?: boolean } = $props();
</script>

<button
  type="button"
  class="feedback-toggle {inverted ? 'feedback-toggle-inverted' : ''}"
  aria-label={feedback.soundEnabled ? 'Turn sound effects off' : 'Turn sound effects on'}
  aria-pressed={feedback.soundEnabled}
  data-feedback="none"
  onclick={() => feedback.toggleSound()}
>
  {#if feedback.soundEnabled}<AudioLines class="size-4.5" />{:else}<VolumeX class="size-4.5" />{/if}
  {#if label}<span>Effects {feedback.soundEnabled ? 'on' : 'off'}</span>{/if}
</button>
