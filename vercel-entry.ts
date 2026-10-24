// Vercel Build Output API function entry.
//
// The Build Output Node launcher invokes the default export as a classic Node
// `(req, res)` handler — NOT a web handler. TanStack Start emits a portable web
// fetch handler (dist/server/server.js), so we adapt: Node IncomingMessage → web
// Request, run the fetch handler, stream the web Response back onto ServerResponse.
// Node 22 has global Request/Response/Headers/ReadableStream.
//
// Bundled (with its deps + the SSR handler's dynamic ./assets chunks) into
// .vercel/output/functions/render.func/index.mjs by build-vercel.sh.
import type { IncomingMessage, ServerResponse } from "node:http";

import handler from "./dist/server/server.js";
import { handleRegisterPost } from "./register-handler.ts";
import { handleAuthPost } from "./src/auth-handler.ts";
import { handleMatchCreatePost } from "./dog-profile-handler.ts";
import { handleMatchApi } from "./match-api-handler.ts";
import { handleSafetyApi } from "./safety-api-handler.ts";
import { handleProvidersApi } from "./provider-api-handler.ts";
import { handleBookingApi } from "./booking-api-handler.ts";
import { handleWaitlistPost } from "./waitlist-handler.ts";
import { handleHealthRequest } from "./src/lib/health.ts";
import { guardPageRequest } from "./src/lib/auth/page-guard.ts";

const fetchHandler = handler as {
  fetch: (request: Request) => Response | Promise<Response>;
};

const toWebRequest = (req: IncomingMessage): Request => {
  const host = req.headers.host ?? "localhost";
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const url = `${proto}://${host}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else if (value != null) headers.set(key, value);
  }
  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(url, {
    method,
    headers,
    ...(hasBody
      ? { body: req as unknown as ReadableStream, duplex: "half" }
      : {}),
  } as RequestInit);
};

export default async function vercelHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const request = toWebRequest(req);

    // GET /health — anonymous, minimal, truthful (batch E seed): DB reachability
    // + whether photo storage is really configured. Pre-SSR so a probe never
    // pays for a React render.
    if (new URL(request.url).pathname === "/health") {
      const healthRes = await handleHealthRequest(request);
      res.statusCode = healthRes.status;
      healthRes.headers.forEach((value, key) => res.setHeader(key, value));
      if (healthRes.body) {
        const reader = healthRes.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
      return;
    }

    // Page-level access guards that must answer with a real status BEFORE the
    // SSR render: /settings (anon → 302 /login) and /admin/* (anon → 302,
    // non-admin → 404). See src/lib/auth/page-guard.ts.
    {
      const guarded = await guardPageRequest(request);
      if (guarded) {
        res.statusCode = guarded.status;
        guarded.headers.forEach((value, key) => res.setHeader(key, value));
        if (guarded.body) {
          const reader = guarded.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        }
        res.end();
        return;
      }
    }

    // Native auth endpoints (POST /auth/*, GET /auth/me) — handled pre-SSR.
    if (
      (request.method === "POST" && new URL(request.url).pathname.startsWith("/auth/")) ||
      (request.method === "POST" && new URL(request.url).pathname === "/api/auth/resend-verification") ||
      (request.method === "GET" && new URL(request.url).pathname === "/auth/me")
    ) {
      const authRes = await handleAuthPost(request);
      res.statusCode = authRes.status;
      authRes.headers.forEach((value, key) => res.setHeader(key, value));
      if (authRes.body) {
        const reader = authRes.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
      return;
    }
    if (request.method === "POST" && new URL(request.url).pathname === "/register") {
      const registerRes = await handleRegisterPost(request);
      res.statusCode = registerRes.status;
      registerRes.headers.forEach((value, key) => res.setHeader(key, value));
      if (registerRes.body) {
        const reader = registerRes.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
      return;
    }

    // Native POST /match/create — dog profile form posts here. Handle it before
    // the SSR handler, same pattern as POST /register.
    if (request.method === "POST" && new URL(request.url).pathname === "/match/create") {
      const createRes = await handleMatchCreatePost(request);
      res.statusCode = createRes.status;
      createRes.headers.forEach((value, key) => res.setHeader(key, value));
      if (createRes.body) {
        const reader = createRes.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
      return;
    }

    // Native POST /api/waitlist — landing-page waitlist form posts here.
    if (request.method === "POST" && new URL(request.url).pathname === "/api/waitlist") {
      const waitlistRes = await handleWaitlistPost(request);
      res.statusCode = waitlistRes.status;
      waitlistRes.headers.forEach((value, key) => res.setHeader(key, value));
      if (waitlistRes.body) {
        const reader = waitlistRes.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
      return;
    }
    // Real Match API (GET + POST /api/match/*) — handled pre-SSR.
    if (new URL(request.url).pathname.startsWith("/api/match/")) {
      const matchRes = await handleMatchApi(request);
      res.statusCode = matchRes.status;
      matchRes.headers.forEach((value, key) => res.setHeader(key, value));
      if (matchRes.body) {
        const reader = matchRes.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
      return;
    }
    // Safety/Admin API (GET + POST /api/safety/*) — handled pre-SSR.
    if (new URL(request.url).pathname.startsWith("/api/safety/")) {
      const safetyRes = await handleSafetyApi(request);
      res.statusCode = safetyRes.status;
      safetyRes.headers.forEach((value, key) => res.setHeader(key, value));
      if (safetyRes.body) {
        const reader = safetyRes.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
      return;
    }
    // Provider API (GET + POST /api/providers/*) — /book/register applications
    // (authenticated + throttled) and the admin-only approve/reject workflow.
    if (new URL(request.url).pathname.startsWith("/api/providers/")) {
      const providerRes = await handleProvidersApi(request);
      res.statusCode = providerRes.status;
      providerRes.headers.forEach((value, key) => res.setHeader(key, value));
      if (providerRes.body) {
        const reader = providerRes.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
      return;
    }

    // Booking API (GET/POST /api/bookings/*, POST /api/services/*) — Book MVP
    // core (batch D1): availability, booking create with the server-side 409 slot
    // guard, cancel/complete lifecycle, owner-bound service edits.
    {
      const bookingPath = new URL(request.url).pathname;
      if (
        bookingPath === "/api/bookings" ||
        bookingPath.startsWith("/api/bookings/") ||
        bookingPath.startsWith("/api/services/")
      ) {
        const bookingRes = await handleBookingApi(request);
        res.statusCode = bookingRes.status;
        bookingRes.headers.forEach((value, key) => res.setHeader(key, value));
        if (bookingRes.body) {
          const reader = bookingRes.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        }
        res.end();
        return;
      }
    }
    const webRes = await fetchHandler.fetch(request);
    res.statusCode = webRes.status;
    webRes.headers.forEach((value, key) => res.setHeader(key, value));
    // Never cache SSR responses. The match page is a URL-param state machine
    // (swipe state lives in the query string) — a stale HTML response is what
    // makes swipes appear to "cycle between 2 profiles". Static assets are
    // served by Vercel's filesystem handler, so everything reaching this
    // function is dynamic HTML or an API response. Also sets Cache-Control on
    // the browser side so back/forward and bfcache never resurrect old markup.
    res.setHeader("Cache-Control", "no-store, max-age=0, must-revalidate");
    if (webRes.body) {
      const reader = webRes.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (error) {
    // Log the detail server-side (captured by the host's function logs); never
    // return a stack trace to the public visitor of the site.
    console.error("[team-site] SSR request failed", error);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain");
    res.end("Internal Server Error");
  }
}
