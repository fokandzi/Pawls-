// Pre-SSR native auth dispatcher — wired into serve.ts AND vercel-entry.ts
// BEFORE the TanStack SSR handler. All auth state changes happen here via
// native form POSTs (no client JS, no seroval). Every response is controlled:
// 400 invalid input / 401 bad credentials / 403 forbidden / 404 unknown token
// / 429 rate limited / 503 email unavailable. Never an uncontrolled 500.
import { createHash, randomBytes } from "node:crypto";
import { sql } from "./src/db";
import { ensureAuthTables, writeAudit } from "./src/lib/auth/ensure";
import { hashPassword, verifyPassword, isLegacySha256Hash, constantTimeEqual } from "./src/lib/auth/hash";
import {
  createSession, revokeSession, revokeOtherSessions, revokeAllSessions,
  getSessionUser, clearSessionCookieHeader, requestIsSecure, sha256Hex,
} from "./src/lib/auth/session";
import { rateLimit, clientIp } from "./src/lib/auth/rate-limit";
import { assertSameOrigin } from "./src/lib/auth/csrf";
import { sendMail, verificationEmail, passwordResetEmail, emailDeliveryMode } from "./src/lib/auth/mailer";
import { requireUser } from "./src/lib/auth/authz";
import { deleteUserAccount } from "./src/lib/auth/deletion";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NO_STORE = "no-store, max-age=0, must-revalidate";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
function htmlPage(title: string, bodyHtml: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} — Pawls</title></head><body style="font-family:system-ui,sans-serif;background:#faf6ef;color:#3d3d3d;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;max-width:540px;padding:24px"><h1 style="font-size:1.5rem;margin-bottom:8px">${escapeHtml(title)}</h1>${bodyHtml}</div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": NO_STORE } },
  );
}
function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": NO_STORE, ...headers },
  });
}
function redirectResponse(location: string, setCookies: string[] = []): Response {
  const res = new Response(null, { status: 302, headers: { Location: location, "Cache-Control": NO_STORE } });
  for (const c of setCookies) res.headers.append("Set-Cookie", c);
  return res;
}
function rateLimitedResponse(retryAfterSeconds: number): Response {
  return htmlPage(
    "Too many attempts",
    `<p>Please wait ${retryAfterSeconds} seconds before trying again.</p><p><a href="/" style="color:#C95D43">← Back to Pawls</a></p>`,
    429,
  );
}
function formValue(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}
function isTestEmail(email: string): boolean {
  return email.endsWith(".test") || email.includes("+test@");
}

export async function handleAuthPost(request: Request): Promise<Response> {
  let pathname: string;
  try { pathname = new URL(request.url).pathname; } catch { return htmlPage("Bad request", "<p>Could not read this request.</p>", 400); }
  switch (pathname) {
    case "/auth/login": return handleLogin(request);
    case "/auth/logout": return handleLogout(request);
    case "/auth/verify-email": return handleVerifyEmail(request);
    case "/auth/password-reset-request": return handlePasswordResetRequest(request);
    case "/auth/password-reset": return handlePasswordReset(request);
    case "/auth/password-change": return handlePasswordChange(request);
    case "/auth/delete-account": return handleDeleteAccount(request);
    case "/auth/me": return handleMe(request);
    default: return jsonResponse({ error: "Not found" }, 404);
  }
}

