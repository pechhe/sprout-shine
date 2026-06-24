<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Logo from '$lib/components/Logo.svelte';
  import Card from '$lib/components/Card.svelte';
  import { getMetrics, getCohorts } from '$lib/remote/metrics.remote';
  import { ArrowLeft } from '@lucide/svelte';

  type Metrics = Awaited<ReturnType<typeof getMetrics>>;

  let loading = $state(true);
  let metrics = $state<Metrics | null>(null);
  let cohorts = $state<string[]>([]);
  let selectedCohort = $state<string | null>(null);

  onMount(async () => {
    try {
      cohorts = await getCohorts();
    } catch {
      cohorts = [];
    }
    await load();
  });

  async function load() {
    loading = true;
    try {
      metrics = await getMetrics(selectedCohort ?? undefined);
    } catch {
      metrics = null;
    }
    loading = false;
  }

  async function chooseCohort(c: string | null) {
    selectedCohort = c;
    await load();
  }

  function pct(rate: number): string {
    return `${Math.round(rate * 100)}%`;
  }

  const gates = $derived(
    metrics
      ? [
          {
            n: 1 as const,
            name: 'Problem validation',
            question: 'Do parents resonate with understanding how their child learns — not just improving marks?',
            badge: 'Commercial · Parent intent'
          },
          {
            n: 2 as const,
            name: 'Lesson-loop validation',
            question: 'Do children complete sessions and want another one?',
            badge: 'Engagement · Learning'
          },
          {
            n: 3 as const,
            name: 'Parent-insight validation',
            question: 'Do parents find the digest accurate and useful?',
            badge: 'Parent value'
          },
          {
            n: 4 as const,
            name: 'Productisation',
            question: 'Is there trust + retention to justify scaling automation, payments and content?',
            badge: 'Safety · Retention · Commercial'
          }
        ]
      : []
  );

  // The five PRD success-metric families, for the legend.
  const families = [
    { label: 'Child engagement', tone: 'bg-leaf' },
    { label: 'Learning', tone: 'bg-blue' },
    { label: 'Parent value', tone: 'bg-gold' },
    { label: 'Safety & trust', tone: 'bg-coral' },
    { label: 'Commercial funnel', tone: 'bg-green' }
  ];
</script>

<svelte:head><title>Pilot metrics · Sprout Shine</title></svelte:head>

