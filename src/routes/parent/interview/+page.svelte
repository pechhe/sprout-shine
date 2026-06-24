<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import Button from '$lib/components/Button.svelte';
  import Logo from '$lib/components/Logo.svelte';
  import { getChildId } from '$lib/identity';
  import { RealtimeSession, type Caption } from '$lib/realtime.svelte';
  import { checkGuardrails } from '$lib/guardrails';
  import { interviewToken, submitInterviewResult, endInterviewEarly } from '$lib/remote/interview.remote';
  import { Volume2, VolumeX, PhoneOff, Sparkles } from '@lucide/svelte';

  // #22 — the AI-conducted parent onboarding interview. A fluid, free-follow-up
  // voice conversation (reusing the existing Realtime pipeline, not new infra).
  // The one load-bearing output is a Focus Strand the model proposes via the
  // submit_interview_result tool; the server validates and disposes. Completion is
  // participation-based — ended-early / disconnect always write whatever was
  // captured (incl. null focus), so the child's first lesson is never blocked.

  let childId = $state<string | null>(null);
  let started = $state(false);
  let connecting = $state(false);
  let done = $state(false);
  let focusLabel = $state<string | null>(null);
  let finishing = $state(false);

  // Tracks whatever the interviewer has proposed so far, so an early end can
  // write a participation record with the latest captured values (or nulls).
  let captured = $state({
    focusStrand: null as string | null,
    findsEasy: '',
    avoids: '',
    whenStuck: '',
    triedBefore: '',
    wantToUnderstand: ''
  });

  const realtime = new RealtimeSession(async (name, args) => {
    if (!childId) return { ok: false, reason: 'no child' };
    if (name !== 'submit_interview_result') return { ok: false, reason: 'unknown tool' };

    // The model proposed; the system disposes. Capture the proposal (for an
    // early-end fallback) then ask the server to validate + upsert.
    const proposal = {
      childId,
      focusStrand: (args.focusStrand as string | null) ?? null,
      findsEasy: String(args.findsEasy ?? ''),
      avoids: String(args.avoids ?? ''),
      whenStuck: String(args.whenStuck ?? ''),
      triedBefore: String(args.triedBefore ?? ''),
      wantToUnderstand: String(args.wantToUnderstand ?? '')
    };
    captured = { ...proposal };
    const r = await submitInterviewResult(proposal);
    if (r.ok) {
      finish(true); // write succeeded -> interview complete
      return { ok: true };
    }
    // Validation failed: feed the server's feedback back to the model so it can
    // rephrase and try again — no row was written.
    if (r.feedback) {
      realtime.pushVerdict(
        `The interview result wasn't accepted: ${r.feedback} Please adjust and call submit_interview_result again.`
      );
    }
    return { ok: false, feedback: r.feedback ?? 'invalid' };
  }, onParentTurn);

  // No-labels guardrail on each transcribed PARENT turn — same pattern as the
  // child routes, reusing the shared checkGuardrails. Redirects, never engages.
  function onParentTurn(text: string) {
    const guard = checkGuardrails(text);
    if (!guard.category) return;
    realtime.pushVerdict(
      `The parent said something in the "${guard.category}" category. Don't engage with it or repeat it. Acknowledge kindly, then steer gently back to the maths focus chat. Never agree to keep secrets, and never use labels or diagnoses.`
    );
  }

  // Scan each INTERVIEWER turn too (story 12 — an over-rapport-building
  // interviewer can't volunteer a diagnosis). Watched via the captions list so
  // the shared RealtimeSession needs no changes.
  let lastScannedTutor = $state<string | null>(null);
  $effect(() => {
    const last = realtime.captions.filter((c) => c.role === 'tutor').at(-1)?.text ?? null;
    if (!last || last === lastScannedTutor) return;
    lastScannedTutor = last;
    const guard = checkGuardrails(last);
    if (guard.category) {
      realtime.pushVerdict(
        `Your last turn included something in the "${guard.category}" category. Do not use labels or diagnoses, and do not raise sensitive topics. Rephrase and continue the maths focus chat.`
      );
    }
  });

  async function begin() {
    childId = getChildId();
    if (!childId) {
      await goto('/start');
      return;
    }
    connecting = true;
    try {
      started = true;
      await realtime.connect(() => interviewToken(childId!));
    } catch {
      /* error surfaced via realtime.error */
    } finally {
      connecting = false;
    }
  }

  // completion is participation-based: always write whatever was captured,
  // including null focus ("the selector decides"). Never blocks.
  async function finish(submitted = false) {
    if (finishing || done) return;
    finishing = true;
    if (!submitted && childId) {
      // ended-early / disconnect path: write a fallback record (null focus if
      // the model never proposed). Instant bail writes all-empty + null.
      try {
        const r = await endInterviewEarly({ childId, ...captured });
        if (r?.ok) {
          // reflect the stored focus (may be the captured proposal, or null)
          focusLabel = captured.focusStrand
            ? captured.focusStrand.replace(/_/g, ' ')
            : null;
        }
      } catch {
        /* never block on a write failure */
      }
    } else {
      focusLabel = captured.focusStrand ? captured.focusStrand.replace(/_/g, ' ') : null;
    }
    realtime.shutdown();
    done = true;
    finishing = false;
  }

  // A disconnect / page-unload is treated as ended-early (participation).
  function onDisconnect() {
    if (started && !done && !finishing) untrack(() => finish(false));
  }
  onDestroy(onDisconnect);

  const lastInterviewer = $derived(
    realtime.captions.filter((c) => c.role === 'tutor').at(-1)?.text ?? ''
  );
  const lastParent = $derived(
    realtime.captions.filter((c) => c.role === 'child').at(-1)?.text ?? ''
  );
  const statusLabel = $derived(
    realtime.state === 'connecting' ? 'Connecting…' :
    realtime.speaking ? 'Interviewer talking' :
    realtime.state === 'live' ? 'Listening…' :
    done ? 'Done' : ''
  );
