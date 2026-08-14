/**
 * Sessions & cookies.
 *
 * - Opaque 32-byte random token (base64url) set in the `pawls_session` cookie:
 *   HttpOnly; Path=/; SameSite=Lax; Secure in production (or when the request
 *   arrived over https, e.g. via x-forwarded-proto on Vercel).
 * - Only SHA-256(token) is stored in `sessions.token_hash`.
 * - 30-day expiry with sliding renewal: when more than half the lifetime has
 *   elapsed, expires_at is pushed forward another 30 days.
 * - Session lookup is ALWAYS cookie → DB. Never from body/query params.
 * - Logout revokes (sets revoked_at). Deletion revokes all of a user's sessions.
 */
import { randomBytes, createHash } from "node:crypto";
import { sql } from "../../db";

export const SESSION_COOKIE = "pawls_session";
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Parse the cookie header for a given name. */
export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return part.slice(idx + 1).trim();
      }
    }
  }
  return null;
}

export function requestIsSecure(request: Request): boolean {
  if (process.env.NODE_ENV === "production") return true;
  const proto = request.headers.get("x-forwarded-proto");
  if (proto && proto.split(",")[0].trim() === "https") return true;
  return request.url.startsWith("https://");
}

export function sessionCookieHeader(token: string, secure: boolean, maxAgeSeconds = 86400): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Cookie that deletes the session cookie (and any legacy forgeable cookie). */
export function clearSessionCookieHeader(secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
  preferredLanguage: string | null;
  country: string | null;
  city: string | null;
  timezone: string | null;
}

/**
 * Look up the user behind a request's session cookie (cookie → DB only).
 * Renews the session (sliding expiry) and updates last_seen_at. Returns null
 * when there is no cookie, the session is revoked/expired, or the DB is down.
 */
export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = sha256Hex(token);
  try {
    const rows = await sql()`
      SELECT s.id AS session_id, s.expires_at, s.revoked_at,
             u.id, u.email, u.name, u.role, u.email_verified_at,
             u.preferred_language, u.country, u.city, u.timezone,
             u.suspended_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ${tokenHash}
      LIMIT 1
    `;
    const row = rows[0] as any;
    if (!row) return null;
    // Suspended accounts are inert: every session dies at the gate. This is
    // the enforcement side of the Safety phase's "suspend user" admin action
    // (users.suspended_at set by an admin; see migration 004 + safety-core).
    if (row.suspended_at) return null;
    const expiresAt = new Date(row.expires_at);
    if (row.revoked_at || expiresAt.getTime() <= Date.now()) {
      return null;
    }
    // Sliding renewal: if more than half the lifetime has elapsed, extend.
    const remaining = expiresAt.getTime() - Date.now();
    if (remaining < SESSION_LIFETIME_MS / 2) {
      await sql()`
        UPDATE sessions
        SET expires_at = NOW() + make_interval(secs => ${SESSION_LIFETIME_MS / 1000}),
            last_seen_at = NOW()
        WHERE id = ${row.session_id}
      `;
    } else {
      await sql()`UPDATE sessions SET last_seen_at = NOW() WHERE id = ${row.session_id}`;
    }
    return {
      id: Number(row.id),
      email: String(row.email),
      name: String(row.name),
      role: String(row.role ?? "user"),
      emailVerified: !!row.email_verified_at,
      preferredLanguage: row.preferred_language ? String(row.preferred_language) : null,
      country: row.country ? String(row.country) : null,
      city: row.city ? String(row.city) : null,
      timezone: row.timezone ? String(row.timezone) : null,
    };
  } catch (err) {
    console.error("[auth] session lookup failed", err);
    return null;
  }
}

export interface CreatedSession {
  token: string;
  cookieHeader: string;
}

/** Create a session row for a user and return the opaque token + cookie header. */
export async function createSession(
  request: Request,
  userId: number,
  extra: { ip?: string | null; userAgent?: string | null } = {},
): Promise<CreatedSession> {
  const token = newSessionToken();
  const tokenHash = sha256Hex(token);
  const secure = requestIsSecure(request);
  const ip = extra.ip ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = extra.userAgent ?? request.headers.get("user-agent") ?? null;
  await sql()`
    INSERT INTO sessions (user_id, token_hash, expires_at, last_seen_at, ip, user_agent)
    VALUES (${userId}, ${tokenHash}, NOW() + make_interval(secs => ${SESSION_LIFETIME_MS / 1000}), NOW(), ${ip}, ${userAgent})
  `;
  return { token, cookieHeader: sessionCookieHeader(token, secure, SESSION_LIFETIME_MS / 1000) };
}

/** Revoke a single session (logout). Returns true if a row was revoked. */
export async function revokeSession(request: Request): Promise<boolean> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return false;
  const tokenHash = sha256Hex(token);
  const rows = await sql()`
    UPDATE sessions SET revoked_at = NOW()
    WHERE token_hash = ${tokenHash} AND revoked_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

/** Revoke all sessions for a user EXCEPT the current one (password change). */
export async function revokeOtherSessions(request: Request, userId: number): Promise<void> {
  const token = getCookie(request, SESSION_COOKIE);
  const currentHash = token ? sha256Hex(token) : null;
  await sql()`
    UPDATE sessions SET revoked_at = NOW()
    WHERE user_id = ${userId} AND revoked_at IS NULL
    ${currentHash ? sql`AND token_hash <> ${currentHash}` : sql``}
  `;
}

/** Revoke every session for a user (password reset / account deletion). */
export async function revokeAllSessions(userId: number): Promise<void> {
  await sql()`
    UPDATE sessions SET revoked_at = NOW()
    WHERE user_id = ${userId} AND revoked_at IS NULL
  `;
}
