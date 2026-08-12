/**
 * Authorization helpers — identity comes from the authenticated session ONLY.
 * Never trust user_id/email/role claims from the client. No role claims from
 * the client: `role` is read from the users table; 'admin' is only ever set
 * server-side (e.g. via SQL).
 */
import { getSessionUser, type SessionUser } from "./session";

export type { SessionUser };

export type AuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; status: 401 | 403; code: string; message: string };

/** Resolve the authenticated user, or a 401/403 result. */
export async function requireUser(request: Request): Promise<AuthResult> {
  const user = await getSessionUser(request);
  if (!user) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHENTICATED",
      message: "Please log in to continue.",
    };
  }
  return { ok: true, user };
}

/** Admin-only gate. `role` must come from the DB ('admin' set server-side only). */
export async function requireAdmin(request: Request): Promise<AuthResult> {
  const base = await requireUser(request);
  if (!base.ok) return base;
  if (base.user.role !== "admin") {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      message: "You do not have permission to do this.",
    };
  }
  return base;
}

/** Convenience for SSR loaders: session user or null (no Response machinery). */
export async function getAuthUser(request: Request): Promise<SessionUser | null> {
  return getSessionUser(request);
}
