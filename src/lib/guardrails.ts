// #5/#22 — the no-labels / no-harm guardrail. The canonical implementation now
// lives in convex/lesson/guardrail.ts so the Convex server can share it (the
// parent-interview validator runs at extraction). This re-export keeps every
// existing client import (`import { checkGuardrails } from '$lib/guardrails'`)
// working unchanged.
export {
  checkGuardrails,
  guardrailed,
  type GuardrailCategory,
  type GuardrailResult
} from '$convex/lesson/guardrail';
