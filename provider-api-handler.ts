/**
 * Provider API — native HTTP endpoints (pre-SSR, wired in serve.ts AND
 * vercel-entry.ts, the same proven pattern as auth-handler.ts /
 * match-api-handler.ts / safety-api-handler.ts).
 *
 * Why native: /book/register must answer real HTTP status codes — 401 when the
 * caller is not logged in, 403 on a cross-site POST, 429 when the per-IP limit
 * is hit, 403 for a non-admin approval attempt. A server function cannot express
 * those, and the launch audit (2026-09-28) found the old register form had no
 * authentication, no throttling and reported success for rows nobody could ever
 * approve.
 *
 * Endpoints:
 *   GET  /api/providers/count              -> { ok, count }   REAL providers only
 *   POST /api/providers/register           -> 201 { ok, providerId, approvalStatus: 'pending' }
 *   GET  /api/providers/admin/queue        -> { ok, providers, realCount }   (admin only)
 *   POST /api/providers/admin/:id/approve  -> { ok }                        (admin only)
 *   POST /api/providers/admin/:id/reject   -> { ok }                        (admin only)
 *
 * Identity ALWAYS comes from the session cookie; owner_user_id is never accepted
 * from the client. Register: CSRF -> per-IP rate limit (5/hour, like /register)
 * -> authentication (401) -> server-side validation -> INSERT as 'pending'.
 * Admin endpoints: CSRF -> requireAdmin (401/403) -> provider-core rules.
 * Every response is controlled JSON; DB failures degrade to an honest 503, and
 * nothing ever reports success for work that did not happen.
 */
import { requireAdmin } from "./src/lib/auth/authz";
import { countRealProviders, adminDecideProvider, adminListProviders, registerProviderForOwner } from "./src/lib/provider-core";
import { getSessionUser } from "./src/lib/auth/session";
import { assertSameOrigin } from "./src/lib/auth/csrf";
import { clientIp, rateLimit } from "./src/lib/auth/rate-limit";

const NO_STORE = "no-store, max-age=0, must-revalidate";

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": NO_STORE, ...extraHeaders },
  });
}

function badJson(message: string, status = 400): Response {
  return json({ ok: false, error: "BAD_REQUEST", message }, status);
}

/** Read a JSON or form-encoded body into a plain object. */
async function readBody(request: Request): Promise<Record<string, unknown>> {
  const ct = (request.headers.get("content-type") ?? "").toLowerCase();
  if (ct.includes("application/json")) {
    try {
      const parsed = await request.json();
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  try {
    const form = await request.formData();
    const out: Record<string, unknown> = {};
    for (const key of form.keys()) {
      const val = form.get(key);
      out[key] = val instanceof File ? String(val.name) : val;
    }
    return out;
  } catch {
    return {};
  }
}

export async function handleProvidersApi(request: Request): Promise<Response> {
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return badJson("bad request", 400);
  }

  // ── Public: real-only provider count (no user data, never a raw COUNT(*)) ──
  if (pathname === "/api/providers/count") {
    if (request.method !== "GET") return badJson("GET required", 405);
    try {
      return json({ ok: true, count: await countRealProviders() });
    } catch (err) {
      console.error("[provider-api] count failed", err);
      return json({ ok: false, error: "DB_UNAVAILABLE", message: "Unavailable" }, 503);
    }
  }

  // ── Admin: approval queue (read-only) ─────────────────────────────────────
  if (pathname === "/api/providers/admin/queue") {
    if (request.method !== "GET") return badJson("GET required", 405);
    const auth = await requireAdmin(request);
    if (!auth.ok) return json({ error: auth.code, message: auth.message }, auth.status);
    try {
      const [providers, realCount] = await Promise.all([adminListProviders(), countRealProviders()]);
      return json({ ok: true, providers, realCount });
    } catch (err) {
      console.error("[provider-api] admin queue failed", err);
      return json({ ok: false, error: "DB_UNAVAILABLE", message: "We couldn't load the provider queue right now." }, 503);
    }
  }

  // ── Admin: approve / reject ───────────────────────────────────────────────
  const decideMatch = pathname.match(/^\/api\/providers\/admin\/(\d+)\/(approve|reject)$/);
  if (decideMatch) {
    if (request.method !== "POST") return badJson("POST required", 405);
    const csrf = assertSameOrigin(request);
    if (!csrf.ok) return json({ ok: false, error: "CSRF_BLOCKED", message: csrf.error }, 403);
    const auth = await requireAdmin(request);
    if (!auth.ok) return json({ error: auth.code, message: auth.message }, auth.status);
    const body = await readBody(request);
    const result = await adminDecideProvider(
      auth.user.id,
      Number(decideMatch[1]),
      decideMatch[2],
      body.note === undefined || body.note === null ? null : String(body.note),
    );
    if (!result.ok) {
      return json({ ok: false, error: result.code, message: result.message, messageFr: result.messageFr }, result.status);
    }
    return json({ ok: true, providerId: result.providerId, approvalStatus: result.approvalStatus });
  }

  // ── Provider application (authenticated, throttled, server-validated) ─────
  if (pathname === "/api/providers/register") {
    if (request.method !== "POST") return badJson("POST required", 405);

    const csrf = assertSameOrigin(request);
    if (!csrf.ok) return json({ ok: false, error: "CSRF_BLOCKED", message: csrf.error }, 403);

    // Per-IP throttle mirrors POST /register: 5 applications / hour.
    const rl = await rateLimit("provider-register", clientIp(request));
    if (rl.limited) {
      return json(
        {
          ok: false,
          error: "RATE_LIMITED",
          message: "Too many applications from this connection — please try again later.",
          messageFr: "Trop de demandes depuis cette connexion — réessayez plus tard.",
          retryAfterSeconds: rl.retryAfterSeconds,
        },
        429,
        { "Retry-After": String(rl.retryAfterSeconds) },
      );
    }

    // Identity comes from the session cookie ONLY. No anonymous applications.
    let user: Awaited<ReturnType<typeof getSessionUser>> = null;
    try {
      user = await getSessionUser(request);
    } catch {
      user = null;
    }
    if (!user) {
      return json(
        {
          ok: false,
          error: "UNAUTHENTICATED",
          message: "Log in to submit a provider application.",
          messageFr: "Connectez-vous pour envoyer une demande prestataire.",
        },
        401,
      );
    }

    const body = await readBody(request);
    const result = await registerProviderForOwner(user.id, body);
    if (!result.ok) {
      return json({ ok: false, error: result.code, message: result.message, messageFr: result.messageFr }, result.status);
    }
    return json(
      { ok: true, providerId: result.providerId, approvalStatus: result.approvalStatus },
      201,
    );
  }

  return badJson("Not found", 404);
}
