/**
 * Real Match — native HTTP API (pre-SSR, wired in serve.ts AND vercel-entry.ts,
 * same proven pattern as auth-handler.ts). All state-changing Match endpoints
 * run here so identity always comes from the session cookie, never the client.
 *
 * Endpoints:
 *   GET  /api/match/mine        -> { user: {id, email, lang, isTest}, dogs: [...] }
 *   GET  /api/match/discovery   -> { dogs: [...], count }
 *   GET  /api/match/matches     -> { matches: [...] }
 *   POST /api/match/swipe       -> { ok, matchCreated, matchId, duplicate, error? }
 *   POST /api/match/dog/edit    -> { ok, error? }   (JSON or form-encoded)
 *   POST /api/match/dog/delete  -> { ok, error? }   (JSON or form-encoded)
 *   POST /api/match/lang        -> { ok, error? }   (JSON or form-encoded)
 *
 * POSTs require a same-site Origin/Referer (CSRF). GETs are safe (no state
 * change). Every response is controlled JSON; DB failures degrade to an honest
 * 503 { error } — never an uncontrolled 500 page.
 */
import { getSessionUser } from "./src/lib/auth/session";
import { assertSameOrigin } from "./src/lib/auth/csrf";
import { sql } from "./src/db";
import {
  discoveryCandidates,
  matchesForUser,
  recordSwipe,
  editDog,
  deleteDog,
  setUserLanguage,
  getMyDogs,
} from "./src/lib/match-core";
import {
  getOrCreateConversation,
  conversationsForUser,
  conversationView,
  sendMessage,
  markConversationRead,
} from "./src/lib/message-core";

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

