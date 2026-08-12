/**
 * CSRF protection for state-changing POSTs.
 *
 * Strategy: origin/referer allowlist check + SameSite=Lax cookies (set in
 * session.ts). Browsers always send an Origin header on POST; we accept the
 * request when the origin matches the site's own host or the known allowlist.
 * Requests with no Origin AND no Referer are rejected (they are not
 * browser-initiated same-site submissions).
 */
const ALLOWED_ORIGIN_HOSTS = new Set(["pawls.club", "www.pawls.club"]);

export function csrfError(request: Request): string | null {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const source = origin ?? referer;
  if (!source) {
    return "Missing Origin/Referer header — this request cannot be verified as same-site.";
  }
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    return "Malformed Origin/Referer header.";
  }
  const sourceHost = parsed.host.toLowerCase();
  if (ALLOWED_ORIGIN_HOSTS.has(sourceHost)) return null;
  if (parsed.protocol === "http:" && (sourceHost === "localhost:3000" || sourceHost === "127.0.0.1:3000")) {
    return null;
  }
  // Same-origin check: the Origin host must match the request's own Host header
  // (covers preview domains and any future custom domains).
  const host = request.headers.get("host");
  if (host && sourceHost === host.toLowerCase()) return null;
  return "Cross-site request blocked (origin not allowed).";
}

/** Returns true when the request passed the same-site check (safe to proceed). */
export function assertSameOrigin(request: Request): { ok: true } | { ok: false; error: string } {
  const error = csrfError(request);
  return error ? { ok: false, error } : { ok: true };
}
