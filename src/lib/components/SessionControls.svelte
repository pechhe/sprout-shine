<script lang="ts">
  import { Headphones, Keyboard, Lightbulb, Mic, MicOff, Send, X } from '@lucide/svelte';

  type Action = () => void | Promise<void>;
  type SendText = (text: string) => void | Promise<void>;

  let {
    muted,
    disabled = false,
    onHelp,
    onRepeat,
    onMute,
    onFinish,
    onSendText
  }: {
    muted: boolean;
    disabled?: boolean;
    onHelp: Action;
    onRepeat: Action;
    onMute: Action;
    onFinish: Action;
    onSendText: SendText;
  } = $props();

  let showTyping = $state(false);
  let confirmFinish = $state(false);
  let typed = $state('');

  async function send() {
    const value = typed.trim();
    if (!value) return;
    typed = '';
    await onSendText(value);
  }
</script>

<aside class="session-controls" aria-label="Lesson controls">
  <div class="flex flex-wrap items-center gap-2">
    <button data-feedback="hint" class="child-action child-action-help" type="button" onclick={onHelp} {disabled}>
      <Lightbulb class="size-5" /> I need a hint
    </button>
    <button data-feedback="tap" class="child-action" type="button" onclick={onRepeat} {disabled}>
      <Headphones class="size-5" /> Say that again
    </button>
    <button data-feedback="select" class="child-action" type="button" onclick={onMute} {disabled}>
      {#if muted}<MicOff class="size-5" /> Turn mic on{:else}<Mic class="size-5" /> Mute mic{/if}
    </button>
    <button
      data-feedback="select"
      class="child-action"
      class:active={showTyping}
      type="button"
      aria-expanded={showTyping}
      onclick={() => (showTyping = !showTyping)}
      {disabled}
    >
      <Keyboard class="size-5" /> Type instead
    </button>
    <button
      class="ml-auto min-h-11 px-2 text-sm font-bold text-muted underline-offset-4 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green"
      type="button"
      onclick={() => (confirmFinish = true)}
    >
      Finish for today
    </button>
  </div>

  <div class:open={showTyping} class="session-disclosure" aria-hidden={!showTyping} inert={!showTyping}>
    <div>
      <form class="mt-3 flex items-center gap-2" onsubmit={(event) => { event.preventDefault(); send(); }}>
        <label for="child-reply" class="sr-only">Type what you want to say to Willow</label>
        <input
          id="child-reply"
          class="ss-input min-h-12 flex-1 bg-paper-3"
          bind:value={typed}
          placeholder="Type what you want to say…"
          autocomplete="off"
        />
        <button
          data-feedback="tap"
          type="submit"
          class="grid size-12 shrink-0 place-items-center rounded-full bg-green text-paper-3 transition-transform hover:bg-green-deep active:scale-95 disabled:opacity-50"
          disabled={!typed.trim()}
          aria-label="Send to Willow"
        >
          <Send class="size-5" />
        </button>
      </form>
    </div>
  </div>

  <div class:open={confirmFinish} class="session-disclosure" aria-hidden={!confirmFinish} inert={!confirmFinish}>
    <div>
      <div class="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-paper-2 px-4 py-3" role="alert">
        <span class="font-display text-sm font-semibold text-ink">Finish this session now?</span>
        <button data-feedback="select" class="child-action min-h-10" type="button" onclick={() => (confirmFinish = false)}>
          <X class="size-4" /> Keep going
        </button>
        <button data-feedback="tap" class="min-h-10 rounded-full bg-ink px-4 text-sm font-bold text-paper-3" type="button" onclick={onFinish}>
          Finish session
        </button>
      </div>
    </div>
  </div>
</aside>