// ---- register ---------------------------------------------------------------
export async function handleRegisterPost(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) return htmlPage("Request blocked", `<p>${escapeHtml(csrf.error)}</p>`, 403);
  let name = "", email = "", password = "", dob = "";
  try {
    const form = await request.formData();
    name = formValue(form, "name").slice(0, 120);
    email = formValue(form, "email").toLowerCase().slice(0, 320);
    password = String(form.get("password") ?? "");
    dob = formValue(form, "date_of_birth").slice(0, 10);
  } catch {
    return htmlPage("Could not read the sign-up form", "<p>Please go back and try again.</p>", 400);
  }
  if (!name || !EMAIL_RE.test(email)) {
    return htmlPage("Check your details", "<p>Please provide your name and a valid email address.</p>", 400);
  }
  if (password.length < 8 || password.length > 128) {
    return htmlPage("Password too weak", "<p>Your password must be between 8 and 128 characters.</p>", 400);
  }
  const dobDate = new Date(dob);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(dobDate.getTime())) {
    return htmlPage("Check your date of birth", "<p>Please enter a valid date of birth.</p>", 400);
  }
  const ageMs = Date.now() - dobDate.getTime();
  if (ageMs < 16 * 365.25 * 24 * 3600 * 1000) {
    return htmlPage("You must be at least 16", "<p>Pawls requires users to be 16 or older. Please come back when you're old enough!</p>", 400);
  }
  const ip = clientIp(request);
  const rl = await rateLimit("register", ip);
  if (rl.limited) return rateLimitedResponse(rl.retryAfterSeconds);
  try {
    await ensureAuthTables();
    const isTest = isTestEmail(email);
    const [row] = await sql()`
      INSERT INTO users (email, name, password_hash, date_of_birth, preferred_language, is_test, role, updated_at)
      VALUES (${email}, ${name}, ${await hashPassword(password)}, ${dob}, 'fr', ${isTest}, 'user', NOW())
      RETURNING id
    ` as any;
    if (!row) return htmlPage("Something went wrong", "<p>We couldn't create your account. Please try again.</p>", 500);
    const userId = Number((row as { id: number }).id);
    const token = randomBytes(32).toString("base64url");
    await sql()`INSERT INTO email_tokens (user_id, kind, token_hash, expires_at)
                VALUES (${userId}, 'verify', ${sha256Hex(token)}, NOW() + interval '24 hours')`;
    const mail = await sendMail(verificationEmail(email, token));
    if (!mail.ok) {
      // Honest failure: email is REQUIRED to complete registration. Roll back.
      await sql()`DELETE FROM email_tokens WHERE user_id = ${userId}`;
      await sql()`DELETE FROM users WHERE id = ${userId}`;
      return htmlPage("Email unavailable", "<p>We couldn't send your verification email right now. Please try again in a few minutes.</p>", 503);
    }
    const modeNote = mail.mode === "test"
      ? `<p style="color:#b45309;font-weight:600">Test mode: the verification email was logged to the server console and mail_log — it was NOT sent.</p>`
      : "";
    return htmlPage(
      "Check your email",
      `<p>We sent a verification link to <strong>${escapeHtml(email)}</strong>. Click it to activate your account (valid for 24 hours).</p>${modeNote}<p><a href="/verify-email" style="color:#C95D43">Have a link? Verify here</a></p>`,
      200,
    );
  } catch (err: any) {
    if (String(err?.message ?? "").includes("duplicate key")) {
      return htmlPage("Check your email", `<p>If an account exists for <strong>${escapeHtml(email)}</strong>, a verification link is on its way.</p>`, 200);
    }
    console.error("[auth] register failed", err);
    return htmlPage("Something went wrong", "<p>We couldn't create your account right now. Please try again in a moment.</p>", 500);
  }
}

// ---- login ------------------------------------------------------------------
async function handleLogin(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) return htmlPage("Request blocked", `<p>${escapeHtml(csrf.error)}</p>`, 403);
  let email = "", password = "";
  try {
    const form = await request.formData();
    email = formValue(form, "email").toLowerCase().slice(0, 320);
    password = String(form.get("password") ?? "");
  } catch {
    return htmlPage("Could not read the login form", "<p>Please go back and try again.</p>", 400);
  }
  if (!email || !password) return htmlPage("Check your details", "<p>Please enter your email and password.</p>", 400);
  const rl = await rateLimit("login", `${email}|${clientIp(request)}`);
  if (rl.limited) return rateLimitedResponse(rl.retryAfterSeconds);
  try {
    await ensureAuthTables();
    const rows = await sql()`SELECT id, email, name, password_hash FROM users WHERE lower(email) = lower(${email}) LIMIT 1`;
    const user = rows[0] as any;
    const ok = user ? await verifyPassword(password, user.password_hash) : false;
    if (!user || !ok) {
      // Same message for unknown email vs wrong password (no enumeration).
      return htmlPage("Invalid email or password", '<p><a href="/forgot-password" style="color:#C95D43">Forgot your password?</a></p>', 401);
    }
    if (isLegacySha256Hash(user.password_hash)) {
      await sql()`UPDATE users SET password_hash = ${await hashPassword(password)}, updated_at = NOW() WHERE id = ${user.id}`;
    }
    const session = await createSession(request, Number(user.id));
    return redirectResponse("/match", [session.cookieHeader]);
  } catch (err) {
    console.error("[auth] login failed", err);
    return htmlPage("Something went wrong", "<p>We couldn't log you in right now. Please try again in a moment.</p>", 500);
  }
}