export async function handleMatchApi(request: Request): Promise<Response> {
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return badJson("bad request", 400);
  }

  const sessionUser = await getSessionUser(request).catch(() => null);
  const authed = !!sessionUser;

  switch (pathname) {
    case "/api/match/mine": {
      if (!sessionUser) return json({ user: null, dogs: [] });
      const dogs = await getMyDogs(sessionUser.id).catch(() => []);
      return json({
        user: {
          id: sessionUser.id,
          email: sessionUser.email,
          lang: sessionUser.preferredLanguage === "en" ? "en" : "fr",
          isTest: false, // SessionUser has no is_test; core reads it from DB when needed
        },
        dogs,
      });
    }

    case "/api/match/discovery": {
      if (!sessionUser) return json({ error: "UNAUTHENTICATED", message: "Please log in to continue." }, 401);
      try {
        const [isTestRows] = await sql()`SELECT is_test FROM users WHERE id = ${sessionUser.id}`;
        const isTest = !!((isTestRows as any)?.is_test);
        const dogs = await discoveryCandidates(sessionUser.id, isTest);
        return json({ dogs, count: dogs.length });
      } catch (err) {
        console.error("[match-api] discovery failed", err);
        return json({ error: "DB_UNAVAILABLE", message: "We couldn't load the discovery feed right now. Please try again in a moment." }, 503);
      }
    }

    case "/api/match/matches": {
      if (!sessionUser) return json({ error: "UNAUTHENTICATED", message: "Please log in to continue." }, 401);
      try {
        const [isTestRows] = await sql()`SELECT is_test FROM users WHERE id = ${sessionUser.id}`;
        const isTest = !!((isTestRows as any)?.is_test);
        const matches = await matchesForUser(sessionUser.id, isTest);
        return json({ matches });
      } catch (err) {
        console.error("[match-api] matches failed", err);
        return json({ error: "DB_UNAVAILABLE", message: "We couldn't load your matches right now. Please try again in a moment." }, 503);
      }
    }

    case "/api/match/swipe": {
      if (request.method !== "POST") return badJson("POST required", 405);
      const csrf = assertSameOrigin(request);
      if (!csrf.ok) return json({ ok: false, error: csrf.error }, 403);
      if (!sessionUser) return json({ ok: false, error: "UNAUTHENTICATED", message: "Please log in to continue." }, 401);
      const body = await readBody(request);
      const targetDogId = num(body.targetDogId ?? body.target);
      const direction = String(body.direction ?? "").trim();
      if (targetDogId === null) return badJson("targetDogId is required");
      try {
        const [isTestRows] = await sql()`SELECT is_test FROM users WHERE id = ${sessionUser.id}`;
        const isTest = !!((isTestRows as any)?.is_test);
        const result = await recordSwipe(sessionUser.id, isTest, targetDogId, direction);
        if (!result.ok) return json(result, result.status);
        return json({ ok: true, matchCreated: result.matchCreated, matchId: result.matchId, duplicate: result.duplicate });
      } catch (err) {
        console.error("[match-api] swipe failed", err);
        return json({ ok: false, error: "DB_UNAVAILABLE", message: "We couldn't record your swipe right now." }, 503);
      }
    }

    case "/api/match/dog/edit": {
      if (request.method !== "POST") return badJson("POST required", 405);
      const csrf = assertSameOrigin(request);
      if (!csrf.ok) return json({ ok: false, error: csrf.error }, 403);
      if (!sessionUser) return json({ ok: false, error: "UNAUTHENTICATED", message: "Please log in to continue." }, 401);
      const body = await readBody(request);
      const dogId = num(body.dogId);
      if (dogId === null) return badJson("dogId is required");
      try {
        const result = await editDog(sessionUser.id, dogId, body);
        if (!result.ok) return json({ ok: false, error: result.error }, result.status);
        const next = String(body.next ?? "").trim();
        if (next && next.startsWith("/")) return new Response(null, { status: 302, headers: { Location: next, "Cache-Control": NO_STORE } });
        return json({ ok: true });
      } catch (err) {
        console.error("[match-api] dog edit failed", err);
        return json({ ok: false, error: "DB_UNAVAILABLE", message: "We couldn't save your changes right now." }, 503);
      }
    }

    case "/api/match/dog/delete": {
      if (request.method !== "POST") return badJson("POST required", 405);
      const csrf = assertSameOrigin(request);
      if (!csrf.ok) return json({ ok: false, error: csrf.error }, 403);
      if (!sessionUser) return json({ ok: false, error: "UNAUTHENTICATED", message: "Please log in to continue." }, 401);
      const body = await readBody(request);
      const dogId = num(body.dogId);
      if (dogId === null) return badJson("dogId is required");
      if (String(body.confirm ?? "") !== "1") return badJson("confirmation required");
      try {
        const result = await deleteDog(sessionUser.id, dogId);
        if (!result.ok) return json({ ok: false, error: result.error }, result.status);
        const next = String(body.next ?? "").trim();
        if (next && next.startsWith("/")) return new Response(null, { status: 302, headers: { Location: next, "Cache-Control": NO_STORE } });
        return json({ ok: true });
      } catch (err) {
        console.error("[match-api] dog delete failed", err);
        return json({ ok: false, error: "DB_UNAVAILABLE", message: "We couldn't delete this profile right now." }, 503);
      }
    }

    case "/api/match/lang": {
      if (request.method !== "POST") return badJson("POST required", 405);
      const csrf = assertSameOrigin(request);
      if (!csrf.ok) return json({ ok: false, error: csrf.error }, 403);
      if (!sessionUser) return json({ ok: false, error: "UNAUTHENTICATED", message: "Please log in to continue." }, 401);
      const body = await readBody(request);
      const lang = String(body.lang ?? "").trim();
      try {
        const ok = await setUserLanguage(sessionUser.id, lang);
        if (!ok) return badJson("lang must be 'fr' or 'en'");
        const next = String(body.next ?? "").trim();
        if (next && (next.startsWith("/") || next.startsWith("http://localhost:3000") || next.startsWith("https://pawls.club"))) {
          const target = next.startsWith("http") ? new URL(next).pathname + new URL(next).search : next;
          return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": NO_STORE } });
        }
        return json({ ok: true, lang });
      } catch (err) {
        console.error("[match-api] lang failed", err);
        return json({ ok: false, error: "DB_UNAVAILABLE" }, 503);
      }
    }

    // ── Messaging: conversation list (GET only; never mutates) ───────────
    case "/api/match/conversations": {
      if (request.method !== "GET") return badJson("GET required", 405);
      if (!sessionUser) return json({ error: "UNAUTHENTICATED", message: "Please log in to continue." }, 401);
      try {
        const [isTestRows] = await sql()`SELECT is_test FROM users WHERE id = ${sessionUser.id}`;
        const isTest = !!((isTestRows as any)?.is_test);
        const conversations = await conversationsForUser(sessionUser.id, isTest);
        return json({ conversations });
      } catch (err) {
        console.error("[match-api] conversations failed", err);
        return json({ error: "DB_UNAVAILABLE", message: "We couldn't load your conversations right now. Please try again in a moment." }, 503);
      }
    }

    // ── Messaging: start (get-or-create) a conversation with a matched user ──
    case "/api/match/conversations/start": {
      if (request.method !== "POST") return badJson("POST required", 405);
      const csrf = assertSameOrigin(request);
      if (!csrf.ok) return json({ ok: false, error: csrf.error }, 403);
      if (!sessionUser) return json({ ok: false, error: "UNAUTHENTICATED", message: "Please log in to continue." }, 401);
      const body = await readBody(request);
      const otherUserId = num(body.otherUserId ?? body.userId);
      if (otherUserId === null) return badJson("otherUserId is required");
      try {
        const [isTestRows] = await sql()`SELECT is_test FROM users WHERE id = ${sessionUser.id}`;
        const isTest = !!((isTestRows as any)?.is_test);
        const result = await getOrCreateConversation(sessionUser.id, isTest, otherUserId);
        if (!result.ok) return json(result, result.status);
        return json({ ok: true, conversationId: result.conversationId });
      } catch (err) {
        console.error("[match-api] conversation start failed", err);
        return json({ ok: false, error: "DB_UNAVAILABLE", message: "We couldn't start this conversation right now." }, 503);
      }
    }

    default: {
      // ── Messaging: conversation view / send / mark-read (id-based) ──────
      const convMatch = pathname.match(/^\/api\/match\/conversations\/(\d+)$/);
      const msgMatch = pathname.match(/^\/api\/match\/conversations\/(\d+)\/messages$/);
      const readMatch = pathname.match(/^\/api\/match\/conversations\/(\d+)\/read$/);
      const conversationId = (convMatch ?? msgMatch ?? readMatch)?.[1]
        ? Number((convMatch ?? msgMatch ?? readMatch)![1])
        : null;

      if (conversationId === null) return badJson("Not found", 404);
      if (!sessionUser) return json({ error: "UNAUTHENTICATED", message: "Please log in to continue." }, 401);

      try {
        const [isTestRows] = await sql()`SELECT is_test FROM users WHERE id = ${sessionUser.id}`;
        const isTest = !!((isTestRows as any)?.is_test);
        void isTest; // membership gates below are user-level (test parity is enforced at creation)

        if (convMatch && request.method === "GET") {
          const view = await conversationView(sessionUser.id, conversationId);
          if (!view) return json({ error: "NOT_FOUND", message: "Conversation not found." }, 404);
          return json(view);
        }

        if (msgMatch && request.method === "POST") {
          const csrf = assertSameOrigin(request);
          if (!csrf.ok) return json({ ok: false, error: csrf.error }, 403);
          const body = await readBody(request);
          const result = await sendMessage(sessionUser.id, conversationId, body.body, body.senderProfileId);
          if (!result.ok) return json({ ok: false, error: result.error }, result.status);
          return json({ ok: true, message: result.message });
        }

        if (readMatch && request.method === "POST") {
          const csrf = assertSameOrigin(request);
          if (!csrf.ok) return json({ ok: false, error: csrf.error }, 403);
          const result = await markConversationRead(sessionUser.id, conversationId);
          if (!result.ok) return json({ ok: false, error: result.error }, result.status);
          return json({ ok: true, readCount: result.readCount });
        }

        return badJson("Method not allowed", 405);
      } catch (err) {
        console.error("[match-api] conversation request failed", err);
        return json({ error: "DB_UNAVAILABLE", message: "We couldn't process this request right now." }, 503);
      }
    }
  }
}

/** Convenience: current user + isTest, or null. Used by SSR pages that need it. */
export async function matchSessionInfo(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return null;
  try {
    const [row] = await sql()`SELECT is_test FROM users WHERE id = ${user.id}`;
    return { id: user.id, lang: user.preferredLanguage === "en" ? "en" : "fr", isTest: !!((row as any)?.is_test) };
  } catch {
    return { id: user.id, lang: user.preferredLanguage === "en" ? "en" : "fr", isTest: false };
  }
}
