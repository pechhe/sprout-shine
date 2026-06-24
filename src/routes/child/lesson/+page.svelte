<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import Button from '$lib/components/Button.svelte';
  import { getChildId } from '$lib/identity';
  import { startSession, recordEvent, endSession } from '$lib/remote/sessions.remote';
  import { VoiceController } from '$lib/voice.svelte';
  import { checkGuardrails } from '$lib/guardrails';
  import { shellLesson, parseNumber } from '$lib/lesson/shellLesson';
  import { Repeat2, Mic, Volume2, VolumeX, Send, Check } from '@lucide/svelte';

  type Line = { role: 'tutor' | 'child'; text: string; kind?: string };

  const voice = new VoiceController();

  let childId = $state<string | null>(null);
  let sessionId = $state<string | null>(null);
  let phase = $state<'loading' | 'intro' | 'awaiting' | 'done'>('loading');
  let qIndex = $state(0);
  let attempts = $state(0);
  let transcript = $state<Line[]>([]);
  let lastQuestion = $state('');
  let typed = $state('');
  let starting = $state(true);

  const current = $derived(shellLesson.questions[qIndex] ?? null);
  const statusLabel = $derived(
    voice.state === 'speaking'
      ? 'Willow is speaking'
      : voice.state === 'listening'
        ? 'Listening…'
        : phase === 'done'
          ? 'All done'
          : 'Your turn'
  );

  async function logEvent(type: string, role?: 'tutor' | 'child', text?: string, meta?: unknown) {
    if (!sessionId || !childId) return;
    try {
      await recordEvent({ sessionId, childId, type, role, text, meta });
    } catch {
      /* non-blocking */
    }
  }

  // Tutor speaks a line; optionally listen for an answer afterwards.
  async function tutorSay(text: string, opts: { kind?: string; expectAnswer?: boolean } = {}) {
    transcript = [...transcript, { role: 'tutor', text, kind: opts.kind }];
    await logEvent(opts.kind ?? 'tutor_turn', 'tutor', text);
    await voice.speak(text);
    if (opts.expectAnswer) {
      phase = 'awaiting';
      autoListen();
    }
  }

  function autoListen() {
    if (!voice.supportsSTT || voice.muted) return;
    voice.listen().then((heard) => {
      if (heard && phase === 'awaiting') processChild(heard);
    });
  }

  async function askCurrent() {
    attempts = 0;
    const q = shellLesson.questions[qIndex];
    lastQuestion = q.prompt;
    await tutorSay(q.prompt, { expectAnswer: true });
  }

  async function processChild(raw: string) {
    const text = raw.trim();
    if (!text) return;
    voice.stopListening();
    transcript = [...transcript, { role: 'child', text }];
    await logEvent('child_turn', 'child', text);

    // 1. Guardrails first.
    const guard = checkGuardrails(text);
    if (guard.category) {
      await logEvent('guardrail', undefined, text, { category: guard.category });
      await tutorSay(guard.response!, { kind: 'guardrail', expectAnswer: true });
      return;
    }

    // 2. Repeat request.
    if (/\b(repeat|say (that|it) again|again please|what was (it|that))\b/.test(text.toLowerCase())) {
      await logEvent('repeat');
      await tutorSay(lastQuestion, { kind: 'repeat', expectAnswer: true });
      return;
    }

    // 3. Answer checking (lesson context only).
    const q = shellLesson.questions[qIndex];
    const num = parseNumber(text);
    if (num === null) {
      await tutorSay("Let's stay with the maths — " + q.prompt, { expectAnswer: true });
      return;
    }
    if (num === q.answer) {
      await tutorSay(praise(), { expectAnswer: false });
      await advance();
    } else {
      attempts += 1;
      if (attempts < 2) {
        await tutorSay(`Not quite — have another go. ${q.prompt}`, { expectAnswer: true });
      } else {
        await tutorSay(`Good try. ${q.expr} is ${q.answer}. Let's keep going.`, {
          expectAnswer: false
        });
        await advance();
      }
    }
  }

  function praise() {
    const p = ['Yes — spot on!', 'Nice work!', "That's it!", 'Lovely.'];
    return p[Math.floor(Math.random() * p.length)];
  }

  async function advance() {
    if (qIndex < shellLesson.questions.length - 1) {
      qIndex += 1;
      await askCurrent();
    } else {
      phase = 'done';
      await tutorSay(shellLesson.outro, { expectAnswer: false });
      if (sessionId) await endSession(sessionId);
    }
  }

  function submitTyped() {
    const t = typed.trim();
    if (!t) return;
    typed = '';
    processChild(t);
  }

  async function repeat() {
    if (phase !== 'awaiting') return;
    await logEvent('repeat');
    await tutorSay(lastQuestion, { kind: 'repeat', expectAnswer: true });
  }

  function toggleMute() {
    voice.muted = !voice.muted;
    if (voice.muted) voice.stopListening();
  }

  async function finish() {
    if (sessionId && phase !== 'done') await endSession(sessionId);
    voice.shutdown();
    await goto('/dashboard');
  }

  onMount(async () => {
    childId = getChildId();
    if (!childId) {
      await goto('/start');
      return;
    }
    const mode = voice.supportsSTT ? 'voice' : 'text';
    const res = await startSession({ childId, lessonId: shellLesson.id, mode });
    sessionId = res.sessionId;
    starting = false;
    phase = 'intro';
    await tutorSay(shellLesson.intro, { expectAnswer: false });
    await askCurrent();
  });

  onDestroy(() => voice.shutdown());