// ---- verify email -----------------------------------------------------------
async function handleVerifyEmail(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) return htmlPage("Request blocked", `<p>${escapeHtml(csrf.error)}</p>`, 403);
  const token = formValue(await request.formData().catch(() => new FormData()), "token");
  if (!token) return htmlPage("Missing verification link", "<p>Please use the link from your verification email.</p>", 400);
  const rl = await rateLimit("verify-token", `${clientIp(request)}|${token}`);
  if (rl.limited) return rateLimitedResponse(rl.retryAfterSeconds);
  try {
    await ensureAuthTables();
    const tokenHash = sha256Hex(token);
    const rows = await sql()`
      SELECT et.id, et.user_id FROM email_tokens et
      WHERE et.token_hash = ${tokenHash} AND et.kind = 'verify'
        AND et.used_at IS NULL AND et.expires_at > NOW()
      LIMIT 1
    ` as any;
    const tok = rows[0] as any;
    if (!tok) return htmlPage("Link invalid or expired", "<p>This verification link is invalid or has already been used. Please request a new one from the login page.</p>", 404);
    const marked = await sql()`
      UPDATE email_tokens SET used_at = NOW() WHERE id = ${tok.id} AND used_at IS NULL RETURNING id
    ` as any;
    if (!(marked[0] as any)) return htmlPage("Link already used", "<p>This verification link has already been used. You can log in below.</p>", 404);
    await sql()`UPDATE users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = ${tok.user_id}`;
    const session = await createSession(request, Number(tok.user_id));
    return redirectResponse("/match/create?verified=1", [session.cookieHeader]);
  } catch (err) {
    console.error("[auth] verify failed", err);
    return htmlPage("Something went wrong", "<p>We couldn't verify your email right now. Please try again in a moment.</p>", 500);
  }
}

// ---- logout -----------------------------------------------------------------
async function handleLogout(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) return htmlPage("Request blocked", `<p>${escapeHtml(csrf.error)}</p>`, 403);
  await revokeSession(request).catch((e) => console.error("[auth] logout revoke failed", e));
  return redirectResponse("/", [clearSessionCookieHeader(requestIsSecure(request))]);
}

// ---- password reset request -------------------------------------------------
async function handlePasswordResetRequest(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) return htmlPage("Request blocked", `<p>${escapeHtml(csrf.error)}</p>`, 403);
  const email = formValue(await request.formData().catch(() => new FormData()), "email").toLowerCase().slice(0, 320);
  if (!EMAIL_RE.test(email)) return htmlPage("Check your details", "<p>Please enter a valid email address.</p>", 400);
  const rl = await rateLimit("reset-request", email);
  if (rl.limited) return rateLimitedResponse(rl.retryAfterSeconds);
  try {
    await ensureAuthTables();
    const rows = await sql()`SELECT id FROM users WHERE lower(email) = lower(${email}) LIMIT 1`;
    const user = rows[0] as any;
    const mode = emailDeliveryMode();
    if (user) {
      const token = randomBytes(32).toString("base64url");
      await sql()`INSERT INTO email_tokens (user_id, kind, token_hash, expires_at)
                  VALUES (${user.id}, 'reset', ${sha256Hex(token)}, NOW() + interval '1 hour')`;
      const mail = await sendMail(passwordResetEmail(email, token));
      if (!mail.ok) {
        return htmlPage("Email unavailable", "<p>We couldn't send the reset email right now. Please try again in a few minutes.</p>", 503);
      }
      writeAudit(Number(user.id), "password_reset_requested", {});
    } else {
      console.log(`[auth] password reset requested for unknown email (no email sent): ${email}`);
    }
    const modeNote = mode === "test"
      ? `<p style="color:#b45309;font-weight:600">Test mode: the reset email was logged to the server console and mail_log — it was NOT sent.</p>`
      : "";
    return htmlPage("Check your email", `<p>If an account exists for <strong>${escapeHtml(email)}</strong>, we've sent a reset link (valid for 1 hour).</p>${modeNote}`, 200);
  } catch (err) {
    console.error("[auth] reset-request failed", err);
    return htmlPage("Something went wrong", "<p>We couldn't process this request right now. Please try again in a moment.</p>", 500);
  }
}

