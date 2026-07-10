<script lang="ts">
  import { onMount } from 'svelte';
  import '$lib/styles/app.css';
  import { feedback, type FeedbackCue } from '$lib/feedback.svelte';

  let { children } = $props();

  onMount(() => feedback.initialise());

  function handleFeedback(event: MouseEvent) {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLElement>('[data-feedback]');
    if (!control || !control.closest('[data-feedback-surface]')) return;
    if (control.matches(':disabled') || control.getAttribute('aria-disabled') === 'true') return;

    const cue = control.dataset.feedback;
    if (!cue || cue === 'none') return;
    feedback.play(cue as FeedbackCue);
  }
</script>

<a class="skip-link" href="#main-content">Skip to main content</a>
<div
  id="main-content"
  class="app-shell min-h-screen bg-paper-2 font-sans text-ink antialiased"
  onclick={handleFeedback}
>
  {@render children?.()}
</div>