</script>

<svelte:head><title>Parent chat · Sprout Shine</title></svelte:head>

<div class="min-h-screen bg-paper-2">
  <div class="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-8">
    <div class="flex items-center justify-between">
      <Logo />
      <span class="text-xs font-bold uppercase tracking-widest text-muted">Parent · Quick chat</span>
    </div>

    {#if !started}
      <div class="flex flex-1 flex-col items-center justify-center text-center">
        <div class="grid size-20 place-items-center rounded-full bg-mint text-5xl">🗣️</div>
        <h1 class="mt-5 font-display text-2xl font-bold text-ink sm:text-3xl">A quick chat about your child</h1>
        <p class="mt-2 max-w-sm text-muted">
          A friendly two-minute conversation so lessons can focus on what matters to your family right now.
          Just talk out loud — there are no right answers, and "you choose" is a perfectly good answer.
        </p>
        <Button class="mt-6" size="lg" variant="soft" onclick={begin} disabled={connecting}>
          {connecting ? 'Starting…' : 'Start the chat 🎤'}
        </Button>
        <p class="mt-4 text-xs text-muted-soft">You can end anytime — whatever you've said is kept.</p>
      </div>
    {:else if done}
      <div class="flex flex-1 flex-col items-center justify-center text-center">
        <div class="grid size-20 place-items-center rounded-full bg-gold text-5xl">⭐</div>
        <h1 class="mt-5 font-display text-2xl font-bold text-ink sm:text-3xl">All set, thank you!</h1>
        <p class="mt-3 max-w-md rounded-2xl bg-paper-3 p-5 font-hand text-xl leading-snug text-ink-soft">
          {#if focusLabel}
            We'll aim the next lessons at <span class="font-bold capitalize">{focusLabel}</span>.
            You can change this anytime from your dashboard.
          {:else}
            No particular focus tonight — we'll pick what looks most useful next, and you can steer it later.
          {/if}
        </p>
        <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
          {#if childId}
            <Button variant="primary" onclick={() => goto('/child/lesson')}>Start the first lesson</Button>
          {/if}
          <Button variant="ghost" onclick={() => goto('/dashboard')}>Back to dashboard</Button>
        </div>
      </div>
    {:else}
      <div class="mt-6 flex items-center gap-3">
        <div class="grid size-12 place-items-center rounded-full bg-leaf text-2xl text-white">🗣️</div>
        <div class="flex items-center gap-2">
          <span class="size-2.5 rounded-full {realtime.speaking ? 'animate-pulse bg-leaf' : realtime.state === 'live' ? 'animate-ping bg-gold' : 'bg-muted/40'}"></span>
          <span class="text-sm font-bold uppercase tracking-wide text-muted">{statusLabel}</span>
        </div>
      </div>

      {#if realtime.error}
        <p class="mt-4 rounded-xl bg-coral/15 px-4 py-3 text-sm font-semibold text-coral">
          Couldn't connect: {realtime.error}
        </p>
      {/if}

      {#if lastInterviewer}
        <div class="mt-4 rounded-2xl bg-mint p-5">
          <div class="mb-1 text-xs font-bold uppercase tracking-widest text-green-deep/70">Interviewer</div>
          <p class="font-hand text-2xl leading-snug text-ink">{lastInterviewer}</p>
        </div>
      {/if}

      {#if lastParent}
        <div class="mt-3 rounded-2xl bg-paper-3 border border-cream-line p-5">
          <div class="mb-1 text-xs font-bold uppercase tracking-widest text-muted">You</div>
          <p class="text-base text-ink-soft">{lastParent}</p>
        </div>
      {/if}

      <div class="flex-1"></div>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button
          onclick={() => realtime.toggleMute()}
          class="inline-flex items-center gap-1.5 rounded-full bg-paper-3 border border-cream-line px-3 py-2 text-sm font-semibold text-ink hover:bg-cream"
        >
          {#if realtime.muted}<VolumeX class="size-4" /> Unmute{:else}<Volume2 class="size-4" /> Mute{/if}
        </button>
        <button
          onclick={() => finish(false)}
          class="ml-auto inline-flex items-center gap-1.5 rounded-full bg-coral/15 px-3 py-2 text-sm font-semibold text-coral hover:bg-coral/25"
        >
          <PhoneOff class="size-4" /> I'm done
        </button>
      </div>
      <p class="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-soft">
        <Sparkles class="size-3.5" /> Say "you choose" if you've no preference — that's a great answer too.
      </p>
    {/if}
  </div>
</div>
