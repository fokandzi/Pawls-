/**
 * Single-use email tokens (verification + password reset).
 *
 * Only SHA-256(token) is stored in email_tokens.token_hash; the raw token
 * exists in the outgoing email and nowhere else (mail_log and console output
 * carry a redacted body, see redactTokenLinks + mailer.ts).
 *
 * Kinds:
 *   verify — 24 h. Consuming it marks the address verified AND signs the user
 *            in (auth-handler handleVerifyEmail), so it is a login credential.
 *   reset  — 1 h. Issuing a new one expires the user's older unused reset
 *            links, so only the newest email works.
 * There is no passwordless/magic-link login flow in this codebase.
 *
 * consumeEmailToken() is one conditional UPDATE: the token must match, be of
 * the right kind, be unused AND unexpired in the same statement, so two
 * concurrent clicks cannot both succeed and an expired token cannot be
 * consumed between a check and a write.
 */
import { randomBytes } from "node:crypto";
import { sql } from "../../db";
import { sha256Hex } from "./session";

export type EmailTokenKind = "verify" | "reset";

const TTL: Record<EmailTokenKind, string> = { verify: "24 hours", reset: "1 hour" };

/** Create a token for `userId`, store its hash, and return the raw value for the email. */
export async function issueEmailToken(userId: number, kind: EmailTokenKind): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  if (kind === "reset") {
    await sql()`UPDATE email_tokens SET expires_at = NOW()
                WHERE user_id = ${userId} AND kind = 'reset' AND used_at IS NULL AND expires_at > NOW()`;
  }
  await sql()`INSERT INTO email_tokens (user_id, kind, token_hash, expires_at)
              VALUES (${userId}, ${kind}, ${sha256Hex(token)}, NOW() + ${TTL[kind]}::interval)`;
  return token;
}

export type ConsumeResult = { ok: true; userId: number } | { ok: false; reason: "invalid" | "used" };

/** Atomically consume a raw token. "used" only when it matched and was already spent. */
export async function consumeEmailToken(token: string, kind: EmailTokenKind): Promise<ConsumeResult> {
  const tokenHash = sha256Hex(token);
  const rows = (await sql()`
    UPDATE email_tokens SET used_at = NOW()
    WHERE token_hash = ${tokenHash} AND kind = ${kind}
      AND used_at IS NULL AND expires_at > NOW()
    RETURNING user_id
  `) as unknown as { user_id: number }[];
  if (rows[0]) {
    const userId = Number(rows[0].user_id);
    // Every other outstanding link of the same kind dies with this one.
    await sql()`UPDATE email_tokens SET expires_at = NOW()
                WHERE user_id = ${userId} AND kind = ${kind} AND used_at IS NULL AND expires_at > NOW()`;
    return { ok: true, userId };
  }
  const spent = (await sql()`
    SELECT 1 FROM email_tokens WHERE token_hash = ${tokenHash} AND kind = ${kind} AND used_at IS NOT NULL LIMIT 1
  `) as unknown as unknown[];
  return { ok: false, reason: spent.length ? "used" : "invalid" };
}

/**
 * Delete tokens that expired or were used more than `retentionDays` ago.
 * Idempotent: a second run deletes nothing new. Returns the deleted count.
 */
export async function purgeExpiredEmailTokens(retentionDays = 7): Promise<number> {
  const days = Math.max(0, Math.floor(retentionDays));
  const rows = (await sql()`
    DELETE FROM email_tokens
    WHERE expires_at < NOW() - make_interval(days => ${days})
       OR used_at < NOW() - make_interval(days => ${days})
    RETURNING id
  `) as unknown as unknown[];
  return rows.length;
}

/** Replace the value of every `token=` query parameter, so a stored or logged email is not a credential. */
export function redactTokenLinks(text: string): string {
  return text.replace(/([?&]token=)[^&\s"'<>]+/g, "$1[redacted]");
}
