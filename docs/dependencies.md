# Dependencies

Package manager: bun (`packageManager` in `package.json`; `bun.lock` is the only lockfile).
Surfaces: `package.json`, `bun.lock`. Svelte/Kit config is in `svelte.config.js`.

## Clusters

- SvelteKit: `@sveltejs/kit`, `@sveltejs/adapter-auto`, `@sveltejs/vite-plugin-svelte`, `svelte`, `svelte-check`
- Toolchain: `vite`, `vite-plus`, `@tailwindcss/vite`, `tailwindcss`
- Convex: `convex`, `convex-svelte`
- UI: `bits-ui`, `@lucide/svelte`, `tailwind-merge`, `tailwind-variants`, `clsx`

## Constraints

- `@sveltejs/kit` 3.x / `adapter-auto` 8.x held: Kit 3 drops `svelte.config.js`, `kit` namespace, `$lib`/`alias` (needs `#lib` subpath imports across `src/`), and its `typescript` peer is `^6`. Release when the `$lib`/`$convex` migration is done.
- `typescript` 7.x held: Kit (to 3.0) calls the TS JS API (`ts.sys`), absent in TS 7.
- `vite-plus` 1.x held: needs a `vite` override to `@voidzero-dev/vite-plus-core`, whose plugin types clash with Kit 2's `sveltekit()` in `vite.config.ts` (svelte-check error). Retry with Kit 3.

## Verification

Needs `PUBLIC_CONVEX_URL` set (any URL) for check/build.

```
bun install
bun run check:svelte   # 0 errors expected
bun run build
bun run test
```

`bun run check` (`vp check`) currently fails on pre-existing formatting in 39 files, unrelated to dependencies.