<div class="mx-auto max-w-5xl px-5 py-8">
  <div class="flex items-center justify-between">
    <Logo />
    <button class="flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink" onclick={() => goto('/dashboard')}>
      <ArrowLeft class="size-4" /> Parent home
    </button>
  </div>

  <div class="mt-8">
    <h1 class="font-display text-3xl font-bold text-ink">Pilot metrics & retention</h1>
    <p class="mt-1 text-sm text-muted">
      Live from the session-ledger and consent records — no rollup table. Grouped against the four build gates in
      <span class="font-medium text-ink">docs/PRD.md</span>. Degrades to zero where the pilot has no data yet.
    </p>
  </div>

  <!-- Cohort filter -->
  <div class="mt-5 flex flex-wrap items-center gap-2">
    <span class="text-xs font-bold uppercase tracking-widest text-muted">Cohort</span>
    <button
      class="rounded-full px-3 py-1 text-sm font-semibold transition {selectedCohort === null ? 'bg-green text-paper-3' : 'bg-paper text-ink hover:bg-cream'}"
      onclick={() => chooseCohort(null)}>All pilot</button
    >
    {#each cohorts as c}
      <button
        class="rounded-full px-3 py-1 text-sm font-semibold transition {selectedCohort === c ? 'bg-green text-paper-3' : 'bg-paper text-ink hover:bg-cream'}"
        onclick={() => chooseCohort(c)}>{c}</button
      >
    {/each}
  </div>

  {#if loading}
    <p class="mt-12 text-center text-muted">Loading…</p>
  {:else if metrics}
    <!-- legend -->
    <div class="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
      {#each families as f}
        <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-full {f.tone}"></span>{f.label}</span>
      {/each}
    </div>

    <div class="mt-4 grid gap-4">
      {#each gates as g}
        <Card>
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="font-display text-xl font-bold text-ink">Gate {g.n} — {g.name}</h2>
            <span class="text-xs font-semibold text-green">{g.badge}</span>
          </div>
          <p class="mt-1 text-sm text-muted">{g.question}</p>

          {#if g.n === 1}
            {@render gate1(metrics?.gate1!)}
          {:else if g.n === 2}
            {@render gate2(metrics?.gate2!)}
          {:else if g.n === 3}
            {@render gate3(metrics?.gate3!)}
          {:else}
            {@render gate4(metrics?.gate4!)}
          {/if}
        </Card>
      {/each}
    </div>
  {:else}
    <Card class="mt-6">
      <p class="text-sm text-muted">Couldn’t load metrics. Is the Convex backend running?</p>
    </Card>
  {/if}
</div>

<!-- ---- gate renderers (snippets) ---- -->

{#snippet stat(label: string, value: string | number, hint?: string)}
  <div class="rounded-xl bg-paper px-4 py-3">
    <div class="text-xs font-semibold uppercase tracking-widest text-muted">{label}</div>
    <div class="mt-1 font-display text-2xl font-bold text-ink">{value}</div>
    {#if hint}<div class="text-xs text-muted">{hint}</div>{/if}
  </div>
{/snippet}

{#snippet rate(label: string, r: { value: number; total: number; rate: number }, good?: 'high' | 'low')}
  <div class="rounded-xl bg-paper px-4 py-3">
    <div class="flex items-center justify-between">
      <span class="text-xs font-semibold uppercase tracking-widest text-muted">{label}</span>
      <span class="font-display text-lg font-bold text-ink">{pct(r.rate)}</span>
    </div>
    <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-cream">
      <div
        class="h-full rounded-full {good === 'low' ? 'bg-leaf' : 'bg-green'}"
        style="width:{Math.max(2, r.rate * 100)}%"></div>
    </div>
    <div class="mt-1 text-xs text-muted">{r.value} / {r.total}</div>
  </div>
{/snippet}

{#snippet bars(label: string, stages: { stage: string; count: number }[])}
  <div class="rounded-xl bg-paper px-4 py-3">
    <div class="text-xs font-semibold uppercase tracking-widest text-muted">{label}</div>
    <div class="mt-2 grid gap-1.5">
      {#each stages as s}
        <div class="flex items-center gap-2">
          <span class="w-28 shrink-0 truncate text-xs text-ink">{s.stage}</span>
          <div class="h-2 flex-1 overflow-hidden rounded-full bg-cream">
            <div class="h-full rounded-full bg-green" style="width:{stages.length ? (s.count / Math.max(1, ...stages.map((x) => x.count))) * 100 : 0}%"></div>
          </div>
          <span class="w-6 shrink-0 text-right text-xs font-semibold text-ink">{s.count}</span>
        </div>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet gate1(m: Metrics['gate1'])}
  <div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
    {@render stat('Applications', m.applications)}
    {@render rate('Child activation (≥1 session)', m.childActivation)}
    {@render rate('Interview completed', m.interviewCompletion)}
  </div>
  <div class="mt-2 grid gap-2 sm:grid-cols-2">
    {@render bars('Application funnel', m.funnel)}
    {@render bars('Willingness to pay', m.willingnessToPay.slice(0, 4))}
  </div>
{/snippet}

{#snippet gate2(m: Metrics['gate2'])}
  <div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
    {@render stat('Sessions started', m.sessionsStarted)}
    {@render rate('Lesson completion', m.completionRate)}
    {@render rate('Mastery pass', m.masteryPassRate)}
    {@render rate('Returning children (≥2 wks)', m.returningChildren)}
  </div>
  <div class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
    {@render stat('Avg hints / session', m.avgHintsPerSession, `this wk ${m.hintsTrend.thisWeek} · last wk ${m.hintsTrend.lastWeek}`)}
    {@render stat('Recurring misconceptions', `${m.misconceptionRecurrence.recurring}/${m.misconceptionRecurrence.distinct}`, 'fewer over time = learning')}
  </div>
  <div class="mt-2 rounded-xl bg-paper px-4 py-3">
    <div class="text-xs font-semibold uppercase tracking-widest text-muted">Sessions per week</div>
    <div class="mt-2 flex items-end gap-1.5" style="height:64px">
      {#each m.sessionsPerWeek as w}
        <div class="flex flex-1 flex-col items-center justify-end">
          <div class="w-full rounded-t bg-leaf" style="height:{Math.max(2, (w.count / Math.max(1, ...m.sessionsPerWeek.map((x) => x.count))) * 56)}px"></div>
          <span class="mt-1 text-[10px] text-muted">{w.weekKey.slice(-2)}</span>
        </div>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet gate3(m: Metrics['gate3'])}
  <div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
    {@render stat('Digests visible', m.digestsVisible)}
    {@render rate('Digest open rate', m.digestOpenRate, 'high')}
    {@render stat('Feedback volume', m.feedbackVolume)}
    {@render rate('Insight accuracy', m.feedbackAccuracy, 'high')}
    {@render rate('Insight useful', m.feedbackUtility, 'high')}
    {@render stat('Section tuning', `+${m.sectionTuning.wantMore} / −${m.sectionTuning.wantLess}`, 'want more / want less')}
  </div>
  <p class="mt-2 text-xs text-muted">
    Digest-open rate is the new instrumentation from #15 — recorded when a parent opens a digest.
  </p>
{/snippet}

{#snippet gate4(m: Metrics['gate4'])}
  <div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
    {@render stat('Weekly active children', m.weeklyActiveChildren)}
    {@render rate('Week-over-week retention', m.retentionWow, 'high')}
    {@render rate('Insight opt-out rate', m.optOutRate, 'low')}
    {@render stat('Deletion requests', m.deletionRequests)}
    {@render stat('Full-transcript enabled', m.fullTranscriptEnabled)}
    <div class="rounded-xl bg-paper px-4 py-3">
      <div class="text-xs font-semibold uppercase tracking-widest text-muted">Month-one retention</div>
      {#if m.monthOneRetention.available}
        <div class="mt-1 font-display text-2xl font-bold text-ink">{pct(m.monthOneRetention.value / (m.monthOneRetention.total ?? 1))}</div>
        <div class="text-xs text-muted">{m.monthOneRetention.value} / {m.monthOneRetention.total}</div>
      {:else}
        <div class="mt-1 text-sm text-muted">Not yet available</div>
        <div class="text-xs text-muted">{m.monthOneRetention.reason}</div>
      {/if}
    </div>
    <div class="rounded-xl bg-paper px-4 py-3">
      <div class="text-xs font-semibold uppercase tracking-widest text-muted">Paid conversion</div>
      <div class="mt-1 text-sm text-muted">Not yet available</div>
      <div class="text-xs text-muted">{m.paidConversion.available ? '' : m.paidConversion.reason}</div>
    </div>
    <div class="rounded-xl bg-paper px-4 py-3">
      <div class="text-xs font-semibold uppercase tracking-widest text-muted">Referral rate</div>
      <div class="mt-1 text-sm text-muted">Not yet available</div>
      <div class="text-xs text-muted">{m.referralRate.available ? '' : m.referralRate.reason}</div>
    </div>
  </div>
{/snippet}
