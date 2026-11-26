/**
 * The server functions this build actually registers, by name.
 *
 * WHY THIS FILE EXISTS
 * TanStack `createServerFn` compiles every handler into the deployed server
 * bundle under a PUBLIC id — `<name>_createServerFn_handler` — reachable at
 * `/_serverFn/<id>` by anyone. Deleting a server function from the source
 * removes its handler, but the framework answers a request for a missing id
 * with a generic 500 (`{"status":500,"unhandled":true,"message":"HTTPError"}`),
 * which looks like a bug and tells a prober nothing. The HTTP entries
 * (`serve.ts`, `vercel-entry.ts`) therefore consult THIS list through
 * `server-fn-guard.ts` and answer a controlled 404 for any id that is not here,
 * before the SSR/server-function handler is ever invoked.
 *
 * The list is not hand-maintained in practice: `src/lib/server-fn-auth.test.ts`
 * scans `src/` for every `createServerFn(` and fails if this list and the scan
 * disagree in EITHER direction — a new server function must be added here, and
 * a deleted one must be removed. That is what stops an id from being "allowed"
 * after its handler is gone.
 *
 * Order: guarded endpoints first, then the public read-only ones.
 */
export const SERVER_FN_NAMES = [
  // ── Guarded inside their handler (session / ownership / admin) ──────────────
  "getMe",
  "createMembershipCheckout",
  "getBookingState",
  "getMyBookings",
  "getProviderDashboard",
  "registerBreeder",
  // ── Public read-only (page loaders an anonymous visitor must reach) ─────────
  "loadProviders",
  "getProviderDetail",
  "getRealProviderCount",
  "getVenues",
  "getRescueDogs",
  "getDogDetail",
  "getBreeders",
  "getBreederDetail",
  "getBreederCount",
  "getTrendingDogs",
  "getReferralCount",
  "getBusinessName",
  "resolveRouteLang",
  "resolveRootLang",
  "resolveMatchCreateLang",
  "resolveAttribution",
] as const;

/** Suffix TanStack Start appends to a server function's name to form its id. */
export const SERVER_FN_ID_SUFFIX = "_createServerFn_handler";

/** The public URL prefix the framework serves server functions under. */
export const SERVER_FN_BASE = "/_serverFn/";

/** Every server-function id this build registers. */
export const SERVER_FN_IDS: ReadonlySet<string> = new Set(
  SERVER_FN_NAMES.map((name) => `${name}${SERVER_FN_ID_SUFFIX}`),
);

/** True when `id` belongs to a server function that exists in this build. */
export function isKnownServerFnId(id: string): boolean {
  return SERVER_FN_IDS.has(id);
}
