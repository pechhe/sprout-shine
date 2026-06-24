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
    startDiagnostic,
    diagnosticToken,
    diagnosticRequestHint,
    diagnosticRecordAttempt
  } from '$lib/remote/diagnostic.remote';
  import { Volume2, VolumeX, Lightbulb, Check } from '@lucide/svelte';

  let childId = $state<string | null>(null);
  let sessionId = $state<string | null>(null);
  let diag = $state<any>(null);
  let started = $state(false);
  let connecting = $state(false);
  let currentHint = $state('');
  let typed = $state('');
  let closing = $state<string | null>(null);
  let skills = $state<{ skillTag: string; level: string; phrase: string }[]>([]);
  let finishing = $state(false);

  const realtime = new RealtimeSession(async (name, args) => {
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

  // Submit a diagnostic attempt. The server grades deterministically, writes the
  // initial skillState, and auto-advances to the next item (or ends with feedback).
  async function submitAttempt(attempt: unknown) {
    if (!sessionId) return;
    currentHint = '';
    const r = await diagnosticRecordAttempt({ sessionId, attempt });
    diag = r.next ? { ...diag, item: r.next, itemIndex: r.next.index } : diag;

    if (r.done) {
      closing = r.closing ?? 'All done — well done for having a go!';
      if (r.views) skills = r.views;
      realtime.pushVerdict(`The diagnostic is finished. Say this warmly to the child: "${closing}"`);
      return;
    }
    if (r.next) {
      realtime.pushVerdict(
        `The child is moving on. Next prompt to work through: "${r.next.prompt}". Keep it encouraging.`
      );
      return;
    }
    // wrong, try again — feed the coaching instruction
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
  function handleGroupsCheck(_r: unknown, groups: number[]) {
    submitAttempt({ kind: 'equal_groups', groups });
  }
  function submitNumeric() {
    const n = parseInt(typed, 10);
    typed = '';
    if (Number.isNaN(n)) return;
    submitAttempt({ kind: 'numeric', value: n });
  }

  async function askForHelp() {
    if (!sessionId) return;
    const r = await diagnosticRequestHint(sessionId);
    if (r.ok && r.hint) currentHint = r.hint;
    if (r.coachInstruction) realtime.pushVerdict(`The child is stuck. Coaching: ${r.coachInstruction}`);
  }

  async function finish() {
    if (finishing) return;
    finishing = true;
    if (sessionId && diag?.status !== 'ended') {
      try { await recordEvent({ sessionId, childId: childId!, type: 'session_end' }); } catch {}
    }
    realtime.shutdown();
    // go to the lesson proper, or dashboard if no arrays plan
    await goto('/child/lesson');
  }

  const item = $derived(diag?.item ?? null);
  const lastTutor = $derived(realtime.captions.filter((c) => c.role === 'tutor').at(-1)?.text ?? '');
  const statusLabel = $derived(
    realtime.state === 'connecting' ? 'Connecting…' :
    realtime.speaking ? 'Willow is talking' :
    realtime.state === 'live' ? 'Listening…' :
    closing ? 'All done' : ''
  );

  onDestroy(() => realtime.shutdown());
</script>

<svelte:head><title>Quick check · Sprout Shine</title></svelte:head>

<div class="min-h-screen bg-green">
  <div class="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-6 text-paper-3">
    <div class="flex items-center justify-between">
      <span class="text-xs font-bold uppercase tracking-widest text-paper-3/70">Child · Quick check</span>
      {#if diag && !closing}<span class="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{(item?.index ?? 0) + 1} of {diag.total}</span>{/if}
    </div>

    {#if !started}
      <div class="flex flex-1 flex-col items-center justify-center text-center">
        <div class="grid size-20 place-items-center rounded-full bg-paper-3 text-5xl">🌿</div>
        <h1 class="mt-5 font-display text-2xl font-bold sm:text-3xl">A friendly quick check</h1>
        <p class="mt-2 max-w-sm text-paper-3/80">
          This isn't a test. Willow just wants to see how your maths brain works so future lessons fit you. About 5 minutes, talking out loud.
        </p>
        <Button class="mt-6" size="lg" variant="soft" onclick={begin} disabled={connecting}>
          {connecting ? 'Starting…' : "Let's begin 🎤"}
        </Button>
      </div>
    {:else if closing}
      <div class="flex flex-1 flex-col items-center justify-center text-center">
        <div class="grid size-20 place-items-center rounded-full bg-gold text-5xl">⭐</div>
        <h1 class="mt-5 font-display text-2xl font-bold sm:text-3xl">That's the quick check done!</h1>
        <p class="mt-3 max-w-md rounded-2xl bg-white/12 p-5 font-hand text-xl leading-snug">{closing}</p>
        {#if skills.length}
          <div class="mt-4 w-full max-w-md space-y-1.5 text-left">
            {#each skills as s}
              <div class="flex items-center justify-between rounded-xl bg-white/8 px-4 py-2 text-sm">
                <span class="font-semibold capitalize">{s.skillTag.replace(/_/g, ' ')}</span>
                <span class="text-paper-3/80">{s.phrase}</span>
              </div>
            {/each}
            <p class="pt-1 text-center text-xs text-paper-3/60">Learning signals from today — not labels. You can always correct anything later.</p>
          </div>
        {/if}
        <Button class="mt-6" size="lg" variant="soft" onclick={finish}>Start my first lesson</Button>
      </div>
    {:else}
      <div class="mt-6 flex items-center gap-3">
        <div class="grid size-12 place-items-center rounded-full bg-paper-3 text-2xl">🌿</div>
        <div class="flex items-center gap-2">
          <span class="size-2.5 rounded-full {realtime.speaking ? 'animate-pulse bg-paper-3' : realtime.state === 'live' ? 'animate-ping bg-gold' : 'bg-paper-3/40'}"></span>
          <span class="text-sm font-bold uppercase tracking-wide text-paper-3/90">{statusLabel}</span>
        </div>
      </div>

      {#if realtime.error}
        <p class="mt-4 rounded-lg bg-coral/30 px-3 py-2 text-sm">Couldn't connect: {realtime.error}</p>
      {/if}

      <div class="mt-4 rounded-2xl bg-white/12 p-5">
        <p class="font-hand text-2xl leading-snug">{lastTutor || 'Say hello to Willow!'}</p>
      </div>

      {#if currentHint}
        <div class="mt-3 flex items-start gap-2 rounded-2xl bg-gold/20 p-4">
          <Lightbulb class="mt-0.5 size-5 shrink-0 text-gold" />
          <p class="text-sm">{currentHint}</p>
        </div>
      {/if}

      {#if item}
        <div class="mt-4 rounded-2xl border border-white/20 bg-white/5 p-5">
          <div class="text-xs font-bold uppercase tracking-widest text-paper-3/60">{item.label}</div>
          <p class="mt-2 font-display text-xl font-bold">{item.prompt}</p>
          <div class="mt-3">
            {#if item.answerType === 'manipulative' && item.manipulative?.kind === 'array'}
              <WorkspaceArray target={item.manipulative} onCheck={handleArrayCheck} />
            {:else if item.answerType === 'manipulative' && item.manipulative?.kind === 'equal_groups'}
              <Workspace target={item.manipulative} onCheck={handleGroupsCheck} />
            {:else if item.answerType === 'numeric'}
              <form onsubmit={(e) => { e.preventDefault(); submitNumeric(); }} class="flex items-center gap-2">
                <input bind:value={typed} type="number" inputmode="numeric" placeholder="Type your answer…"
                  class="flex-1 rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-paper-3 placeholder:text-paper-3/50 focus:outline-none focus:ring-2 focus:ring-paper-3/40" />
                <button type="submit" class="grid size-11 place-items-center rounded-full bg-paper-3 text-green" aria-label="Check"><Check class="size-5" /></button>
              </form>
            {:else}
              <p class="text-sm text-paper-3/70">Tell Willow your answer out loud.</p>
            {/if}
          </div>
        </div>
      {/if}

      <div class="flex-1"></div>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button onclick={askForHelp} class="inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-2 text-sm font-bold text-gold-deep hover:bg-gold/90">
          <Lightbulb class="size-4" /> I'm stuck
        </button>
        <button onclick={() => realtime.toggleMute()} class="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-2 text-sm font-semibold hover:bg-white/20">
          {#if realtime.muted}<VolumeX class="size-4" /> Unmute{:else}<Volume2 class="size-4" /> Mute{/if}
        </button>
        <button onclick={finish} class="ml-auto text-sm font-semibold text-paper-3/70 hover:text-paper-3">I'm done</button>
      </div>
    {/if}
  </div>
</div>
