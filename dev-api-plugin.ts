/**
 * Fix: /match (and all native auth/match/safety/waitlist API routes) 404/500 on
 * the Vite DEV server because the native pre-SSR handlers (handleAuthPost,
 * handleMatchApi, handleSafetyApi, handleWaitlistPost, handleRegisterPost,
 * handleMatchCreatePost) were wired ONLY into the production servers
 * (serve.ts for local `bun run start`, vercel-entry.ts for Vercel). The Vite
 * dev server (`vite dev`, the platform-working-site hot-reload server) had
 * none of them, so every `fetch("/api/match/*")` fell through to the SSR HTML
 * handler and returned an HTML shell (404) / mismatch — /match was broken in
 * dev.
 *
 * This plugin registers the same handlers into Vite's dev connect middleware
 * so dev behaves exactly like prod. It runs BEFORE the TanStack SSR handler.
 *
 * Type note: Vite's Connect request/response types differ from Bun's web
 * Request/Response, so we bridge via the pass-through helper below (the same
 * pattern vercel-entry.ts already uses).
 */
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleRegisterPost } from "./register-handler.ts";
import { handleAuthPost } from "./src/auth-handler.ts";
import { handleMatchCreatePost } from "./dog-profile-handler.ts";
import { handleMatchApi } from "./match-api-handler.ts";
import { handleSafetyApi } from "./safety-api-handler.ts";
import { handleProvidersApi } from "./provider-api-handler.ts";
import { handleBookingApi } from "./booking-api-handler.ts";
import { handleWaitlistPost } from "./waitlist-handler.ts";

const toWebRequest = (req: IncomingMessage): Request => {
  const host = req.headers.host ?? "localhost";
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
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
    ...(hasBody ? { body: req as unknown as ReadableStream, duplex: "half" } : {}),
  } as RequestInit);
};

async function writeResponse(res: ServerResponse, web: Response) {
  res.statusCode = web.status;
  web.headers.forEach((value, key) => res.setHeader(key, value));
  const body = await web.arrayBuffer();
  res.end(Buffer.from(body));
}

export function devApiPlugin(): Plugin {
  return {
    name: "pawls-dev-native-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const pathname = url.pathname;
        let handled = false;
        const run = async () => {
          if (handled) return;
          handled = true;
          let web: Response;
          try {
            if (req.method === "POST" && pathname === "/register") {
              web = await handleRegisterPost(toWebRequest(req));
            } else if (
              (req.method === "POST" && pathname.startsWith("/auth/")) ||
              (req.method === "POST" && pathname === "/api/auth/resend-verification") ||
              (req.method === "GET" && pathname === "/auth/me")
            ) {
              web = await handleAuthPost(toWebRequest(req));
            } else if (req.method === "POST" && pathname === "/match/create") {
              web = await handleMatchCreatePost(toWebRequest(req));
            } else if (pathname.startsWith("/api/match/")) {
              web = await handleMatchApi(toWebRequest(req));
            } else if (pathname.startsWith("/api/safety/")) {
              web = await handleSafetyApi(toWebRequest(req));
            } else if (pathname.startsWith("/api/providers/")) {
              web = await handleProvidersApi(toWebRequest(req));
            } else if (
              pathname === "/api/bookings" ||
              pathname.startsWith("/api/bookings/") ||
              pathname.startsWith("/api/services/")
            ) {
              web = await handleBookingApi(toWebRequest(req));
            } else if (req.method === "POST" && pathname === "/api/waitlist") {
              web = await handleWaitlistPost(toWebRequest(req));
            } else {
              handled = false;
              next();
              return;
            }
          } catch (err) {
            console.error("[dev-api-plugin] handler error", err);
            if (!res.headersSent) res.statusCode = 500;
            res.end();
            return;
          }
          await writeResponse(res, web);
        };
        run();
      });
    },
  };
}
