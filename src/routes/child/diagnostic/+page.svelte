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
  import { recordEvent } from '$lib/remote/sessions.remote';
  import {
    startDiagnostic,
    diagnosticToken,
    diagnosticRequestHint,
    diagnosticRecordAttempt
  } from '$lib/remote/diagnostic.remote';
  import { Check, Lightbulb, Mic, Sparkles } from '@lucide/svelte';

  let childId = $state<string | null>(null);
  let sessionId = $state<string | null>(null);
  let diag = $state<any>(null);
  let started = $state(false);
  let connecting = $state(false);
  let currentHint = $state('');
  let typed = $state<number | null>(null);
  let closing = $state<string | null>(null);
  let lastVerdict = $state<string | null>(null);
  let finishing = $state(false);

  const realtime = new RealtimeSession(async (name) => {
    if (!sessionId) return { ok: false, reason: 'no session' };
    switch (name) {
      case 'request_hint': {
        const r = await diagnosticRequestHint(sessionId);
        if (r.ok && r.hint) currentHint = r.hint;
        return r;
      }
      case 'tag_misconception':
        return { ok: true as const };
      default:
        return { ok: false, reason: 'unknown tool' };
    }
  }, (childText) => {
    const guard = checkGuardrails(childText);
    if (!guard.category || !sessionId || !childId) return;
    recordEvent({ sessionId, childId, type: 'guardrail', text: childText, meta: { category: guard.category } });
    realtime.pushVerdict(
      `SAFETY: the child said something in the "${guard.category}" category. Do not engage with it or repeat it. Gently say: "${guard.response}" then continue the maths.`
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
      const res = await startDiagnostic(childId);
      sessionId = res.sessionId;
      diag = res;
      started = true;
      await realtime.connect(() => diagnosticToken(sessionId!));
    } finally {
      connecting = false;
    }
  }

  async function submitAttempt(attempt: unknown) {
    if (!sessionId) return;
    currentHint = '';
    const r = await diagnosticRecordAttempt({ sessionId, attempt });
    lastVerdict = r.verdict ?? null;
    diag = r.next ? { ...diag, item: r.next, itemIndex: r.next.index } : diag;

    if (r.done) {
      closing = r.closing ?? 'All done — well done for having a go!';
      realtime.pushVerdict(`The quick check is finished. Say this warmly to the child: "${closing}"`);
      return;
    }
    if (r.next) {
      lastVerdict = null;
      realtime.pushVerdict(
        `The child is moving on. Next prompt to work through: "${r.next.prompt}". Keep it encouraging.`
      );
      return;
    }
    const parts = [
      `The child answered. Verdict: "${r.verdict}".`,
      r.misconception ? `Likely misconception: ${r.misconception}.` : '',
      r.coachInstruction ? `Coaching: ${r.coachInstruction}` : 'Encourage another try.',
      'Respond warmly in one short turn. Do not reveal the answer.'
    ].filter(Boolean);
    realtime.pushVerdict(parts.join(' '));
  }

  function handleArrayCheck(rows: number[]) {
    submitAttempt({ kind: 'array', rows });
  }

  function handleGroupsCheck(_result: unknown, groups: number[]) {
    submitAttempt({ kind: 'equal_groups', groups });
  }

  function streamWorkspace(kind: 'array' | 'equal_groups', action: string, values: number[]) {
    realtime.pushContext(
      `WORKSPACE UPDATE (do not respond yet): the child used ${action} in the ${kind} workspace. Current counts: [${values.join(', ')}].`
    );
  }

  function submitNumeric() {
    if (typed === null || !Number.isFinite(typed)) return;
    const value = typed;
    typed = null;
    submitAttempt({ kind: 'numeric', value });
  }

  async function askForHelp() {
    if (!sessionId) return;
    const r = await diagnosticRequestHint(sessionId);
    if (r.ok && r.hint) currentHint = r.hint;
    if (r.coachInstruction) realtime.pushVerdict(`The child is stuck. Coaching: ${r.coachInstruction}`);
  }

  async function repeatTutor() {
    if (sessionId && childId) await recordEvent({ sessionId, childId, type: 'repeat' });
    realtime.pushVerdict('The child tapped “Say that again”. Repeat your last instruction more slowly and in fewer words.');
  }

  async function retryConnection() {
    if (!sessionId || connecting) return;
    connecting = true;
    try {
      await realtime.connect(() => diagnosticToken(sessionId!));
    } finally {
      connecting = false;
    }
  }

  async function leave(destination: '/dashboard' | '/child/lesson') {
    if (finishing) return;
    finishing = true;
    if (sessionId && diag?.status !== 'ended' && !closing) {
      try {
        await recordEvent({ sessionId, childId: childId!, type: 'session_end' });
      } catch {
        // The session still closes locally if event recording is unavailable.
      }
    }
    realtime.shutdown();
    await goto(destination);
  }

  const item = $derived(diag?.item ?? null);
  const lastTutor = $derived(realtime.captions.filter((c) => c.role === 'tutor').at(-1)?.text ?? 'Say hello when you are ready.');
  const statusLabel = $derived(
    realtime.state === 'connecting' ? 'Getting ready' :
    realtime.speaking ? 'Talking' :
    realtime.state === 'live' ? realtime.muted ? 'Mic is off' : 'Listening' :
    realtime.state === 'error' ? 'Needs help connecting' : 'Ready'
  );
  const progress = $derived(diag?.total ? Math.min(100, (((item?.index ?? 0) + 1) / diag.total) * 100) : 0);

  onDestroy(() => realtime.shutdown());
</script>

<svelte:head><title>Quick maths check · Sprout Shine</title></svelte:head>

<div class="child-session-page">
  <div class="mx-auto flex min-h-[100svh] max-w-3xl flex-col px-4 py-5 sm:px-6 sm:py-7">
    <header class="flex items-center justify-between gap-4">
      <div class="inline-flex items-center gap-2 font-display font-bold text-ink">
        <span aria-hidden="true">🌿</span>
        <span>Sprout Shine</span>
      </div>
      {#if diag && !closing}
        <div class="flex items-center gap-2">
          <div class="hidden h-2 w-24 overflow-hidden rounded-full bg-cream sm:block" aria-hidden="true">
            <div class="h-full rounded-full bg-green" style={`width: ${progress}%`}></div>
          </div>
          <span class="rounded-full bg-paper-3 px-3 py-1.5 text-xs font-extrabold text-green-deep shadow-sm">
            {(item?.index ?? 0) + 1} of {diag.total}
          </span>
        </div>
      {/if}
    </header>

    {#if !started}
      <main class="grid flex-1 place-items-center py-10">
        <section class="child-session-card w-full max-w-xl p-6 text-center sm:p-10">
          <div class="mx-auto grid size-20 place-items-center rounded-full bg-mint text-5xl ring-8 ring-mint/60">🌿</div>
          <p class="mt-6 text-xs font-extrabold uppercase tracking-[0.18em] text-green-deep">Meet Willow · 2 of 2</p>
          <h1 class="mt-2 font-display text-3xl font-bold leading-tight text-ink sm:text-4xl">First, a friendly maths check</h1>
          <p class="mx-auto mt-3 max-w-md text-base leading-relaxed text-muted sm:text-lg">
            This is not a test. A few little questions help Willow choose a good place to start.
          </p>
          <div class="mx-auto mt-6 flex max-w-sm items-center justify-center gap-2 rounded-xl bg-paper-2 px-4 py-3 text-sm font-bold text-ink-soft">
            <Mic class="size-5 text-green" /> Talk out loud, type, or use the workbook
          </div>
          <Button class="mt-7 w-full sm:w-auto" size="lg" onclick={begin} disabled={connecting}>
            <Mic class="size-5" /> {connecting ? 'Getting Willow ready…' : 'Start the quick check'}
          </Button>
          <p class="mt-3 text-xs text-muted">Your browser will ask to use the microphone.</p>
        </section>
      </main>
    {:else if closing}
      <main class="grid flex-1 place-items-center py-10">
        <section class="child-session-card w-full max-w-xl p-6 text-center sm:p-10">
          <div class="mx-auto grid size-20 place-items-center rounded-full bg-gold/25 text-5xl ring-8 ring-gold/10">⭐</div>
          <p class="mt-6 text-xs font-extrabold uppercase tracking-[0.18em] text-green-deep">Quick check complete</p>
          <h1 class="mt-2 font-display text-3xl font-bold text-ink sm:text-4xl">You did it!</h1>
          <p class="mx-auto mt-4 max-w-md rounded-2xl bg-mint p-5 font-display text-xl font-medium leading-snug text-ink">
            {closing}
          </p>
          <p class="mx-auto mt-4 max-w-sm text-sm text-muted">Willow now has a starting point. It will keep changing as you learn.</p>
          <Button class="mt-7 w-full sm:w-auto" size="lg" onclick={() => leave('/child/lesson')}>
            <Sparkles class="size-5" /> Go to my first lesson
          </Button>
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

        {#if item}
          <section class="child-session-card mt-4 p-4 sm:p-6" aria-labelledby="diagnostic-task">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="text-xs font-extrabold uppercase tracking-[0.15em] text-green-deep">{item.label}</div>
                <h1 id="diagnostic-task" class="mt-2 max-w-2xl font-display text-2xl font-bold leading-tight text-ink sm:text-3xl">
                  {item.prompt}
                </h1>
              </div>
              {#if lastVerdict && lastVerdict !== 'correct'}
                <span class="rounded-full bg-coral-soft px-3 py-1.5 text-sm font-bold text-coral-deep" role="status">
                  Have another look
                </span>
              {/if}
            </div>
            <div class="mt-4">
              {#if item.answerType === 'manipulative' && item.manipulative?.kind === 'array'}
                <WorkspaceArray
                  target={item.manipulative}
                  onInteract={(action, rows) => streamWorkspace('array', action, rows)}
                  onCheck={handleArrayCheck}
                />
              {:else if item.answerType === 'manipulative' && item.manipulative?.kind === 'equal_groups'}
                <Workspace
                  target={item.manipulative}
                  onInteract={(action, groups) => streamWorkspace('equal_groups', action, groups)}
                  onCheck={handleGroupsCheck}
                />
              {:else if item.answerType === 'numeric'}
                <form onsubmit={(event) => { event.preventDefault(); submitNumeric(); }} class="flex max-w-sm items-center gap-2">
                  <label for="number-answer" class="sr-only">Type your number answer</label>
                  <input
                    id="number-answer"
                    bind:value={typed}
                    type="number"
                    inputmode="numeric"
                    placeholder="Your answer"
                    class="ss-input min-h-12 flex-1 bg-paper"
                  />
                  <button
                    type="submit"
                    class="grid size-12 place-items-center rounded-full bg-green text-paper-3 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-green/50 focus-visible:ring-offset-3"
                    aria-label="Check my answer"
                    disabled={typed === null}
                  ><Check class="size-5" /></button>
                </form>
              {:else}
                <div class="rounded-xl bg-paper-2 p-4 text-sm font-semibold text-ink-soft">
                  Tell Willow out loud, or choose “Type instead” below.
                </div>
              {/if}
            </div>
          </section>
        {/if}

        <div class="flex-1"></div>
        <SessionControls
          muted={realtime.muted}
          disabled={realtime.state !== 'live'}
          onHelp={askForHelp}
          onRepeat={repeatTutor}
          onMute={() => realtime.toggleMute()}
          onFinish={() => leave('/dashboard')}
          onSendText={(text) => realtime.sendText(text)}
        />
      </main>
    {/if}
  </div>
</div>
