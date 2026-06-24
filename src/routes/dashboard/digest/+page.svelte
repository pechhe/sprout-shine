<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Logo from '$lib/components/Logo.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import FeedbackBar from '$lib/components/FeedbackBar.svelte';
  import { parentKey, getChildId } from '$lib/identity';
  import { getDashboard } from '$lib/remote/parents.remote';
  import { generateDigest, getLatestDigest, recordDigestOpen } from '$lib/remote/digests.remote';
  import { submitFeedback, type FeedbackTarget } from '$lib/remote/feedback.remote';
  import { Sparkles, ArrowLeft, RefreshCw, MessageCircleHeart } from '@lucide/svelte';

  type DigestView = NonNullable<Awaited<ReturnType<typeof getLatestDigest>>>;

  type SectionKey = 'improved' | 'tricky' | 'patterns' | 'shine' | 'home';
  type Reaction =
    | 'sounds_right'
    | "doesn't_sound_right"
    | 'useful'
    | 'not_useful'
    | 'want_less'
    | 'want_more';

  let loading = $state(true);
  let generating = $state(false);
  let digest = $state<DigestView | null>(null);
  let nickname = $state('your child');
  let consentOn = $state(false);
  let msg = $state<string | null>(null);
  let childId = $state<string | null>(null);
  let weekLabel = $state<string | null>(null);
  // #12 — reactions already submitted on this digest, keyed by section key.
  let submittedBySection = $state<Record<string, Set<string>>>({});
  // #15 — tracks the digest we've already recorded an open for this mount, so
  // refreshing the same week doesn't double-count views.
  let openedDigestId = $state<string | null>(null);

  onMount(async () => {
    const dash = await getDashboard(parentKey());
    if (!dash?.child) {
      await goto('/start');
      return;
    }
    childId = dash.child._id;
    nickname = dash.child.nickname;
    consentOn = dash.consent?.settings?.weeklyDigest ?? false;
    await load();
  });

  async function load() {
    if (!childId) return;
    loading = true;
    try {
      digest = await getLatestDigest(childId);
      if (digest?.weekKey) weekLabel = formatWeek(digest.weekKey);
      // #15 — record a digest-opened engagement signal (fire-and-forget) whenever
      // a distinct digest is shown. Keyed by digestId on the event ledger.
      if (digest && digest._id !== openedDigestId) {
        openedDigestId = digest._id;
        void recordDigestOpen({ childId, digestId: digest._id }).catch(() => {});
      }
      // Rebuild the submitted-reactions map from the digest's history.
      const bySection: Record<string, Set<string>> = {};
      const sections: SectionKey[] = ['improved', 'tricky', 'patterns', 'shine', 'home'];
      for (const f of digest?.feedback ?? []) {
        const target = f.target as FeedbackTarget;
        const section = target.kind === 'digest' ? 'patterns' : target.section;
        const set = bySection[section] ?? new Set<string>();
        set.add(f.reaction);
        bySection[section] = set;
      }
      // Ensure every section has a set so the bar renders.
      for (const s of sections) bySection[s] = bySection[s] ?? new Set<string>();
      submittedBySection = bySection;
    } catch {
      digest = null;
    }
    loading = false;
  }

  async function generate() {
    if (!childId) return;
    generating = true;
    msg = null;
    try {
      const r = await generateDigest({ childId });
      msg = r.skipped ? `Skipped — ${r.skipped}.` : 'Digest generated.';
      await load();
    } catch (e) {
      msg = e instanceof Error ? e.message : 'Could not generate.';
    } finally {
      generating = false;
    }
  }

  function formatWeek(weekKey: string): string {
    // weekKey is "YYYY-WNN" — show a friendly label.
    const m = weekKey.match(/^(\d{4})-W(\d{2})$/);
    if (!m) return weekKey;
    return `Week ${Number(m[2])}, ${m[1]}`;
  }

  async function react(section: SectionKey, reaction: Reaction) {
    if (!childId || !digest) return;
    // Section reactions target the section; for the patterns section the
    // want_less / want_more pin to the pattern itself (targetRef = the tag).
    const target: FeedbackTarget =
      section === 'patterns'
        ? { kind: 'section', section: 'patterns' }
        : { kind: 'section', section };
    try {
      await submitFeedback({
        childId,
        digestId: digest._id,
        reaction,
        target
      });
      // Optimistically mark submitted so the bar shows the chosen reaction.
      const set = new Set(submittedBySection[section] ?? []);
      set.add(reaction);
      submittedBySection[section] = set;
      msg = 'Thanks — noted for future digests.';
    } catch (e) {
      msg = e instanceof Error ? e.message : 'Could not submit feedback.';
    }
  }

  const sections = $derived(
    digest
      ? [
          { key: 'improved' as const, title: 'What improved', body: digest.improved },
          { key: 'tricky' as const, title: 'What was tricky', body: digest.tricky },
          { key: 'patterns' as const, title: 'How they seem to learn best', body: digest.patterns },
          { key: 'shine' as const, title: 'One shine moment', body: digest.shine },
          { key: 'home' as const, title: 'One thing to try at home', body: digest.home }
        ].filter((s) => s.body?.trim())
      : []
  );

  const reconsentPrompts = $derived(digest?.reconsentPrompts ?? []);
