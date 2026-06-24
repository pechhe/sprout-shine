# Sprout Shine

Voice-first adaptive maths tutor for ages 7-10, with a weekly parent learning insight.
See [docs/PRD.md](docs/PRD.md) for the full product spec.

## Stack

- **SvelteKit** (SPA, `ssr=false`) — UI + **remote functions** as the primary client↔server boundary
- **Convex** — database + backend functions (`convex/`)
- **Tailwind v4** — design system in `src/lib/styles/app.css`
- **bits-ui** — headless UI primitives where needed
- **bun** — package manager / runtime
- **Vite+ (`vp`)** — dev/build/check/test toolchain on top of Vite

No auth yet (pilot): a parent is identified by an opaque `parentKey` kept in
`localStorage` (`src/lib/identity.ts`).

## Run

```bash
bun install
bunx convex dev        # terminal 1 — pushes schema/functions, watches convex/
bun run dev            # terminal 2 — app at http://localhost:5173
```

`PUBLIC_CONVEX_URL` is written to `.env.local` by `convex dev`.

```bash
bun run check          # vp check (format + lint + types)
bun run check:svelte   # svelte-check
bun run build          # production build
```

## Architecture

- `convex/` — schema + mutations/queries (`applications`, `parents`, `children`,
  `interviews`, `consent`).
- `src/lib/remote/*.remote.ts` — SvelteKit remote functions; the server-side
  Convex client lives in `src/lib/server/convex.ts`.
- `src/lib/components/` — shared UI (Button, Card, Field, Toggle, Stepper, Logo).
- `src/routes/` — `/` landing + pilot application (#1), `/start` parent signup +
  child profile + interview (#2), `/consent` consent & privacy (#3),
  `/child/onboarding` coach + prefs + child transparency (#4), `/dashboard`
  parent home.

## Status vs issues

Implemented: #1, #2, #3, #4 (+ parent dashboard).
Next: #5 voice lesson shell → #6 visual workspace → #7 lesson engine.
