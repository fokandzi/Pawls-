/**
 * Transactional mailer — Resend adapter with an honest TEST/DEV mode.
 *
 * Mode determination:
 *   - PROD mode:  RESEND_API_KEY is set AND NODE_ENV === 'production'.
 *   - TEST mode:  anything else (no key, or non-production env). Emails are
 *                 NEVER sent — the full content is logged to the server console
 *                 AND appended to the mail_log table with mode='test'. Callers
 *                 must surface the mode to the user ("test mode: email logged,
 *                 not sent") so it is visibly distinguishable from production.
 *
 * sendMail returns { ok, mode, error? } — it never claims 'sent' unless Resend
 * accepted the message in prod mode. Flows that REQUIRE email treat ok=false
 * (prod mode failure) as a controlled 503.
 */
import { sql } from "../../db";

const RESEND_URL = "https://api.resend.com/emails";

export type MailResult =
  | { ok: true; mode: "test" }
  | { ok: true; mode: "prod"; id?: string }
  | { ok: false; mode: "prod"; error: string };

export function mailMode(): "test" | "prod" {
  return process.env.RESEND_API_KEY && process.env.NODE_ENV === "production" ? "prod" : "test";
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const mode = mailMode();
  if (mode === "test") {
    const body = `TO: ${message.to}\nSUBJECT: ${message.subject}\nTEXT:\n${message.text}\nHTML:\n${message.html}`;
    // Console log must make the test nature unmistakable.
    console.log(
      `[auth-mail][TEST MODE — NOT SENT] to=${message.to} subject="${message.subject}"\n${body}`,
    );
    try {
      await sql()`
        INSERT INTO mail_log (to, subject, body, mode)
        VALUES (${message.to}, ${message.subject}, ${body}, 'test')
      `;
    } catch (err) {
      console.error("[auth-mail] failed to append test mail to mail_log (continuing)", err);
    }
    return { ok: true, mode: "test" };
  }

  // PROD mode: actually send via Resend.
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || "Pawls <no-reply@pawls.club>";
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
      return { ok: false, mode: "prod", error: `Email provider error (${res.status})` };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    console.log(`[auth-mail][PROD] sent to=${message.to} subject="${message.subject}" id=${json.id ?? "n/a"}`);
    return { ok: true, mode: "prod", id: json.id };
  } catch (err: any) {
    console.error("[auth-mail][PROD] send failed", err);
    return { ok: false, mode: "prod", error: "Email provider unavailable" };
  }
}

/** True when this environment would actually deliver email (used for copy). */
export function emailDeliveryMode(): "test" | "prod" {
  return mailMode();
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
