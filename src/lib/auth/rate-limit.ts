/**
 * DB-backed rate limiting (works across serverless instances).
 *
 * Limits (configurable):
 *   login:                5 / 15 min per email+IP        ('login')
 *   register:             5 / 1 hour per IP              ('register')
 *   verify/reset-token:   10 / 1 hour per IP+token       ('verify-token' | 'reset-token')
 *   reset-request:        3 / 1 hour per email           ('reset-request')
 *   resend-verification:  5 / 1 hour per IP              ('resend-verification')
 *   provider-register:    5 / 1 hour per IP              ('provider-register')
 *   login-account:        20 / 15 min per email          ('login-account')
 *   report:               5 / 1 hour per user            ('report')
 *   block / unblock / unmatch: 10 / 1 hour per user, one bucket each
 *   conversation-start:   20 / 1 hour per user           ('conversation-start')
 *   message-send:         60 / 10 min per user           ('message-send')
 *   booking-create:       10 / 1 hour per user           ('booking-create')
 *
 * Every action a caller uses MUST be listed below: an unlisted action silently
 * falls back to 5/hour, which is how block/unmatch ran at 5/hour while
 * safety-api-handler documented 10/hour.
 *
 * 'login-account' caps guesses against ONE account across rotating IPs (the
 * email+IP key alone does not); the cost is that a flood can make that
 * account's logins wait out the 15-minute window.
 *
 * Exceeded calls return { limited: true, retryAfterSeconds } so callers can
 * respond 429 with a Retry-After header. Old windows are cleaned up
 * opportunistically on each call.
 */
import { sql } from "../../db";

export interface RateLimitResult {
  limited: boolean;
  retryAfterSeconds: number;
  count: number;
}

export const WINDOWS: Record<string, number> = {
  login: 15 * 60,
  "login-account": 15 * 60,
  register: 60 * 60,
  "verify-token": 60 * 60,
  "reset-token": 60 * 60,
  "reset-request": 60 * 60,
  "resend-verification": 60 * 60,
  // Batch F1: the PUBLIC resend form on /verify-email (no session). Its own
  // bucket so it cannot be confused with the session-guarded resend.
  "resend-verification-request": 60 * 60,
  "provider-register": 60 * 60,
  report: 60 * 60,
  block: 60 * 60,
  unblock: 60 * 60,
  unmatch: 60 * 60,
  "conversation-start": 60 * 60,
  "message-send": 10 * 60,
  "booking-create": 60 * 60,
};

export const LIMITS: Record<string, number> = {
  login: 5,
  "login-account": 20,
  register: 5,
  "verify-token": 10,
  "reset-token": 10,
  "reset-request": 3,
  "resend-verification": 5,
  "resend-verification-request": 5,
  "provider-register": 5,
  report: 5,
  block: 10,
  unblock: 10,
  unmatch: 10,
  "conversation-start": 20,
  "message-send": 60,
  "booking-create": 10,
};

/**
 * Count one attempt against `action`/`key` for the current fixed window.
 *
 * QUOTA POLICY (batch F1, decided — not an accident):
 *   1. A request is counted when it REACHES the action. Callers must authorise
 *      first and charge second, so a request that is rejected before the action
 *      runs (unknown id, not a participant, unauthenticated) costs the caller
 *      nothing. See match-api-handler.ts: message-send is charged only after the
 *      conversation-membership precheck.
 *   2. The stored counter saturates at `limit + 1`. Before, every rejected
 *      request kept incrementing it (60 allowed sends + 2 rejections = count 62),
 *      so the number stopped meaning "attempts on this action" and grew without
 *      bound for as long as a client kept hammering.
 *
 * Abuse tradeoff: saturating instead of incrementing means the row stops
 * recording how MANY times a client was rejected, only that it was. That is
 * deliberate — the limiter's job is to keep refusing for the rest of the window
 * (it still does: count stays > limit until the window rolls over), not to keep
 * a per-rejection tally. Anything that needs a rejection tally belongs in
 * audit_log, not in a quota counter that also gates real traffic. Likewise,
 * authorise-then-charge means a flood of "not found" requests is answered
 * without a quota write; it costs one indexed lookup, which is exactly what a
 * GET on the same path already costs today, so it opens no new work per request.
 */
export async function rateLimit(action: string, key: string): Promise<RateLimitResult> {
  const windowSeconds = WINDOWS[action] ?? 60 * 60;
  const limit = LIMITS[action] ?? 5;
  try {
    const [row] = await sql()`
      INSERT INTO rate_limits (action, key, window_start, count)
      VALUES (
        ${action},
        ${key},
        to_timestamp(floor(extract(epoch FROM now()) / ${windowSeconds}) * ${windowSeconds}),
        1
      )
      ON CONFLICT (action, key, window_start)
      DO UPDATE SET count = LEAST(rate_limits.count + 1, ${limit + 1})
      RETURNING count, window_start
    ` as any;
    const count = Number((row as any)?.count ?? 1);
    if (count > limit) {
      const windowStart = new Date((row as any).window_start).getTime();
      const retryAfter = Math.max(1, windowStart + windowSeconds * 1000 - Date.now());
      return { limited: true, retryAfterSeconds: Math.ceil(retryAfter / 1000), count };
    }
    // Opportunistic cleanup of old windows (never fails the request).
    sql()`DELETE FROM rate_limits WHERE window_start < NOW() - interval '48 hours'`.catch(() => {});
    return { limited: false, retryAfterSeconds: 0, count };
  } catch (err) {
    // DB failure: fail OPEN for rate limiting (availability over strictness here
    // is safer than locking out all users during a DB hiccup), but log loudly.
    console.error("[auth] rate limit check failed (allowing request)", err);
    return { limited: false, retryAfterSeconds: 0, count: 0 };
  }
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
