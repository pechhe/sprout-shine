<script lang="ts">
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import Button from '$lib/components/Button.svelte';
  import SessionControls from '$lib/components/SessionControls.svelte';
  import TutorPanel from '$lib/components/TutorPanel.svelte';
  import WorkspaceArray from '$lib/components/WorkspaceArray.svelte';
  import Workspace from '$lib/components/Workspace.svelte';
  import { getChildId } from '$lib/identity';
  import { RealtimeSession } from '$lib/realtime.svelte';
  import { checkGuardrails } from '$lib/guardrails';
  import { toWorkspaceAttempt, type WorkspaceKind } from '$lib/lesson/workspace';
  import { recordEvent } from '$lib/remote/sessions.remote';
  import {
    startLesson,
    realtimeToken,
    requestHint,
    recordAttempt,
    advancePhase,
    tagMisconception,
    endLesson
  } from '$lib/remote/lesson.remote';
  import { CheckCircle2, Lightbulb, Mic, Sparkles } from '@lucide/svelte';

  const SKILL = 'multiplication_as_arrays';
  const PHASE_LABELS: Record<string, string> = {
    warm_up: 'Warm-up',
    concept_intro: 'New idea',
    worked_example: 'Try it together',
    practice: 'Your turn',
    mastery_check: 'Big finish',
    reflection: 'Think back'
  };

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
      const res = await startLesson({ childId, skillTag: SKILL });
      sessionId = res.sessionId;
      lesson = res;
      started = true;
      await realtime.connect(() => realtimeToken(sessionId!));
    } finally {
      connecting = false;
    }
  }

  async function handleCheck(kind: WorkspaceKind, values: number[]) {
    if (!sessionId) return;
    const r = await recordAttempt({ sessionId, attempt: toWorkspaceAttempt(kind, values) });
    lesson = { ...lesson, attempts: r.attempts, taskResolved: r.resolved };
    lastVerdict = r.verdict ?? null;
    currentHint = '';
    const parts = [
      `The child built ${kind === 'array' ? 'rows' : 'groups'} with [${values.join(', ')}] counters.`,
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

  function streamWorkspace(kind: WorkspaceKind, action: string, values: number[]) {
    realtime.pushContext(
      `WORKSPACE UPDATE (do not respond yet): the child used ${action} in the ${kind} workspace. Current counts: [${values.join(', ')}].`
    );
  }

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

  async function repeatTutor() {
    if (sessionId && childId) await recordEvent({ sessionId, childId, type: 'repeat' });
    realtime.pushVerdict('The child tapped “Say that again”. Repeat your last instruction more slowly and in fewer words.');
  }

  async function retryConnection() {
    if (!sessionId || connecting) return;
    connecting = true;
    try {
      await realtime.connect(() => realtimeToken(sessionId!));
    } finally {
      connecting = false;
    }
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
  const lastTutor = $derived(realtime.captions.filter((c) => c.role === 'tutor').at(-1)?.text ?? 'Say hello when you are ready.');
  const statusLabel = $derived(
    realtime.state === 'connecting'
      ? 'Getting ready'
      : realtime.speaking
        ? 'Talking'
        : realtime.state === 'live'
          ? realtime.muted ? 'Mic is off' : 'Listening'
          : realtime.state === 'error'
            ? 'Needs help connecting'
            : 'Ready'
  );
  const phaseLabel = $derived(PHASE_LABELS[lesson?.phase] ?? 'Lesson');

  onDestroy(() => realtime.shutdown());
</script>

<svelte:head><title>Lesson · Sprout Shine</title></svelte:head>

<div class="child-session-page">
  <div class="mx-auto flex min-h-[100svh] max-w-3xl flex-col px-4 py-5 sm:px-6 sm:py-7">
    <header class="flex items-center justify-between gap-4">
      <div class="inline-flex items-center gap-2 font-display font-bold text-ink">
        <span aria-hidden="true">🌿</span>
        <span>Sprout Shine</span>
      </div>
      {#if lesson}
        <span class="rounded-full bg-paper-3 px-3 py-1.5 text-xs font-extrabold text-green-deep shadow-sm">
          {phaseLabel}
        </span>
      {/if}
    </header>

    {#if !started}
      <main class="grid flex-1 place-items-center py-10">
        <section class="child-session-card w-full max-w-xl p-6 text-center sm:p-10">
          <div class="mx-auto grid size-20 place-items-center rounded-full bg-mint text-5xl ring-8 ring-mint/60">🌿</div>
          <p class="mt-6 text-xs font-extrabold uppercase tracking-[0.18em] text-green-deep">About 10 minutes</p>
          <h1 class="mt-2 font-display text-3xl font-bold leading-tight text-ink sm:text-4xl">Ready to learn with Willow?</h1>
          <p class="mx-auto mt-3 max-w-md text-base leading-relaxed text-muted sm:text-lg">
            Turn your sound on. Willow will talk, then you can answer out loud or use the workbook.
          </p>
          <div class="mx-auto mt-6 grid max-w-md grid-cols-3 gap-2 text-xs font-bold text-ink-soft sm:text-sm">
            <span class="rounded-xl bg-paper-2 px-2 py-3">1 · Listen</span>
            <span class="rounded-xl bg-paper-2 px-2 py-3">2 · Build</span>
            <span class="rounded-xl bg-paper-2 px-2 py-3">3 · Explain</span>
          </div>
          <Button class="mt-7 w-full sm:w-auto" size="lg" onclick={begin} disabled={connecting}>
            <Mic class="size-5" /> {connecting ? 'Opening the lesson…' : 'Start my lesson'}
          </Button>
          <p class="mt-3 text-xs text-muted">Your browser will ask to use the microphone.</p>
        </section>
      </main>
    {:else}
      <main class="mt-5 flex flex-1 flex-col">
        <TutorPanel
          text={lastTutor}
          status={statusLabel}
          speaking={realtime.speaking}
          error={realtime.error}
          onRetry={retryConnection}
        />

        {#if currentHint}
          <section class="mt-3 flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold/15 p-4" aria-live="polite">
            <div class="grid size-9 shrink-0 place-items-center rounded-full bg-gold text-gold-deep">
              <Lightbulb class="size-5" />
            </div>
            <div>
              <div class="text-xs font-extrabold uppercase tracking-wider text-gold-deep">A small hint</div>
              <p class="mt-1 font-semibold text-ink">{currentHint}</p>
            </div>
          </section>
        {/if}

        {#if lesson?.task}
          <section class="child-session-card mt-4 p-4 sm:p-6" aria-labelledby="current-task">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.15em] text-green-deep">
                  <Sparkles class="size-4" /> Your turn
                </div>
                <h1 id="current-task" class="mt-2 max-w-2xl font-display text-2xl font-bold leading-tight text-ink sm:text-3xl">
                  {lesson.task.prompt}
                </h1>
              </div>
              {#if lastVerdict}
                <div
                  class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold {lastVerdict === 'correct'
                    ? 'bg-mint-2 text-green-deep'
                    : 'bg-coral-soft text-coral-deep'}"
                  role="status"
                >
                  {#if lastVerdict === 'correct'}<CheckCircle2 class="size-4" /> That works!{:else}Nearly — have another look{/if}
                </div>
              {/if}
            </div>
            <div class="mt-4">
              {#if isArrayTask}
                <WorkspaceArray
                  target={lesson.task.manipulative}
                  onInteract={(action, rows) => streamWorkspace('array', action, rows)}
                  onCheck={(rows) => handleCheck('array', rows)}
                />
              {:else if isGroupsTask}
                <Workspace
                  target={lesson.task.manipulative}
                  onInteract={(action, groups) => streamWorkspace('equal_groups', action, groups)}
                  onCheck={(_result, groups) => handleCheck('equal_groups', groups)}
                />
              {/if}
            </div>
          </section>
        {:else if lesson?.content?.kind === 'reflection'}
          <section class="child-session-card mt-4 p-6 text-center sm:p-8">
            <div class="mx-auto grid size-12 place-items-center rounded-full bg-mint text-green-deep">
              <Sparkles class="size-6" />
            </div>
            <div class="mt-3 text-xs font-extrabold uppercase tracking-[0.15em] text-green-deep">Think back</div>
            <h1 class="mx-auto mt-2 max-w-xl font-display text-2xl font-bold text-ink sm:text-3xl">{lesson.content.prompt}</h1>
            <p class="mt-2 text-muted">Tell Willow out loud, or choose “Type instead”.</p>
          </section>
        {/if}

        <div class="flex-1"></div>
        <SessionControls
          muted={realtime.muted}
          disabled={realtime.state !== 'live'}
          onHelp={askForHelp}
          onRepeat={repeatTutor}
          onMute={() => realtime.toggleMute()}
          onFinish={finish}
          onSendText={(text) => realtime.sendText(text)}
        />
      </main>
    {/if}
  </div>
</div>