</script>

<svelte:head><title>{shellLesson.title} · Sprout Shine</title></svelte:head>

<div class="min-h-screen bg-green">
  <div class="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-6 text-paper-3">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <span class="text-xs font-bold uppercase tracking-widest text-paper-3/70">Child · Lesson</span>
      <span class="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{shellLesson.title}</span>
    </div>

    <!-- Status + tutor bubble -->
    <div class="mt-6 flex items-center gap-3">
      <div class="grid size-12 place-items-center rounded-full bg-paper-3 text-2xl">🌿</div>
      <div class="flex items-center gap-2">
        <span class="flex size-2.5">
          <span
            class="size-2.5 rounded-full {voice.state === 'listening'
              ? 'animate-ping bg-gold'
              : voice.state === 'speaking'
                ? 'animate-pulse bg-paper-3'
                : 'bg-paper-3/40'}"
          ></span>
        </span>
        <span class="text-sm font-bold uppercase tracking-wide text-paper-3/90">{statusLabel}</span>
      </div>
    </div>

    <div class="mt-4 rounded-2xl bg-white/12 p-5">
      <p class="font-hand text-2xl leading-snug">
        {#if starting}Getting ready…{:else}{transcript.filter((l) => l.role === 'tutor').at(-1)?.text ?? '…'}{/if}
      </p>
      {#if voice.partial}
        <p class="mt-2 text-sm italic text-paper-3/70">“{voice.partial}”</p>
      {/if}
    </div>

    <!-- Workbook placeholder (visual workspace lands in #6) -->
    <div class="mt-4 rounded-2xl border border-white/20 bg-white/5 p-5">
      <div class="text-xs font-bold uppercase tracking-widest text-paper-3/60">Your workbook</div>
      {#if current && phase !== 'done'}
        <div class="mt-2 font-display text-3xl font-bold">{current.expr} = ?</div>
        <p class="mt-2 text-sm text-paper-3/60">A visual space to show your working is coming soon.</p>
      {:else}
        <div class="mt-2 font-display text-2xl font-bold">🎉 Lesson complete</div>
      {/if}
    </div>

    <!-- Transcript -->
    <div class="mt-4 flex-1 space-y-2 overflow-y-auto">
      {#each transcript as line}
        <div class="flex {line.role === 'child' ? 'justify-end' : 'justify-start'}">
          <div
            class="max-w-[80%] rounded-2xl px-3.5 py-2 text-sm
              {line.role === 'child'
              ? 'bg-paper-3 text-ink'
              : line.kind === 'guardrail'
                ? 'bg-gold/25 text-paper-3'
                : 'bg-white/12 text-paper-3'}"
          >
            {line.text}
          </div>
        </div>
      {/each}
    </div>

    <!-- Controls -->
    <div class="mt-4 space-y-3">
      {#if !voice.supportsSTT}
        <p class="rounded-lg bg-white/10 px-3 py-2 text-center text-xs text-paper-3/80">
          Voice input isn't available in this browser — type your answers below.
        </p>
      {/if}

      {#if phase === 'done'}
        <Button class="w-full" size="lg" variant="soft" onclick={finish}>I'm done 🎉</Button>
      {:else}
        <div class="flex flex-wrap items-center gap-2">
          <button
            onclick={repeat}
            class="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-2 text-sm font-semibold hover:bg-white/20"
          >
            <Repeat2 class="size-4" /> Repeat
          </button>
          <button
            onclick={toggleMute}
            class="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-2 text-sm font-semibold hover:bg-white/20"
          >
            {#if voice.muted}<VolumeX class="size-4" /> Unmute{:else}<Volume2 class="size-4" /> Mute{/if}
          </button>
          {#if voice.supportsSTT}
            <button
              onclick={autoListen}
              disabled={voice.state !== 'idle'}
              class="inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-2 text-sm font-bold text-gold-deep disabled:opacity-50"
            >
              <Mic class="size-4" /> Speak
            </button>
          {/if}
        </div>

        <form
          onsubmit={(e) => {
            e.preventDefault();
            submitTyped();
          }}
          class="flex items-center gap-2"
        >
          <input
            bind:value={typed}
            placeholder="Type your answer…"
            class="flex-1 rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-paper-3 placeholder:text-paper-3/50 focus:outline-none focus:ring-2 focus:ring-paper-3/40"
          />
          <button
            type="submit"
            class="grid size-11 place-items-center rounded-full bg-paper-3 text-green"
            aria-label="Send"
          >
            <Send class="size-5" />
          </button>
        </form>

        <button
          onclick={finish}
          class="inline-flex items-center gap-1.5 text-sm font-semibold text-paper-3/70 hover:text-paper-3"
        >
          <Check class="size-4" /> Done for now
        </button>
      {/if}
    </div>
  </div>
</div>
