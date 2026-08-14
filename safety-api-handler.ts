/**
 * Safety/Admin — native HTTP API (pre-SSR, wired in serve.ts AND
 * vercel-entry.ts, same proven pattern as auth-handler.ts / match-api-handler.ts).
 * All state changes run here so identity always comes from the session cookie.
 *
 * Endpoints:
 *   GET  /api/safety/status?userId=N      -> { blockedByMe, blockedMe, matchState } | 404
 *   POST /api/safety/report               -> 201 { ok, reportId }  (rate limited)
 *   POST /api/safety/block                -> { ok, alreadyBlocked }
 *   POST /api/safety/unblock              -> { ok }
 *   POST /api/safety/unmatch              -> { ok, unmatchedCount }
 *   GET  /api/safety/admin/reports        -> { reports, openCount }   (admin only)
 *   POST /api/safety/admin/reports/:id/resolve -> { ok }              (admin only)
 *   POST /api/safety/admin/reports/:id/action  -> { ok }              (admin only)
 *   GET  /api/safety/admin/audit          -> { entries }              (admin only)
 *
 * POSTs require a same-site Origin/Referer (CSRF). GETs are safe (no state
 * change). Admin endpoints use requireAdmin() — unauthenticated 401,
 * non-admin 403, NO client-side gating anywhere. Report submissions are rate
 * limited per user (5/hour); block/unmatch 10/hour. Every response is
 * controlled JSON; DB failures degrade to an honest 503.
 */
import { getSessionUser } from "./src/lib/auth/session";
import { requireAdmin } from "./src/lib/auth/authz";
import { assertSameOrigin } from "./src/lib/auth/csrf";
import { rateLimit } from "./src/lib/auth/rate-limit";
import { sql } from "./src/db";
import {
  createReport,
  blockUser,
  unblockUser,
  unmatchUser,
  relationStatus,
  adminListReports,
  adminResolveReport,
  adminActOnReport,
  adminAuditLog,
} from "./src/lib/safety-core";

const NO_STORE = "no-store, max-age=0, must-revalidate";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": NO_STORE },
  });
}

