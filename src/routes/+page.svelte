<script lang="ts">
  import Logo from '$lib/components/Logo.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import Field from '$lib/components/Field.svelte';
  import { submitApplication } from '$lib/remote/applications.remote';
  import { ShieldCheck, Mic, Sparkles, LineChart, Lock, EarOff } from '@lucide/svelte';

  const submitted = $derived(submitApplication.result?.ok === true);
  const errorMsg = $derived(
    submitApplication.result && !submitApplication.result.ok ? submitApplication.result.error : null
  );
</script>

<svelte:head>
  <title>Sprout Shine — the maths tutor that learns how your child learns</title>
  <meta
    name="description"
    content="A voice-led adaptive maths tutor for ages 7-10, with a weekly learning insight for parents. Founder pilot open now."
  />
</svelte:head>

<!-- Top bar -->
<header class="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
  <Logo />
  <a href="#apply">
    <Button size="md">Apply to the pilot</Button>
  </a>
</header>

<!-- Hero -->
<section class="relative overflow-hidden">
  <div class="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-8 md:grid-cols-2 md:pt-12">
    <div>
      <span
        class="inline-flex items-center gap-2 rounded-full bg-mint px-3 py-1 text-sm font-semibold text-green-deep"
      >
        <Sparkles class="size-4" /> Founder pilot open now
      </span>
      <h1 class="mt-5 font-display text-4xl font-bold leading-[1.08] text-ink sm:text-5xl">
        Not just what they got wrong.
        <span class="text-green">Why they got stuck.</span>
      </h1>
      <p class="mt-5 max-w-md text-lg text-muted">
        Sprout Shine is a voice-led maths tutor for children aged 7-10. It adapts in real time — and
        each week it tells you how your child learns, where they get stuck, and where they might
        shine.
      </p>
      <div class="mt-7 flex flex-wrap gap-3">
        <a href="#apply"><Button size="lg">Apply to the pilot</Button></a>
        <a href="#how"><Button size="lg" variant="ghost">See how it works</Button></a>
      </div>
      <p class="mt-4 text-sm text-muted">For parents of 7-10-year-olds · maths reasoning first.</p>
    </div>

    <!-- Mascot card -->
    <div class="relative">
      <div
        class="rounded-[2rem] bg-green p-8 text-paper-3 shadow-[0_24px_60px_rgba(31,111,80,0.35)]"
      >
        <div class="flex items-center justify-center">
          <div
            class="grid size-32 place-items-center rounded-full bg-paper-3 text-6xl shadow-inner"
          >
            🌿
          </div>
        </div>
        <p class="mt-6 text-center font-hand text-2xl leading-tight">
          “Let's try six times four. Draw it however helps you think.”
        </p>
        <div class="mt-5 grid grid-cols-3 gap-3 text-center text-sm">
          <div class="rounded-xl bg-white/10 py-3">
            <div class="text-xl">🎙️</div>
            Voice-led
          </div>
          <div class="rounded-xl bg-white/10 py-3">
            <div class="text-xl">✏️</div>
            Visual maths
          </div>
          <div class="rounded-xl bg-white/10 py-3">
            <div class="text-xl">📩</div>
            Weekly insight
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- How it works -->
<section id="how" class="border-y border-cream-line bg-paper">
  <div class="mx-auto max-w-6xl px-5 py-16">
    <h2 class="font-display text-2xl font-bold text-ink sm:text-3xl">How a session works</h2>
    <p class="mt-2 max-w-xl text-muted">
      Short, structured 10-15 minute sessions — guided lessons, not an open-ended chatbot.
    </p>
    <div class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {#each [{ icon: Mic, t: 'Talks it through', d: 'Your child speaks with a friendly AI coach using clear turn-taking — never talked over.' }, { icon: Sparkles, t: 'Works it out', d: 'A visual workbook for counters, arrays, number lines — so they build the idea, not just type an answer.' }, { icon: LineChart, t: 'Adapts in real time', d: 'A small nudge before a big hint. The tutor coaches thinking instead of handing over answers.' }, { icon: ShieldCheck, t: 'Tells you what matters', d: 'A short, evidence-based weekly digest — what improved, what was tricky, one shine moment.' }] as step}
        <Card>
          <div class="grid size-11 place-items-center rounded-xl bg-mint text-green-deep">
            <step.icon class="size-5" />
          </div>
          <h3 class="mt-4 font-display text-lg font-semibold text-ink">{step.t}</h3>
          <p class="mt-1.5 text-sm text-muted">{step.d}</p>
        </Card>
      {/each}
    </div>
  </div>
</section>

<!-- Privacy / trust -->
<section class="mx-auto max-w-6xl px-5 py-16">
  <div class="grid gap-8 md:grid-cols-[1fr_1.2fr] md:items-center">
    <div>
      <h2 class="font-display text-2xl font-bold text-ink sm:text-3xl">Privacy is the product</h2>
      <p class="mt-3 text-muted">
        Children should never wonder what's being watched. We keep the trust rules visible and in
        your control — and your child is always told they're talking to an AI helper, never a friend.
      </p>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      {#each [{ icon: ShieldCheck, t: 'Guardian consent first', d: 'No child use until a parent consents and sets the rules.' }, { icon: EarOff, t: 'Raw audio off by default', d: 'We do not keep voice recordings unless you turn it on.' }, { icon: Lock, t: 'No transcript dump', d: 'Full transcripts are private by default — you get evidence, not every word.' }, { icon: Sparkles, t: 'No ads, ever', d: 'No advertising and no selling of your child’s data.' }] as item}
        <Card padded={false} class="flex gap-3 p-5">
          <div class="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-soft text-blue">
            <item.icon class="size-5" />
          </div>
          <div>
            <h3 class="font-display text-base font-semibold text-ink">{item.t}</h3>
            <p class="mt-0.5 text-sm text-muted">{item.d}</p>
          </div>
        </Card>
      {/each}
    </div>
  </div>
</section>

<!-- Apply -->
<section id="apply" class="border-t border-cream-line bg-paper">
  <div class="mx-auto max-w-3xl px-5 py-16">
    <div class="text-center">
      <h2 class="font-display text-2xl font-bold text-ink sm:text-3xl">Apply to the founder pilot</h2>
      <p class="mx-auto mt-2 max-w-lg text-muted">
        20-30 families · ages 7-10 · 3 short sessions a week · a weekly parent digest. Tell us a
        little about your child so we can see if it's a fit.
      </p>
    </div>

    <Card class="mt-8">
      {#if submitted}
        <div class="py-8 text-center">
          <div class="mx-auto grid size-16 place-items-center rounded-full bg-mint text-3xl">🌱</div>
          <h3 class="mt-4 font-display text-xl font-semibold text-ink">Thank you — application received.</h3>
          <p class="mx-auto mt-2 max-w-sm text-muted">
            We review every application personally and will be in touch about a short parent
            interview. Welcome to the pilot.
          </p>
        </div>
      {:else}
        <form {...submitApplication} class="grid gap-5">
          <div class="grid gap-5 sm:grid-cols-2">
            <Field label="Your name" required>
              <input class="ss-input" name="parentName" placeholder="Parent / guardian name" />
            </Field>
            <Field label="Email" required>
              <input class="ss-input" type="email" name="email" placeholder="you@example.com" />
            </Field>
          </div>

          <div class="grid gap-5 sm:grid-cols-2">
            <Field label="Child's age" required>
              <input class="ss-input" type="number" name="childAge" min="4" max="16" placeholder="8" />
            </Field>
            <Field label="Sessions a week you can realistically do" required>
              <select class="ss-select" name="weeklyAvailability">
                <option value="">Choose…</option>
                <option>1 session</option>
                <option>2 sessions</option>
                <option>3 sessions</option>
                <option>4+ sessions</option>
              </select>
            </Field>
          </div>

          <Field label="How is maths going right now?" required>
            <textarea
              class="ss-textarea"
              name="mathsExperience"
              placeholder="Where they're confident, where they struggle…"
            ></textarea>
          </Field>

          <Field label="What have you already tried?" required>
            <textarea
              class="ss-textarea"
              name="triedBefore"
              placeholder="Apps, tutors, worksheets, helping yourself…"
            ></textarea>
          </Field>

          <Field label="What do you most want to understand about how your child learns?" required>
            <textarea
              class="ss-textarea"
              name="wantToUnderstand"
              placeholder="The thing you wish you knew…"
            ></textarea>
          </Field>

          <div class="grid gap-5 sm:grid-cols-2">
            <Field label="When could you do a short parent interview?" required>
              <input
                class="ss-input"
                name="interviewAvailability"
                placeholder="e.g. weekday evenings"
              />
            </Field>
            <Field label="Willingness to pay (pilot)" required hint="Honest answer helps us — no commitment yet.">
              <select class="ss-select" name="willingnessToPay">
                <option value="">Choose…</option>
                <option>Free pilot only</option>
                <option>£29/month founding family</option>
                <option>£49 for a 4-week pilot</option>
                <option>£99 for 8 weeks with founder support</option>
              </select>
            </Field>
          </div>

          <Field label="Any privacy concerns or questions?">
            <textarea class="ss-textarea" name="privacyConcerns" placeholder="Optional"></textarea>
          </Field>

          {#if errorMsg}
            <p class="rounded-lg bg-coral/15 px-4 py-3 text-sm font-semibold text-coral">{errorMsg}</p>
          {/if}

          <Button type="submit" size="lg" class="w-full">Send my application</Button>
          <p class="text-center text-xs text-muted">
            We'll only use these details to assess pilot fit and contact you. No marketing.
          </p>
        </form>
      {/if}
    </Card>
  </div>
</section>

<footer class="border-t border-cream-line">
  <div
    class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted sm:flex-row"
  >
    <Logo size="sm" />
    <p>The AI tutor that learns how your child learns.</p>
    <a class="font-semibold text-green-deep hover:underline" href="/start">Already invited? Set up →</a>
  </div>
</footer>
