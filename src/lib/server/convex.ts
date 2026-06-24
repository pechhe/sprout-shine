import { ConvexHttpClient } from 'convex/browser';
import { PUBLIC_CONVEX_URL } from '$env/static/public';

/**
 * Server-side Convex client used by SvelteKit remote functions.
 * Remote functions are the primary SvelteKit <-> Convex boundary; reactive
 * client reads (convex-svelte) are reserved for genuinely live UI later.
 */
export const convex = new ConvexHttpClient(PUBLIC_CONVEX_URL);
