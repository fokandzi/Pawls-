// PLATFORM-ONLY: runtime for the shared workspace server on port 3000.
// This is not used by Vercel; go-live.sh deploys vercel-entry.ts instead.
// The TanStack Start build emits a portable
// fetch handler (dist/server/server.js) plus static client assets (dist/client);
// this wraps them in a Bun server on port 3000 — static files first, SSR for the
// rest. Run `bun run build` before starting. Restart it with `bun run publish`.
//
// Starting a new instance supersedes the old one: it frees the port no matter
// which user owns the current server (provisioning starts it as `engine`; a team
// member's `bun run publish` runs as their own user), so publish never collides
// with an already-running server. Every sandbox user has passwordless sudo, so
// the takeover works across user boundaries.
import handler from "./dist/server/server.js";
import { handleStripeWebhook } from "./webhook-handler.ts";
import { handleRegisterPost } from "./register-handler.ts";
import { handleMatchCreatePost } from "./dog-profile-handler.ts";
import { handleWaitlistPost } from "./waitlist-handler.ts";

// Pinned, NOT read from the environment. The published preview URL
// (<label>.<PUBLIC_SITE_DOMAIN>) is reverse-proxied to 0.0.0.0:3000 inside the
// sandbox, so the default site MUST bind there. Bun auto-loads .env files, so
// honouring process.env.PORT/HOST would let a stray env var or a .env in the site
// dir silently move the site off :3000 (or onto loopback) and break the public URL.
const PORT = 3000;
const HOST = "0.0.0.0";
const CLIENT_DIR = `${import.meta.dir}/dist/client`;

// Free PORT regardless of which user owns the current listener. lsof runs under
// sudo so it can see (and the kill can signal) a process owned by another user;
// the loop waits for the socket to actually release before we bind.
const freePort =
  `for _ in $(seq 1 25); do ` +
  `pids=$(lsof -t -iTCP:${String(PORT)} -sTCP:LISTEN 2>/dev/null || true); ` +
  `if [ -z "$pids" ]; then exit 0; fi; ` +
  `kill $pids 2>/dev/null || true; sleep 0.2; ` +
  `done`;

// Take over the port, re-freeing and retrying if another publish grabbed it in the
// gap between freeing and binding (last publish wins). Bun.serve throws EADDRINUSE
// synchronously, so without this a raced publish would die while the shell already
// reported success.
for (let attempt = 1; ; attempt++) {
  await Bun.$`sudo sh -c ${freePort}`.quiet().nothrow();
  try {
    Bun.serve({
      port: PORT,
      hostname: HOST,
      async fetch(req) {
        const { pathname } = new URL(req.url);

        // Native POST /register — sign-up form posts here. Must be handled
        // before the SSR handler (which would render HTML for it instead).
        if (req.method === "POST" && pathname === "/register") {
          return handleRegisterPost(req);
        }

        // Native POST /match/create — dog profile form posts here. Handled
        // before the SSR handler, same as POST /register.
        if (req.method === "POST" && pathname === "/match/create") {
          return handleMatchCreatePost(req);
        }

        // Native POST /api/waitlist — landing-page waitlist form posts here.
        if (req.method === "POST" && pathname === "/api/waitlist") {
          return handleWaitlistPost(req);
        }

        // Intercept Stripe webhook requests before the SSR handler.
        // TanStack Start SSR renders HTML for all routes including API routes,
        // so we handle webhooks at the Bun server level.
        if (
          req.method === "POST" &&
          (pathname === "/api/webhooks/stripe" || pathname === "/api/stripe-webhook")
        ) {
          return handleStripeWebhook(req);
        }

        if (pathname !== "/") {
          const file = Bun.file(CLIENT_DIR + pathname);
          if (await file.exists()) return new Response(file);
        }
        return (
          handler as { fetch: (r: Request) => Response | Promise<Response> }
        ).fetch(req);
      },
    });
    break;
  } catch (err) {
    if (attempt >= 10) throw err;
    await Bun.sleep(200);
  }
}

console.log(`team-site serving on http://${HOST}:${String(PORT)}`);
