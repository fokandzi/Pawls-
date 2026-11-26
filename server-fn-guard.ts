// Controlled 404 for unknown / removed server functions.
//
// Both HTTP entries (`serve.ts` for the Bun server, `vercel-entry.ts` for the
// Vercel function) call `serverFnGuardResponse()` BEFORE the SSR handler. The
// guard only looks at the URL path and a static list of the ids this build
// registers — it opens no database connection, imports nothing that queries,
// and returns before any TanStack handler can run. So a request for a deleted
// or invented `/_serverFn/<id>` cannot reach a handler, a query or the DB.
//
// Why this is needed: TanStack Start answers an id it does not know by throwing
// an HTTPError inside the SSR handler, which surfaces as
// `500 {"status":500,"unhandled":true,"message":"HTTPError"}` — a wrong status
// that reads like a crash. A removed endpoint is simply not there: 404.
import { SERVER_FN_BASE, isKnownServerFnId } from "./src/lib/server-fn-allowlist.ts";

/** Marker header on every guard-generated 404, so the response is provably ours. */
export const SERVER_FN_GUARD_HEADER = "x-pawls-server-fn-guard";
export const SERVER_FN_GUARD_VALUE = "unknown-server-fn-id";

/** `PAWLS_SERVER_FN_GUARD=off` disables the guard (break-glass only). */
function guardDisabled(): boolean {
  return (process.env.PAWLS_SERVER_FN_GUARD ?? "").trim().toLowerCase() === "off";
}

/**
 * Returns a 404 Response when the request targets a server-function id this
 * build does not register, and null when the request is not a server-function
 * call or the id IS registered (let the framework handle it).
 */
export function serverFnGuardResponse(request: Request): Response | null {
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return null;
  }
  if (!pathname.startsWith(SERVER_FN_BASE)) return null;
  const id = pathname.slice(SERVER_FN_BASE.length).split("/")[0] ?? "";
  if (id && isKnownServerFnId(id)) return null;
  if (guardDisabled()) {
    console.warn(`[server-fn-guard] unknown server function id "${id.slice(0, 120)}" — guard disabled by PAWLS_SERVER_FN_GUARD=off, passing through`);
    return null;
  }
  console.warn(`[server-fn-guard] rejected unknown server function id "${id.slice(0, 120)}" (no handler registered; no database access)`);
  return new Response(
    JSON.stringify({
      ok: false,
      error: "SERVER_FN_NOT_FOUND",
      message: "No server function is registered under this id.",
    }),
    {
      status: 404,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store, max-age=0, must-revalidate",
        [SERVER_FN_GUARD_HEADER]: SERVER_FN_GUARD_VALUE,
      },
    },
  );
}