</script>

<svelte:head><title>Weekly digest · Sprout Shine</title></svelte:head>

<div class="mx-auto max-w-3xl px-5 py-8">
  <div class="flex items-center justify-between">
    <Logo />
    <button class="flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink" onclick={() => goto('/dashboard')}>
      <ArrowLeft class="size-4" /> Back
    </button>
  </div>

  {#if loading}
    <p class="mt-12 text-center text-muted">Loading…</p>
  {:else}
    <div class="mt-8 flex items-center gap-3">
      <div class="grid size-11 place-items-center rounded-2xl bg-mint text-xl"><Sparkles class="size-6" /></div>
      <div>
        <h1 class="font-display text-2xl font-bold text-ink">This week's learning insight</h1>
        {#if weekLabel}<p class="text-sm text-muted">{weekLabel} · {nickname}</p>{/if}
      </div>
    </div>

    {#if !consentOn}
      <Card class="mt-5">
        <p class="text-sm text-muted">
          You've turned off weekly learning-pattern insights in your privacy settings, so {nickname}
          doesn't have a digest right now. You can switch it back on from the dashboard.
        </p>
        <div class="mt-4"><Button onclick={() => goto('/dashboard')}>Privacy settings</Button></div>
      </Card>
    {:else if digest}
      {#if reconsentPrompts.length > 0}
        <Card class="mt-5 border-mint">
          <div class="flex items-start gap-3">
            <MessageCircleHeart class="mt-0.5 size-5 shrink-0 text-green" />
            <div>
              <p class="text-sm text-ink">
                We're still seeing a signal here — would you like it back in future digests?
              </p>
              <p class="mt-1 text-xs text-muted">
                You asked to see less of this, and we've kept it off since. Fresh sessions are still
                surfacing it, so we wanted to check in rather than decide for you.
              </p>
            </div>
          </div>
        </Card>
      {/if}
      <div class="mt-5 grid gap-3">
        {#each sections as s}
          <Card>
            <h2 class="text-xs font-bold uppercase tracking-widest text-muted">{s.title}</h2>
            <p class="mt-2 text-ink leading-relaxed">{s.body}</p>
            <FeedbackBar submitted={submittedBySection[s.key] ?? new Set()} onReact={(r) => react(s.key, r)} />
          </Card>
        {/each}
      </div>

      <!-- The footer is injected verbatim by the guardrail, never by the LLM. -->
      <p class="mt-4 rounded-xl bg-paper px-4 py-3 text-xs leading-relaxed text-muted">
        {digest.footer}
      </p>

      <div class="mt-5 flex items-center gap-3">
        <Button variant="ghost" onclick={generate} disabled={generating}>
          {#if generating}<RefreshCw class="size-4 animate-spin" />{/if}
          {generating ? 'Generating…' : 'Refresh this week'}
        </Button>
        {#if msg}<span class="text-sm text-muted">{msg}</span>{/if}
      </div>
    {:else}
      <Card class="mt-5">
        <div class="rounded-xl border border-dashed border-cream-line bg-paper p-6 text-center text-muted">
          <div class="text-2xl">🌱</div>
          <p class="mt-2 text-sm">
            No digest yet this week. After a session or two, generate one to see what improved, what was
            tricky, a shine moment, and one thing to try at home — built from evidence, never a transcript.
          </p>
        </div>
        <div class="mt-4 flex items-center gap-3">
          <Button onclick={generate} disabled={generating}>
            {#if generating}<RefreshCw class="size-4 animate-spin" />{/if}
            {generating ? 'Generating…' : 'Generate this week'}
          </Button>
          {#if msg}<span class="text-sm text-muted">{msg}</span>{/if}
        </div>
      </Card>
    {/if}
  {/if}
</div>
