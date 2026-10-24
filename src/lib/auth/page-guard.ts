/**
 * Pre-SSR page guards (P2, Phase 2B) — the pages that must never render a shell
 * for the wrong visitor.
 *
 * WHY PRE-SSR: the TanStack route loaders run *inside* the SSR render. A
 * `throw redirect()` there is honoured for client navigation, but the served
 * response for an anonymous GET is still a 200 shell (audit: /settings returned
 * 200, /admin/moderation returned 200 with the admin chrome for anonymous and
 * non-admin visitors). Deciding before the render is the only way to send a real
 * 302 — and it costs one session lookup, no React.
 *
 * Rules (deliberately small and explicit):
 *   /settings            anonymous → 302 /login
 *   /admin, /admin/*     anonymous → 302 /login
 *                        signed in but not `role='admin'` → 404 (the page's
 *                        existence is not advertised to non-admins; the admin
 *                        API already answers 403 on its own)
 *   everything else      → untouched (SSR as before)
 *
 * Identity comes from the session cookie only, and `role` from the users table —
 * never from a client-provided claim.
 */
import { getSessionUser } from "./session";

const NO_STORE = "no-store, max-age=0, must-revalidate";

function redirectToLogin(): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: "/login", "Cache-Control": NO_STORE },
  });
}

function notFoundPage(): Response {
  // FR-first, no data, no admin hints. Same status a genuinely unknown path gets.
  return new Response(
    '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Page introuvable — Pawls</title></head><body><p>Page introuvable.</p></body></html>',
    {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": NO_STORE },
    },
  );
}

/**
 * Returns a Response when the request must be intercepted before SSR,
 * or null when the normal SSR path should handle it.
 */
export async function guardPageRequest(request: Request): Promise<Response | null> {
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return null; // let the SSR layer deal with a malformed URL
  }
  const isSettings = pathname === "/settings";
  const isAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");
  if (!isSettings && !isAdminArea) return null;

  const user = await getSessionUser(request).catch(() => null);
  if (!user) return redirectToLogin();
  if (isAdminArea && user.role !== "admin") return notFoundPage();
  return null;
}