function badJson(message: string, status = 400): Response {
  return json({ ok: false, error: message }, status);
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

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Session user + is_test parity (like match-api-handler). */
async function sessionWithTest(request: Request): Promise<{ id: number; isTest: boolean } | null> {
  const user = await getSessionUser(request).catch(() => null);
  if (!user) return null;
  try {
    const [rows] = await sql()`SELECT is_test FROM users WHERE id = ${user.id}`;
    return { id: user.id, isTest: !!((rows as any)?.is_test) };
  } catch {
    return { id: user.id, isTest: false };
  }
}

export async function handleSafetyApi(request: Request): Promise<Response> {
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return badJson("bad request", 400);
  }

  // ── Admin: reports queue ──────────────────────────────────────────────────
  if (pathname === "/api/safety/admin/reports" && request.method === "GET") {
    const auth = await requireAdmin(request);
    if (!auth.ok) return json({ error: auth.code, message: auth.message }, auth.status);
    try {
      const reports = await adminListReports();
      const openCount = reports.filter((r) => r.status === "open" || r.status === "reviewing").length;
      return json({ reports, openCount });
    } catch (err) {
      console.error("[safety-api] admin reports failed", err);
      return json({ error: "DB_UNAVAILABLE", message: "We couldn't load the moderation queue right now." }, 503);
    }
  }

  // ── Admin: audit trail ────────────────────────────────────────────────────
  if (pathname === "/api/safety/admin/audit" && request.method === "GET") {
    const auth = await requireAdmin(request);
    if (!auth.ok) return json({ error: auth.code, message: auth.message }, auth.status);
    try {
      return json({ entries: await adminAuditLog() });
    } catch (err) {
      console.error("[safety-api] admin audit failed", err);
      return json({ error: "DB_UNAVAILABLE", message: "We couldn't load the audit trail right now." }, 503);
    }
  }

  // ── Admin: resolve / dismiss report (POST /api/safety/admin/reports/:id/resolve) ──
  const resolveMatch = pathname.match(/^\/api\/safety\/admin\/reports\/(\d+)\/resolve$/);
  if (resolveMatch) {
    if (request.method !== "POST") return badJson("POST required", 405);
    const csrf = assertSameOrigin(request);
    if (!csrf.ok) return json({ ok: false, error: csrf.error }, 403);
    const auth = await requireAdmin(request);
    if (!auth.ok) return json({ error: auth.code, message: auth.message }, auth.status);
    const body = await readBody(request);
    const result = await adminResolveReport(
      auth.user.id,
      Number(resolveMatch[1]),
      String(body.outcome ?? ""),
      String(body.note ?? ""),
    );
    if (!result.ok) return json({ ok: false, error: result.error }, result.status);
    return json({ ok: true });
  }

  // ── Admin: punitive action (POST /api/safety/admin/reports/:id/action) ────
  const actionMatch = pathname.match(/^\/api\/safety\/admin\/reports\/(\d+)\/action$/);
  if (actionMatch) {
    if (request.method !== "POST") return badJson("POST required", 405);
    const csrf = assertSameOrigin(request);
    if (!csrf.ok) return json({ ok: false, error: csrf.error }, 403);
    const auth = await requireAdmin(request);
    if (!auth.ok) return json({ error: auth.code, message: auth.message }, auth.status);
    const body = await readBody(request);
    const result = await adminActOnReport(
      auth.user.id,
      Number(actionMatch[1]),
      String(body.action ?? ""),
      String(body.note ?? ""),
    );
    if (!result.ok) return json({ ok: false, error: result.error }, result.status);
    return json({ ok: true });
  }

  // ── Everything else requires an authenticated session ─────────────────────
  const session = await sessionWithTest(request);
  if (!session) {
    return json({ error: "UNAUTHENTICATED", message: "Please log in to continue." }, 401);
  }

  // ── Relation status (GET, never mutates) ──────────────────────────────────
  if (pathname === "/api/safety/status" && request.method === "GET") {
    const url = new URL(request.url);
    const otherUserId = num(url.searchParams.get("userId"));
    if (otherUserId === null) return badJson("userId is required");
    const result = await relationStatus(session.id, session.isTest, otherUserId);
    if (!result.ok) return json({ ok: false, error: result.error }, result.status);
    return json({ ok: true, blockedByMe: result.rel.blockedByMe, blockedMe: result.rel.blockedMe, matchState: result.rel.matchState });
  }

  // ── Report (POST, rate limited 5/hour per user) ───────────────────────────
  if (pathname === "/api/safety/report" && request.method === "POST") {
    const csrf = assertSameOrigin(request);
    if (!csrf.ok) return json({ ok: false, error: csrf.error }, 403);
    const rl = await rateLimit("report", `u${session.id}`);
    if (rl.limited) {
      return json({ ok: false, error: "RATE_LIMITED", message: "Too many reports — please try again later." }, 429);
    }
    const body = await readBody(request);
    try {
      const result = await createReport(session.id, session.isTest, {
        targetType: body.targetType ?? body.target_type,
        targetId: body.targetId ?? body.target_id,
        category: body.category,
        details: body.details,
      });
      if (!result.ok) return json({ ok: false, error: result.error }, result.status);
      return json({ ok: true, reportId: result.reportId }, 201);
    } catch (err) {
      console.error("[safety-api] report failed", err);
      return json({ ok: false, error: "DB_UNAVAILABLE", message: "We couldn't save your report right now." }, 503);
    }
  }

  // ── Block / unblock / unmatch (POST, rate limited 10/hour per user) ───────
  if (pathname === "/api/safety/block" || pathname === "/api/safety/unblock" || pathname === "/api/safety/unmatch") {
    if (request.method !== "POST") return badJson("POST required", 405);
    const csrf = assertSameOrigin(request);
    if (!csrf.ok) return json({ ok: false, error: csrf.error }, 403);
    const rl = await rateLimit(pathname === "/api/safety/block" ? "block" : "unmatch", `u${session.id}`);
    if (rl.limited) {
      return json({ ok: false, error: "RATE_LIMITED", message: "Too many requests — please try again later." }, 429);
    }
    const body = await readBody(request);
    const userId = num(body.userId ?? body.user_id);
    if (userId === null) return badJson("userId is required");
    try {
      if (pathname === "/api/safety/block") {
        const result = await blockUser(session.id, session.isTest, userId);
        if (!result.ok) return json({ ok: false, error: result.error }, result.status);
        return json({ ok: true, alreadyBlocked: result.alreadyBlocked });
      }
      if (pathname === "/api/safety/unblock") {
        const result = await unblockUser(session.id, userId);
        if (!result.ok) return json({ ok: false, error: result.error }, result.status);
        return json({ ok: true });
      }
      const result = await unmatchUser(session.id, session.isTest, userId);
      if (!result.ok) return json({ ok: false, error: result.error }, result.status);
      return json({ ok: true, unmatchedCount: result.unmatchedCount });
    } catch (err) {
      console.error("[safety-api] block/unmatch failed", err);
      return json({ ok: false, error: "DB_UNAVAILABLE", message: "We couldn't process this request right now." }, 503);
    }
  }

  return badJson("Not found", 404);
}
