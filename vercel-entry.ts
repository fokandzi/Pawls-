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
import { handleAuthPost } from "./src/auth-handler.ts";
import { handleMatchCreatePost } from "./dog-profile-handler.ts";
import { handleWaitlistPost } from "./waitlist-handler.ts";

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

    // Native POST /register — sign-up form posts here. Handle it before the SSR
    // handler (which would render HTML for it instead) and before the generic
    // Cache-Control override below, since the redirect must stay no-store.
    // Native auth endpoints (POST /auth/*, GET /auth/me) — handled pre-SSR.
    if (
      (request.method === "POST" && new URL(request.url).pathname.startsWith("/auth/")) ||
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
    // Native auth endpoints (POST /auth/*, GET /auth/me) — handled pre-SSR.
    if (
      (request.method === "POST" && new URL(request.url).pathname.startsWith("/auth/")) ||
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
