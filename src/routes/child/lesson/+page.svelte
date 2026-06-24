<script lang="ts">
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import Button from '$lib/components/Button.svelte';
  import WorkspaceArray from '$lib/components/WorkspaceArray.svelte';
  import Workspace from '$lib/components/Workspace.svelte';
  import { getChildId } from '$lib/identity';
  import { RealtimeSession } from '$lib/realtime.svelte';
  import { checkGuardrails } from '$lib/guardrails';
  import { recordEvent } from '$lib/remote/sessions.remote';
  import {
    startQueuedLesson,
    realtimeToken,
    requestHint,
    recordAttempt,
    advancePhase,
    tagMisconception,
    endLesson
  } from '$lib/remote/lesson.remote';
  import { Volume2, VolumeX, Lightbulb } from '@lucide/svelte';

  let childId = $state<string | null>(null);
  let sessionId = $state<string | null>(null);
  let lesson = $state<any>(null);
  let started = $state(false);
  let connecting = $state(false);
  let currentHint = $state('');
  let lastVerdict = $state<string | null>(null);
  let finishing = $state(false);

  // Tool calls from the model are routed to the engine, which validates each one.
  const realtime = new RealtimeSession(async (name, args) => {
    if (!sessionId) return { ok: false, reason: 'no session' };
    switch (name) {
      case 'request_hint': {
        const r = await requestHint(sessionId);
        if (r.ok) currentHint = r.hint ?? '';
        return r;
      }
      case 'advance_phase': {
        const r = await advancePhase(sessionId);
        if (r.ok && r.done) {
          await finish();
          return { ok: true, done: true };
        }
        if (r.ok) {
          lesson = r;
          currentHint = '';
          lastVerdict = null;
        }
        return r;
      }
      case 'tag_misconception':
        return await tagMisconception({ sessionId, tag: String(args.tag ?? '') });
      case 'end_lesson':
        await finish();
        return { ok: true };
      default:
        return { ok: false, reason: 'unknown tool' };
    }
  }, (childText) => {
    // Deterministic safety: redirect off-topic/sensitive talk; never engage it.
    const guard = checkGuardrails(childText);
    if (!guard.category || !sessionId || !childId) return;
    recordEvent({ sessionId, childId, type: 'guardrail', text: childText, meta: { category: guard.category } });
    realtime.pushVerdict(
      `SAFETY: the child said something in the "${guard.category}" category. Do not engage with it or repeat it. Gently say: "${guard.response}" then return to the lesson.`
    );
  });

  async function begin() {
    childId = getChildId();
    if (!childId) {
      await goto('/start');
      return;
    }
    connecting = true;
    try {
      // #14 — start against the pre-warmed, validated plan (or strand anchor
      // fallback). No synchronous generation; the plan was pre-warmed at the
      // prior session-end / diagnostic-end.
      const res = await startQueuedLesson({ childId });
      sessionId = res.sessionId;
      lesson = res;
      started = true;
      await realtime.connect(() => realtimeToken(sessionId!));
    } finally {
      connecting = false;
    }
  }

  // Child solved (or attempted) the task in the workspace. The engine grades it
  // deterministically; we feed the verdict to the model to react to.
  async function handleCheck(rows: number[]) {
    if (!sessionId) return;
    const r = await recordAttempt({ sessionId, attempt: { kind: 'array', rows } });
    lesson = { ...lesson, attempts: r.attempts, taskResolved: r.resolved };
    lastVerdict = r.verdict ?? null;
    currentHint = ''; // verdict clears any stale hint
    const parts = [
      `The child built rows with [${rows.join(', ')}] counters.`,
      `The app checked it: verdict is "${r.verdict}".`,
      r.misconception ? `Likely misconception: ${r.misconception}.` : '',
      r.resolved ? 'This task is now resolved.' : 'They can try again.',
      r.forcedWorkedStep
        ? 'They have used all their tries — gently walk through the worked step, then move on.'
        : '',
      r.coachInstruction ? `Coaching: ${r.coachInstruction}` : '',
      'Respond warmly in one short turn.'
    ].filter(Boolean);
    realtime.pushVerdict(parts.join(' '));
  }

  // #8 — child asks for help. The engine decides whether to give a small nudge
  // first or serve the next hint; the model follows the returned coaching move.
  async function askForHelp() {
    if (!sessionId) return;
    const r = await requestHint(sessionId);
    if (!r.ok) return;
    if (r.hint) currentHint = r.hint;
    const parts = [
      'The child asked for help.',
      r.coachInstruction ? `Coaching: ${r.coachInstruction}` : '',
      r.hint ? `Give them this hint (say it in your own warm words): "${r.hint}"` : ''
    ].filter(Boolean);
    realtime.pushVerdict(parts.join(' '));
  }

  async function finish() {
    if (finishing) return;
    finishing = true;
    if (sessionId && lesson?.status !== 'ended') await endLesson(sessionId);
    realtime.shutdown();
    await goto('/dashboard');
  }

  const isArrayTask = $derived(
    lesson?.task?.answerType === 'manipulative' && lesson?.task?.manipulative?.kind === 'array'
  );
  const isGroupsTask = $derived(
    lesson?.task?.answerType === 'manipulative' && lesson?.task?.manipulative?.kind === 'equal_groups'
  );
  const lastTutor = $derived(realtime.captions.filter((c) => c.role === 'tutor').at(-1)?.text ?? '');
  const statusLabel = $derived(
    realtime.state === 'connecting'
      ? 'Connecting…'
      : realtime.speaking
        ? 'Willow is talking'
        : realtime.state === 'live'
          ? 'Listening…'
          : realtime.state === 'error'
            ? 'Connection problem'
            : ''
  );

  onDestroy(() => realtime.shutdown());
