/**
 * DB-backed rate limiting (works across serverless instances).
 *
 * Limits (configurable):
 *   login:                5 / 15 min per email+IP        ('login')
 *   register:             5 / 1 hour per IP              ('register')
 *   verify/reset-token:   10 / 1 hour per IP+token       ('verify-token' | 'reset-token')
 *   reset-request:        3 / 1 hour per email           ('reset-request')
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

const WINDOWS: Record<string, number> = {
  login: 15 * 60,
  register: 60 * 60,
  "verify-token": 60 * 60,
  "reset-token": 60 * 60,
  "reset-request": 60 * 60,
};

const LIMITS: Record<string, number> = {
  login: 5,
  register: 5,
  "verify-token": 10,
  "reset-token": 10,
  "reset-request": 3,
};

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
      DO UPDATE SET count = rate_limits.count + 1
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
