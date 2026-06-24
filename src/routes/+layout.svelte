<script lang="ts">
  import '$lib/styles/app.css';

  let { children } = $props();
</script>

<div class="min-h-screen bg-paper-2 font-sans text-ink antialiased">
  {@render children?.()}
</div>