</script>

<svelte:head><title>Lesson · Sprout Shine</title></svelte:head>

<div class="min-h-screen bg-green">
  <div class="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-6 text-paper-3">
    <div class="flex items-center justify-between">
      <span class="text-xs font-bold uppercase tracking-widest text-paper-3/70">Child · Lesson</span>
      {#if lesson}<span class="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{lesson.phase}</span>{/if}
    </div>

    {#if !started}
      <!-- Start gate: mic + audio need a tap first -->
      <div class="flex flex-1 flex-col items-center justify-center text-center">
        <div class="grid size-20 place-items-center rounded-full bg-paper-3 text-5xl">🌿</div>
        <h1 class="mt-5 font-display text-2xl font-bold sm:text-3xl">Ready to learn with Willow?</h1>
        <p class="mt-2 max-w-sm text-paper-3/80">
          Willow will talk to you out loud. Make sure your sound is on, then tap to start.
        </p>
        <Button class="mt-6" size="lg" variant="soft" onclick={begin} disabled={connecting}>
          {connecting ? 'Starting…' : 'Start talking 🎤'}
        </Button>
      </div>
    {:else}
      <!-- Status -->
      <div class="mt-6 flex items-center gap-3">
        <div class="grid size-12 place-items-center rounded-full bg-paper-3 text-2xl">🌿</div>
        <div class="flex items-center gap-2">
          <span
            class="size-2.5 rounded-full {realtime.speaking
              ? 'animate-pulse bg-paper-3'
              : realtime.state === 'live'
                ? 'animate-ping bg-gold'
                : 'bg-paper-3/40'}"
          ></span>
          <span class="text-sm font-bold uppercase tracking-wide text-paper-3/90">{statusLabel}</span>
        </div>
      </div>

      {#if realtime.error}
        <p class="mt-4 rounded-lg bg-coral/30 px-3 py-2 text-sm">Couldn't connect: {realtime.error}</p>
      {/if}

      <!-- Tutor's latest line -->
      <div class="mt-4 rounded-2xl bg-white/12 p-5">
        <p class="font-hand text-2xl leading-snug">{lastTutor || 'Say hello to Willow!'}</p>
      </div>

      {#if currentHint}
        <div class="mt-3 flex items-start gap-2 rounded-2xl bg-gold/20 p-4">
          <Lightbulb class="mt-0.5 size-5 shrink-0 text-gold" />
          <p class="text-sm">{currentHint}</p>
        </div>
      {/if}

      <!-- Workbook -->
      {#if lesson?.task}
        <div class="mt-4 rounded-2xl border border-white/20 bg-white/5 p-5">
          <div class="text-xs font-bold uppercase tracking-widest text-paper-3/60">Your workbook</div>
          <p class="mt-2 font-display text-xl font-bold">{lesson.task.prompt}</p>
          {#if lastVerdict}
            <p class="mt-1 text-xs font-semibold text-paper-3/70">
              {lastVerdict === 'correct' ? '✓ That looks right!' : 'Have a look and try again.'}
            </p>
          {/if}
          <div class="mt-3">
            {#if isArrayTask}
              <WorkspaceArray target={lesson.task.manipulative} onCheck={handleCheck} />
            {:else if isGroupsTask}
              <Workspace
                target={lesson.task.manipulative}
                onCheck={(_r, groups) => handleCheck(groups)}
              />
            {/if}
          </div>
        </div>
      {:else if lesson?.content?.kind === 'reflection'}
        <div class="mt-4 rounded-2xl border border-white/20 bg-white/5 p-5">
          <div class="text-xs font-bold uppercase tracking-widest text-paper-3/60">Reflection</div>
          <p class="mt-2 font-display text-xl font-bold">{lesson.content.prompt}</p>
          <p class="mt-1 text-sm text-paper-3/70">Tell Willow out loud.</p>
        </div>
      {/if}

      <div class="flex-1"></div>

      <!-- Controls -->
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button
          onclick={askForHelp}
          class="inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-2 text-sm font-bold text-gold-deep hover:bg-gold/90"
        >
          <Lightbulb class="size-4" /> I'm stuck
        </button>
        <button
          onclick={() => realtime.toggleMute()}
          class="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-2 text-sm font-semibold hover:bg-white/20"
        >
          {#if realtime.muted}<VolumeX class="size-4" /> Unmute{:else}<Volume2 class="size-4" /> Mute{/if}
        </button>
        <button onclick={finish} class="ml-auto text-sm font-semibold text-paper-3/70 hover:text-paper-3">
          I'm done
        </button>
      </div>
    {/if}
  </div>
</div>
