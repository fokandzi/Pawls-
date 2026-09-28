/**
 * Transactional mailer — Resend adapter with an honest TEST/DEV mode.
 *
 * Mode determination:
 *   - PROD mode:  RESEND_API_KEY is set → the message is really sent through
 *                 the Resend REST API (POST https://api.resend.com/emails).
 *   - TEST mode:  no key configured (dev, CI, and any environment where the
 *                 owner has not added the secret yet). Emails are NEVER sent —
 *                 the content is logged to the server console and appended to
 *                 mail_log with mode='test'. Callers MUST surface this to the
 *                 user ("no email was sent: delivery is not configured here")
 *                 instead of claiming a message went out.
 *
 * Every outbound attempt is recorded in mail_log with an honest status:
 *   - test mode  → mode='test',  status='test'   (never claims delivery)
 *   - prod ok    → mode='prod',  status='sent', provider_id=<Resend id>
 *   - prod fail  → mode='prod',  status='failed', error=<provider detail>
 *
 * sendMail returns { ok, mode, error? } — it never reports ok:true for prod
 * unless Resend accepted the message. Flows that REQUIRE email treat ok=false
 * (prod failure) as a controlled 503.
 */
import { sql } from "../../db";

const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Pawls <no-reply@pawls.club>";

export type MailResult =
  | { ok: true; mode: "test" }
  | { ok: true; mode: "prod"; id?: string }
  | { ok: false; mode: "prod"; error: string };

export function mailMode(): "test" | "prod" {
  return process.env.RESEND_API_KEY ? "prod" : "test";
}

/** Sender address — RESEND_FROM wins, MAIL_FROM kept as a legacy alias. */
export function mailFrom(): string {
  return process.env.RESEND_FROM || process.env.MAIL_FROM || DEFAULT_FROM;
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

interface MailLogEntry {
  to: string;
  subject: string;
  body: string;
  mode: "test" | "prod";
  status: "test" | "sent" | "failed";
  error?: string | null;
  providerId?: string | null;
}

/**
 * Append one delivery attempt to mail_log. Never throws: a logging failure must
 * not break a flow that has already performed its side effect. The status /
 * error / provider_id columns are added by migration 007 and mirrored by
 * ensureAuthTables(); if they are not present yet (fresh DB), fall back to the
 * original column set so the attempt is still recorded honestly.
 */
async function recordMail(entry: MailLogEntry): Promise<void> {
  try {
    await sql()`
      INSERT INTO mail_log ("to", subject, body, mode, status, error, provider_id)
      VALUES (${entry.to}, ${entry.subject}, ${entry.body}, ${entry.mode}, ${entry.status},
              ${entry.error ?? null}, ${entry.providerId ?? null})
    `;
  } catch (err) {
    console.error("[auth-mail] mail_log insert with delivery status failed — retrying legacy shape", err);
    try {
      await sql()`
        INSERT INTO mail_log ("to", subject, body, mode)
        VALUES (${entry.to}, ${entry.subject}, ${entry.body}, ${entry.mode})
      `;
    } catch (err2) {
      console.error("[auth-mail] failed to append mail to mail_log (continuing)", err2);
    }
  }
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const mode = mailMode();
  if (mode === "test") {
    const body = `TO: ${message.to}\nSUBJECT: ${message.subject}\nTEXT:\n${message.text}\nHTML:\n${message.html}`;
    // Console log must make the test nature unmistakable.
    console.log(
      `[auth-mail][TEST MODE — NOT SENT] to=${message.to} subject="${message.subject}"\n${body}`,
    );
    await recordMail({
      to: message.to,
      subject: message.subject,
      body,
      mode: "test",
      status: "test",
      error: null,
    });
    return { ok: true, mode: "test" };
  }

  // PROD mode: actually send via Resend.
  const apiKey = process.env.RESEND_API_KEY;
  const from = mailFrom();
  const body = `TO: ${message.to}\nFROM: ${from}\nSUBJECT: ${message.subject}\nTEXT:\n${message.text}\nHTML:\n${message.html}`;
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      console.error(`[auth-mail][PROD] Resend error ${res.status}: ${detail}`);
      const error = `Email provider error (${res.status})`;
      await recordMail({
        to: message.to,
        subject: message.subject,
        body,
        mode: "prod",
        status: "failed",
        error: `${error}${detail ? `: ${detail}` : ""}`,
      });
      return { ok: false, mode: "prod", error };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    console.log(`[auth-mail][PROD] sent to=${message.to} subject="${message.subject}" id=${json.id ?? "n/a"}`);
    await recordMail({
      to: message.to,
      subject: message.subject,
      body,
      mode: "prod",
      status: "sent",
      providerId: json.id ?? null,
    });
    return { ok: true, mode: "prod", id: json.id };
  } catch (err: any) {
    console.error("[auth-mail][PROD] send failed", err);
    const error = "Email provider unavailable";
    await recordMail({
      to: message.to,
      subject: message.subject,
      body,
      mode: "prod",
      status: "failed",
      error: `${error}: ${String(err?.message ?? err).slice(0, 200)}`,
    });
    return { ok: false, mode: "prod", error };
  }
}

/** True when this environment would actually deliver email (used for copy). */
export function emailDeliveryMode(): "test" | "prod" {
  return mailMode();
}

/** True when outbound email can really be delivered from this environment. */
export function emailConfigured(): boolean {
  return mailMode() === "prod";
}

// --- templates -----------------------------------------------------------------

export function baseUrl(): string {
  return process.env.PUBLIC_SITE_URL || "https://pawls.club";
}

export function verificationEmail(to: string, token: string): MailMessage {
  const link = `${baseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: "Verify your Pawls account",
    text: `Welcome to Pawls! Confirm your email address to activate your account:\n\n${link}\n\nThis link expires in 24 hours. If you didn't create a Pawls account, you can ignore this email.`,
    html: `<p>Welcome to Pawls! Confirm your email address to activate your account:</p><p><a href="${link}">Verify my email</a></p><p>This link expires in 24 hours. If you didn't create a Pawls account, you can ignore this email.</p>`,
  };
}

export function passwordResetEmail(to: string, token: string): MailMessage {
  const link = `${baseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: "Reset your Pawls password",
    text: `We received a request to reset your Pawls password:\n\n${link}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email.`,
    html: `<p>We received a request to reset your Pawls password:</p><p><a href="${link}">Reset my password</a></p><p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>`,
  };
}
