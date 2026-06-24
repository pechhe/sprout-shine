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
import type * as interviews from "../interviews.js";
import type * as lesson_grade from "../lesson/grade.js";
import type * as lesson_plan from "../lesson/plan.js";
import type * as lesson_seedPlans from "../lesson/seedPlans.js";
import type * as lesson_vocab from "../lesson/vocab.js";
import type * as parents from "../parents.js";
import type * as plans from "../plans.js";
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
  interviews: typeof interviews;
  "lesson/grade": typeof lesson_grade;
  "lesson/plan": typeof lesson_plan;
  "lesson/seedPlans": typeof lesson_seedPlans;
  "lesson/vocab": typeof lesson_vocab;
  parents: typeof parents;
  plans: typeof plans;
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
