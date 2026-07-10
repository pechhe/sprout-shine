/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as applications from "../applications.js";
import type * as children from "../children.js";
import type * as consent from "../consent.js";
import type * as diagnostics from "../diagnostics.js";
import type * as engine from "../engine.js";
import type * as interviews from "../interviews.js";
import type * as lesson_diagnosticTasks from "../lesson/diagnosticTasks.js";
import type * as lesson_grade from "../lesson/grade.js";
import type * as lesson_machine from "../lesson/machine.js";
import type * as lesson_nudge from "../lesson/nudge.js";
import type * as lesson_plan from "../lesson/plan.js";
import type * as lesson_seedPlans from "../lesson/seedPlans.js";
import type * as lesson_skillState from "../lesson/skillState.js";
import type * as lesson_vocab from "../lesson/vocab.js";
import type * as parents from "../parents.js";
import type * as plans from "../plans.js";
import type * as realtime from "../realtime.js";
import type * as sessions from "../sessions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  applications: typeof applications;
  children: typeof children;
  consent: typeof consent;
  diagnostics: typeof diagnostics;
  engine: typeof engine;
  interviews: typeof interviews;
  "lesson/diagnosticTasks": typeof lesson_diagnosticTasks;
  "lesson/grade": typeof lesson_grade;
  "lesson/machine": typeof lesson_machine;
  "lesson/nudge": typeof lesson_nudge;
  "lesson/plan": typeof lesson_plan;
  "lesson/seedPlans": typeof lesson_seedPlans;
  "lesson/skillState": typeof lesson_skillState;
  "lesson/vocab": typeof lesson_vocab;
  parents: typeof parents;
  plans: typeof plans;
  realtime: typeof realtime;
  sessions: typeof sessions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
