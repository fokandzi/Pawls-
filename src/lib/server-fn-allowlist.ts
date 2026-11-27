/**
 * The server functions this build actually registers, by source location.
 *
 * WHY THIS FILE EXISTS
 * TanStack `createServerFn` compiles every handler into the deployed server
 * bundle under a PUBLIC id — reachable at `/_serverFn/<id>` by anyone. Deleting
 * a server function from the source removes its handler, but the framework
 * answers a request for a missing id with a generic 500
 * (`{"status":500,"unhandled":true,"message":"HTTPError"}`), which looks like a
 * bug and tells a prober nothing. The HTTP entries (`serve.ts`,
 * `vercel-entry.ts`) therefore consult THIS list through `server-fn-guard.ts`
 * and answer a controlled 404 for any id that is not here, before the
 * SSR/server-function handler is ever invoked.
 *
 * HOW THE ID IS DERIVED (this is the part that must match the framework)
 * The ids are NOT `<name>_createServerFn_handler`. In a production build
 * (`vite build` → `dist/`, what `serve.ts` and the Vercel function run) the
 * Start compiler derives each id in `compiler.js#generateFunctionId` as:
 *
 *     sha256( `${relativeFilename}--${functionName}` ).hex
 *
 * where `functionName` is `<variableName>_createServerFn_handler` and
 * `relativeFilename` is the source file path relative to the project root
 * (`src/routes/book.index.tsx`, …). So the id depends on the file the function
 * lives in, which is why the table below carries a file for every name: moving
 * a server function to another file changes its id, and a table that only had
 * names would silently allowlist nothing. `serverFnId()` reproduces that
 * derivation exactly, and the drift test in `server-fn-auth.test.ts` fails if
 * this table and a scan of `src/` disagree in EITHER direction.
 *
 * (Dev mode uses a base64url JSON id instead. The guard is only mounted by the
 * two production entries above, both of which run a built bundle.)
 *
 * Order: guarded endpoints first, then the public read-only ones.
 */
import { createHash } from "node:crypto";

/** Every server function this build registers: its variable name and its file. */
export const SERVER_FN_SOURCES = [
  // ── Guarded inside their handler (session / ownership / admin) ──────────────
  { name: "getMe", file: "src/db/auth-fns.ts" },
  { name: "createMembershipCheckout", file: "src/db/payments.ts" },
  { name: "getBookingState", file: "src/routes/book.booking-success.tsx" },
  { name: "getMyBookings", file: "src/routes/book.my-bookings.tsx" },
  { name: "getProviderDashboard", file: "src/routes/book.provider.tsx" },
  { name: "registerBreeder", file: "src/routes/breed.register.tsx" },
  // ── Public read-only (page loaders an anonymous visitor must reach) ─────────
  { name: "loadProviders", file: "src/routes/book.index.tsx" },
  { name: "getProviderDetail", file: "src/routes/book.$providerId.tsx" },
  { name: "getRealProviderCount", file: "src/routes/book.register.tsx" },
  { name: "getVenues", file: "src/routes/venues.tsx" },
  { name: "getRescueDogs", file: "src/routes/rescue.tsx" },
  { name: "getDogDetail", file: "src/routes/rescue.$dogId.tsx" },
  { name: "getBreeders", file: "src/routes/breed.tsx" },
  { name: "getBreederDetail", file: "src/routes/breed.$breederId.tsx" },
  { name: "getTrendingDogs", file: "src/db/schema.ts" },
  { name: "getReferralCount", file: "src/db/schema.ts" },
  { name: "getBusinessName", file: "src/routes/index.tsx" },
  { name: "resolveRouteLang", file: "src/lib/i18n/route-lang.ts" },
  { name: "resolveRootLang", file: "src/routes/__root.tsx" },
  { name: "resolveMatchCreateLang", file: "src/routes/match.create.tsx" },
  { name: "resolveAttribution", file: "src/routes/join.tsx" },
] as const;

/** The server functions this build registers, by name. */
export const SERVER_FN_NAMES: string[] = SERVER_FN_SOURCES.map((fn) => fn.name);

/** Suffix TanStack Start appends to a server function's variable name. */
export const SERVER_FN_ID_SUFFIX = "_createServerFn_handler";

/** Separator TanStack Start puts between the file path and the function name. */
export const SERVER_FN_ID_SEPARATOR = "--";

/** The public URL prefix the framework serves server functions under. */
export const SERVER_FN_BASE = "/_serverFn/";

/**
 * The public id TanStack Start gives the server function declared in `file`
 * as `const <name> = createServerFn(...)`, in a production build.
 * Mirrors `generateFunctionId()` in `@tanstack/start-plugin-core`.
 */
export function serverFnId(file: string, name: string): string {
  return createHash("sha256")
    .update(`${file}${SERVER_FN_ID_SEPARATOR}${name}${SERVER_FN_ID_SUFFIX}`)
    .digest("hex");
}

/** Every server-function id this build registers. */
export const SERVER_FN_IDS: ReadonlySet<string> = new Set(
  SERVER_FN_SOURCES.map((fn) => serverFnId(fn.file, fn.name)),
);

/** True when `id` belongs to a server function that exists in this build. */
export function isKnownServerFnId(id: string): boolean {
  return SERVER_FN_IDS.has(id);
}