// ---- password reset (token) -------------------------------------------------
async function handlePasswordReset(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) return htmlPage("Request blocked", `<p>${escapeHtml(csrf.error)}</p>`, 403);
  let token = "", password = "";
  try {
    const form = await request.formData();
    token = formValue(form, "token");
    password = String(form.get("password") ?? "");
  } catch {
    return htmlPage("Could not read the reset form", "<p>Please go back and try again.</p>", 400);
  }
  if (!token) return htmlPage("Missing reset link", "<p>Please use the link from your reset email.</p>", 400);
  if (password.length < 8 || password.length > 128) {
    return htmlPage("Password too weak", "<p>Your new password must be between 8 and 128 characters.</p>", 400);
  }
  const rl = await rateLimit("reset-token", `${clientIp(request)}|${token}`);
  if (rl.limited) return rateLimitedResponse(rl.retryAfterSeconds);
  try {
    await ensureAuthTables();
    const rows = await sql()`
      SELECT et.id, et.user_id FROM email_tokens et
      WHERE et.token_hash = ${sha256Hex(token)} AND et.kind = 'reset'
        AND et.used_at IS NULL AND et.expires_at > NOW()
      LIMIT 1
    ` as any;
    const tok = rows[0] as any;
    if (!tok) return htmlPage("Link invalid or expired", "<p>This reset link is invalid or has expired. Please request a new one.</p>", 404);
    const marked = await sql()`UPDATE email_tokens SET used_at = NOW() WHERE id = ${tok.id} AND used_at IS NULL RETURNING id` as any;
    if (!(marked[0] as any)) return htmlPage("Link already used", "<p>This reset link has already been used. Please request a new one.</p>", 404);
    await sql()`UPDATE users SET password_hash = ${await hashPassword(password)}, updated_at = NOW() WHERE id = ${tok.user_id}`;
    await revokeAllSessions(Number(tok.user_id));
    writeAudit(Number(tok.user_id), "password_reset", {});
    return redirectResponse("/login?reset=1");
  } catch (err) {
    console.error("[auth] password reset failed", err);
    return htmlPage("Something went wrong", "<p>We couldn't reset your password right now. Please try again in a moment.</p>", 500);
  }
}

// ---- password change (authenticated) ----------------------------------------
async function handlePasswordChange(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) return htmlPage("Request blocked", `<p>${escapeHtml(csrf.error)}</p>`, 403);
  const auth = await requireUser(request);
  if (!auth.ok) return htmlPage("Please log in", "<p>You need to be logged in to change your password.</p>", 401);
  let current = "", next = "";
  try {
    const form = await request.formData();
    current = String(form.get("currentPassword") ?? "");
    next = String(form.get("newPassword") ?? "");
  } catch {
    return htmlPage("Could not read the form", "<p>Please go back and try again.</p>", 400);
  }
  if (next.length < 8 || next.length > 128) {
    return htmlPage("Password too weak", "<p>Your new password must be between 8 and 128 characters.</p>", 400);
  }
  try {
    await ensureAuthTables();
    const rows = await sql()`SELECT password_hash FROM users WHERE id = ${auth.user.id} LIMIT 1`;
    const stored = (rows[0] as any)?.password_hash ?? null;
    if (!(await verifyPassword(current, stored))) {
      return htmlPage("Current password incorrect", "<p>The current password you entered is not correct.</p>", 403);
    }
    await sql()`UPDATE users SET password_hash = ${await hashPassword(next)}, updated_at = NOW() WHERE id = ${auth.user.id}`;
    await revokeOtherSessions(request, auth.user.id);
    writeAudit(auth.user.id, "password_changed", {});
    return redirectResponse("/settings?changed=1");
  } catch (err) {
    console.error("[auth] password change failed", err);
    return htmlPage("Something went wrong", "<p>We couldn't change your password right now. Please try again in a moment.</p>", 500);
  }
}

// ---- delete account (authenticated + confirmed) -----------------------------
async function handleDeleteAccount(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) return htmlPage("Request blocked", `<p>${escapeHtml(csrf.error)}</p>`, 403);
  const auth = await requireUser(request);
  if (!auth.ok) return htmlPage("Please log in", "<p>You need to be logged in to delete your account.</p>", 401);
  let confirmEmail = "", confirmed = "";
  try {
    const form = await request.formData();
    confirmEmail = formValue(form, "confirmEmail").toLowerCase();
    confirmed = String(form.get("confirm") ?? "");
  } catch {
    return htmlPage("Could not read the form", "<p>Please go back and try again.</p>", 400);
  }
  if (confirmed !== "1") {
    return htmlPage("Confirmation required", "<p>Please tick the confirmation box to delete your account.</p>", 400);
  }
  if (!constantTimeEqual(confirmEmail, auth.user.email.toLowerCase())) {
    return htmlPage("Email does not match", "<p>Please type your account email exactly as shown to confirm deletion.</p>", 400);
  }
  const result = await deleteUserAccount(auth.user);
  if (!result.ok) {
    return htmlPage("Something went wrong", `<p>${escapeHtml(result.error ?? "Please try again in a moment.")}</p>`, 500);
  }
  writeAudit(auth.user.id, "account_deleted_confirmed", { email: auth.user.email });
  return redirectResponse("/?deleted=1", [clearSessionCookieHeader(requestIsSecure(request))]);
}

// ---- me ---------------------------------------------------------------------
async function handleMe(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (!user) return jsonResponse({ user: null }, 401, { "WWW-Authenticate": "Session" });
  // Never returns password data or precise location (approx_lat/lng).
  return jsonResponse({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      verified: user.emailVerified,
      role: user.role,
      preferred_language: user.preferredLanguage,
      country: user.country,
      city: user.city,
      timezone: user.timezone,
    },
  });
}
