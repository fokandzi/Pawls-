// Pre-SSR native auth dispatcher — wired into serve.ts AND vercel-entry.ts
// BEFORE the TanStack SSR handler. All auth state changes happen here via
// native form POSTs (no client JS, no seroval). Every response is controlled:
// 400 invalid input / 401 bad credentials / 403 forbidden / 404 unknown token
// / 429 rate limited / 503 email unavailable. Never an uncontrolled 500.
import { sql } from "./db";
import { ensureAuthTables, writeAudit } from "./lib/auth/ensure";
import { hashPassword, verifyPassword, needsRehash, isLegacySha256Hash, constantTimeEqual } from "./lib/auth/hash";
import { issueEmailToken, consumeEmailToken } from "./lib/auth/email-tokens";
import {
  createSession, revokeSession, revokeOtherSessions, revokeAllSessions,
  getSessionUser, clearSessionCookieHeader, requestIsSecure, sha256Hex,
} from "./lib/auth/session";
import { rateLimit, clientIp } from "./lib/auth/rate-limit";
import { assertSameOrigin } from "./lib/auth/csrf";
import { sendMail, verificationEmail, passwordResetEmail, emailConfigured } from "./lib/auth/mailer";
import {
  NAV_HOME_LOGIN,
  errorPage,
  noticePage,
  rateLimitPage,
  registerFormPage,
} from "./lib/auth/pages";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./lib/password-policy";
import { requireUser } from "./lib/auth/authz";
import { verificationGate } from "./lib/auth/login-gate";
import { deleteUserAccount } from "./lib/auth/deletion";
import { verifyAttributionToken } from "./lib/attribution";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NO_STORE = "no-store, max-age=0, must-revalidate";
const PASSWORD_RULE_ARGS = { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH };
/** Max verification links a single IP may trigger per hour (audit blocker #1). */
const RESEND_LIMIT_ACTION = "resend-verification";

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
function formValue(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}
function isTestEmail(email: string): boolean {
  return email.endsWith(".test") || email.includes("+test@");
}
/** Recovery links reused across the FR-first auth pages. */
const REGISTER_LINKS = [
  { href: "/login", labelKey: "auth.nav.login" },
  { href: "/forgot-password", labelKey: "auth.nav.forgot" },
  { href: "/", labelKey: "auth.nav.home" },
];
const VERIFY_LINKS = [
  { href: "/verify-email", labelKey: "auth.nav.verify" },
  { href: "/login", labelKey: "auth.nav.login" },
  { href: "/", labelKey: "auth.nav.home" },
];
const RESET_LINKS = [
  { href: "/forgot-password", labelKey: "auth.nav.forgot" },
  { href: "/login", labelKey: "auth.nav.login" },
  { href: "/", labelKey: "auth.nav.home" },
];
const SETTINGS_LINKS = [
  { href: "/settings", labelKey: "auth.nav.settings" },
  { href: "/match", labelKey: "auth.nav.match" },
  { href: "/", labelKey: "auth.nav.home" },
];

/** CSRF failure — same FR-first page everywhere in the auth flow. */
async function blockedResponse(request: Request, links = NAV_HOME_LOGIN): Promise<Response> {
  return errorPage(request, {
    titleKey: "auth.err.blocked",
    bodyKey: "auth.err.blockedBody",
    status: 403,
    links,
  });
}
/** Uncontrolled-failure page (never a bare 500 with no way back). */
async function serverErrorResponse(request: Request, links = NAV_HOME_LOGIN): Promise<Response> {
  return errorPage(request, {
    titleKey: "auth.err.serverTitle",
    bodyKey: "auth.err.serverBody",
    status: 500,
    links,
  });
}

export async function handleAuthPost(request: Request): Promise<Response> {
  let pathname: string;
  try { pathname = new URL(request.url).pathname; } catch {
    return errorPage(request, { titleKey: "auth.err.badRequest", bodyKey: "auth.err.badRequestBody", status: 400 });
  }
  switch (pathname) {
    case "/auth/register": return handleRegisterPost(request);
    case "/auth/login": return handleLogin(request);
    case "/auth/logout": return handleLogout(request);
    case "/auth/verify-email": return handleVerifyEmail(request);
    case "/auth/password-reset-request": return handlePasswordResetRequest(request);
    case "/auth/password-reset": return handlePasswordReset(request);
    case "/auth/password-change": return handlePasswordChange(request);
    case "/auth/delete-account": return handleDeleteAccount(request);
    // Verification email re-send (audit blocker #1): session-guarded, CSRF- and
    // rate-limited, honest about whether an email was actually sent.
    case "/api/auth/resend-verification":
    case "/auth/resend-verification": return handleResendVerification(request);
    // Public resend form on /verify-email (Batch F1): no session required, and
    // the answer never reveals whether the address has an account.
    case "/auth/resend-verification-request":
    case "/api/auth/resend-verification-request": return handleResendVerificationRequest(request);
    case "/auth/me": return handleMe(request);
    default: return jsonResponse({ error: "Not found" }, 404);
  }
}

// ---- shared: honest verification-email send ---------------------------------
/**
 * Creates a fresh verification token for `userId` and attempts delivery.
 * Returns an honest outcome — `sent` is true ONLY when the provider accepted
 * the message (never in test mode, where nothing leaves the server).
 */
async function sendVerificationFor(
  userId: number,
  email: string,
): Promise<{ sent: boolean; failed: boolean }> {
  const token = await issueEmailToken(userId, "verify");
  const mail = await sendMail(verificationEmail(email, token));
  if (mail.mode === "test") return { sent: false, failed: false };
  if (!mail.ok) return { sent: false, failed: true };
  return { sent: true, failed: false };
}

// ---- register ---------------------------------------------------------------
export async function handleRegisterPost(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) {
    return errorPage(request, {
      titleKey: "auth.err.blocked",
      bodyKey: "auth.err.blockedBody",
      status: 403,
      links: NAV_HOME_LOGIN,
    });
  }
  let name = "", email = "", password = "", dob = "", attrToken = "";
  let formReadable = true;
  try {
    const form = await request.formData();
    name = formValue(form, "name").slice(0, 120);
    email = formValue(form, "email").toLowerCase().slice(0, 320);
    password = String(form.get("password") ?? "");
    dob = formValue(form, "date_of_birth").slice(0, 10);
    attrToken = String(form.get("attr_token") ?? "").slice(0, 400);
  } catch {
    formReadable = false;
  }
  // Every validation failure re-renders the FR register form with the submitted
  // name / email / date of birth intact — the visitor never lands on a bare
  // page that loses their input.
  const values = { name, email, dateOfBirth: dob, attrToken };
  if (!formReadable) {
    return registerFormPage(request, {
      values,
      errorTitleKey: "auth.err.badRequest",
      errorKey: "auth.err.badRequestBody",
      status: 400,
    });
  }
  if (!name || !EMAIL_RE.test(email)) {
    return registerFormPage(request, {
      values,
      errorTitleKey: "auth.err.checkDetails",
      errorKey: "auth.err.checkDetailsBody",
      status: 400,
    });
  }
  // Length rule comes from the shared password policy (same numbers as the
  // input's minLength/maxLength) — no client/server contradiction.
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return registerFormPage(request, {
      values,
      errorTitleKey: "auth.err.passwordLengthTitle",
      errorKey: "auth.err.passwordLengthBody",
      errorArgs: PASSWORD_RULE_ARGS,
      status: 400,
    });
  }
  const dobDate = new Date(dob);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(dobDate.getTime())) {
    return registerFormPage(request, {
      values,
      errorTitleKey: "auth.err.dobTitle",
      errorKey: "auth.err.dobBody",
      status: 400,
    });
  }
  const ageMs = Date.now() - dobDate.getTime();
  if (ageMs < 16 * 365.25 * 24 * 3600 * 1000) {
    return registerFormPage(request, {
      values,
      errorTitleKey: "auth.err.under16Title",
      errorKey: "auth.err.under16Body",
      status: 400,
    });
  }
  const ip = clientIp(request);
  const rl = await rateLimit("register", ip);
  if (rl.limited) return rateLimitPage(request, rl.retryAfterSeconds);
  try {
    await ensureAuthTables();
    const isTest = isTestEmail(email);
    const [row] = await sql()`
      INSERT INTO users (email, name, password_hash, date_of_birth, preferred_language, is_test, role, updated_at)
      VALUES (${email}, ${name}, ${await hashPassword(password)}, ${dob}, 'fr', ${isTest}, 'user', NOW())
      RETURNING id
    ` as any;
    if (!row) {
      return errorPage(request, {
        titleKey: "auth.err.serverTitle",
        bodyKey: "auth.err.serverBody",
        status: 500,
        links: REGISTER_LINKS,
      });
    }
    const userId = Number((row as { id: number }).id);
    // Persist attribution (campaign + source) keyed to the real user. The
    // token is HMAC-signed; forged/malformed values fail verification and are
    // dropped silently. Attribution grants no entitlement — metadata only.
    if (attrToken) {
      const info = verifyAttributionToken(attrToken);
      if (info) {
        try {
          await sql()`
            INSERT INTO acquisition_signups (user_id, campaign, source)
            VALUES (${userId}, ${info.campaign}, ${info.source ?? null})
            ON CONFLICT (user_id) DO NOTHING
          `;
        } catch (err) {
          console.error("[auth] attribution write failed (non-fatal)", err);
        }
      }
    }
    const outcome = await sendVerificationFor(userId, email);
    if (outcome.failed) {
      // Honest failure: the verification email could not be delivered, so the
      // account is rolled back rather than left in a state the user cannot
      // activate.
      await sql()`DELETE FROM email_tokens WHERE user_id = ${userId}`;
      await sql()`DELETE FROM users WHERE id = ${userId}`;
      return errorPage(request, {
        titleKey: "auth.err.emailUnavailableTitle",
        bodyKey: "auth.err.emailUnavailableBody",
        status: 503,
        links: REGISTER_LINKS,
      });
    }
    if (outcome.sent) {
      return noticePage(request, {
        titleKey: "auth.register.checkTitle",
        bodyKey: "auth.register.checkBody",
        bodyArgs: { email },
        links: VERIFY_LINKS,
      });
    }
    // Test mode: NO email left the server. Say exactly that (never "we sent…").
    return noticePage(request, {
      titleKey: "auth.register.noEmailTitle",
      bodyKey: "auth.register.noEmailBody",
      bodyArgs: { email },
      links: VERIFY_LINKS,
    });
  } catch (err: any) {
    if (String(err?.message ?? "").includes("duplicate key")) {
      return handleDuplicateRegistration(request, email);
    }
    console.error("[auth] register failed", err);
    return errorPage(request, {
      titleKey: "auth.err.serverTitle",
      bodyKey: "auth.err.serverBody",
      status: 500,
      links: REGISTER_LINKS,
    });
  }
}

/**
 * Duplicate-email registration. The old response — "if an account exists, a
 * verification link is on its way" — was a false success: no email was sent
 * and, without RESEND_API_KEY, none could be. This reports what is actually
 * true: the account exists, whether it is verified, and whether a fresh
 * verification email was really accepted by the provider.
 */
async function handleDuplicateRegistration(request: Request, email: string): Promise<Response> {
  try {
    await ensureAuthTables();
    const rows = await sql()`
      SELECT id, email_verified_at FROM users WHERE lower(email) = lower(${email}) LIMIT 1
    ` as any;
    const existing = rows[0] as { id: number; email_verified_at: string | null } | undefined;
    if (!existing) {
      // Racy delete between the failed INSERT and this lookup — say something true.
      return errorPage(request, {
        titleKey: "auth.register.duplicateTitle",
        bodyKey: "auth.register.duplicateBody",
        bodyArgs: { email },
        status: 409,
        links: REGISTER_LINKS,
      });
    }
    if (existing.email_verified_at) {
      return noticePage(request, {
        titleKey: "auth.register.duplicateTitle",
        bodyKey: "auth.register.alreadyVerifiedBody",
        bodyArgs: { email },
        links: REGISTER_LINKS,
      });
    }
    if (!emailConfigured()) {
      // Honest: the account is unverified and this environment cannot email.
      return noticePage(request, {
        titleKey: "auth.register.duplicateTitle",
        bodyKey: "auth.register.duplicateUnverifiedBody",
        bodyArgs: { email },
        noticeKey: "auth.register.noEmailNotice",
        links: REGISTER_LINKS,
      });
    }
    const rl = await rateLimit(RESEND_LIMIT_ACTION, clientIp(request));
    if (rl.limited) {
      return noticePage(request, {
        titleKey: "auth.register.duplicateTitle",
        bodyKey: "auth.register.duplicateUnverifiedBody",
        bodyArgs: { email },
        noticeKey: "auth.register.rateLimitedNotice",
        links: REGISTER_LINKS,
      });
    }
    const outcome = await sendVerificationFor(Number(existing.id), email);
    if (outcome.failed) {
      return errorPage(request, {
        titleKey: "auth.err.emailUnavailableTitle",
        bodyKey: "auth.err.emailUnavailableBody",
        status: 503,
        links: REGISTER_LINKS,
      });
    }
    if (outcome.sent) {
      return noticePage(request, {
        titleKey: "auth.register.checkTitle",
        bodyKey: "auth.register.resentBody",
        bodyArgs: { email },
        links: VERIFY_LINKS,
      });
    }
    return noticePage(request, {
      titleKey: "auth.register.duplicateTitle",
      bodyKey: "auth.register.duplicateUnverifiedBody",
      bodyArgs: { email },
      noticeKey: "auth.register.noEmailNotice",
      links: REGISTER_LINKS,
    });
  } catch (err) {
    console.error("[auth] duplicate registration handling failed", err);
    return errorPage(request, {
      titleKey: "auth.err.serverTitle",
      bodyKey: "auth.err.serverBody",
      status: 500,
      links: REGISTER_LINKS,
    });
  }
}

// ---- resend verification (session-guarded) ----------------------------------
/**
 * POST /api/auth/resend-verification — for a logged-in user whose address is
 * still unverified. CSRF-checked, rate-limited 5/hour per IP (same shape as
 * register), and honest: it never claims a send that did not happen.
 */
export async function handleResendVerification(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) {
    return errorPage(request, {
      titleKey: "auth.err.blocked",
      bodyKey: "auth.err.blockedBody",
      status: 403,
      links: NAV_HOME_LOGIN,
    });
  }
  const auth = await requireUser(request);
  if (!auth.ok) {
    return errorPage(request, {
      titleKey: "auth.err.loginRequiredTitle",
      bodyKey: "auth.err.loginRequiredBody",
      status: 401,
      links: NAV_HOME_LOGIN,
    });
  }
  const links = [
    { href: "/login", labelKey: "auth.nav.login" },
    { href: "/", labelKey: "auth.nav.home" },
  ];
  if (auth.user.emailVerified) {
    return noticePage(request, {
      titleKey: "auth.resend.alreadyVerifiedTitle",
      bodyKey: "auth.resend.alreadyVerifiedBody",
      bodyArgs: { email: auth.user.email },
      links,
    });
  }
  const rl = await rateLimit(RESEND_LIMIT_ACTION, clientIp(request));
  if (rl.limited) return rateLimitPage(request, rl.retryAfterSeconds);
  try {
    await ensureAuthTables();
    const outcome = await sendVerificationFor(auth.user.id, auth.user.email);
    if (outcome.failed) {
      return errorPage(request, {
        titleKey: "auth.err.emailUnavailableTitle",
        bodyKey: "auth.err.emailUnavailableBody",
        status: 503,
        links,
      });
    }
    if (outcome.sent) {
      return noticePage(request, {
        titleKey: "auth.resend.sentTitle",
        bodyKey: "auth.resend.sentBody",
        bodyArgs: { email: auth.user.email },
        links,
      });
    }
    return noticePage(request, {
      titleKey: "auth.resend.noEmailTitle",
      bodyKey: "auth.resend.noEmailBody",
      bodyArgs: { email: auth.user.email },
      links,
    });
  } catch (err) {
    console.error("[auth] resend verification failed", err);
    return errorPage(request, {
      titleKey: "auth.err.serverTitle",
      bodyKey: "auth.err.serverBody",
      status: 500,
      links,
    });
  }
}

// ---- resend verification (public, non-enumerating) --------------------------
/**
 * POST /auth/resend-verification-request — Batch F1.
 *
 * For an unverified visitor with NO session (the link expired, they switched
 * device, or the cookie is gone). Until now the only way to obtain a fresh link
 * was to REGISTER AGAIN, and /verify-email offered « S'inscrire à la place » as
 * the only escape — a dead end that also risked a duplicate-account mess. This
 * reuses the ONE issuance path (sendVerificationFor, same as register and the
 * session-guarded resend) so there is still a single place that mints links.
 *
 * Non-enumerating by construction:
 *   - the answer is the same page for an unknown address, an already-verified
 *     address and a real unverified one — the copy is CONDITIONAL ("si un compte
 *     non vérifié existe…") and never asserts that this address received mail;
 *   - "email is not configured here" is an ENVIRONMENT fact, so it gets its own
 *     page for EVERY address (today: no RESEND_API_KEY anywhere);
 *   - a provider delivery failure is logged server-side and still answered with
 *     the same conditional page, so it cannot be used as an existence oracle.
 * CSRF-checked, and rate-limited in its own bucket per IP *and* per address
 * (5/hour each) because this endpoint sends mail to an address the caller chose.
 */
export async function handleResendVerificationRequest(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) return blockedResponse(request, VERIFY_LINKS);
  let email = "";
  try {
    const form = await request.formData();
    email = formValue(form, "email").toLowerCase().slice(0, 320);
  } catch {
    return errorPage(request, {
      titleKey: "auth.err.badRequest",
      bodyKey: "auth.err.badRequestBody",
      status: 400,
      links: VERIFY_LINKS,
    });
  }
  if (!EMAIL_RE.test(email)) {
    return errorPage(request, {
      titleKey: "auth.err.checkDetails",
      bodyKey: "auth.resend.requestBadEmailBody",
      status: 400,
      links: VERIFY_LINKS,
    });
  }
  const ipLimit = await rateLimit("resend-verification-request", clientIp(request));
  if (ipLimit.limited) return rateLimitPage(request, ipLimit.retryAfterSeconds);
  const addrLimit = await rateLimit("resend-verification-request", `email:${sha256Hex(email)}`);
  if (addrLimit.limited) return rateLimitPage(request, addrLimit.retryAfterSeconds);

  if (!emailConfigured()) {
    // Honest, and identical for every address: nothing can leave this server.
    return noticePage(request, {
      titleKey: "auth.resend.requestNoEmailTitle",
      bodyKey: "auth.resend.requestNoEmailBody",
      links: VERIFY_LINKS,
    });
  }
  try {
    await ensureAuthTables();
    const rows = await sql()`
      SELECT id, email, email_verified_at FROM users WHERE lower(email) = lower(${email}) LIMIT 1
    ` as any;
    const existing = rows[0] as { id: number; email: string; email_verified_at: string | null } | undefined;
    if (existing && !existing.email_verified_at) {
      const outcome = await sendVerificationFor(Number(existing.id), existing.email);
      // Never turned into a response difference (see the doc comment): the
      // visitor sees the same conditional page either way.
      if (outcome.failed) console.error(`[auth] resend-verification-request: delivery failed for user ${existing.id}`);
    }
    return noticePage(request, {
      titleKey: "auth.resend.requestSentTitle",
      bodyKey: "auth.resend.requestSentBody",
      bodyArgs: { email },
      links: VERIFY_LINKS,
    });
  } catch (err) {
    console.error("[auth] resend verification request failed", err);
    return errorPage(request, {
      titleKey: "auth.err.serverTitle",
      bodyKey: "auth.err.serverBody",
      status: 500,
      links: VERIFY_LINKS,
    });
  }
}

// ---- login ------------------------------------------------------------------
async function handleLogin(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) return blockedResponse(request);
  let email = "", password = "";
  try {
    const form = await request.formData();
    email = formValue(form, "email").toLowerCase().slice(0, 320);
    password = String(form.get("password") ?? "");
  } catch {
    return errorPage(request, {
      titleKey: "auth.err.badRequest",
      bodyKey: "auth.err.badRequestBody",
      status: 400,
      links: NAV_HOME_LOGIN,
    });
  }
  if (!email || !password) {
    return errorPage(request, {
      titleKey: "auth.err.checkDetails",
      bodyKey: "auth.err.loginFieldsBody",
      status: 400,
      links: NAV_HOME_LOGIN,
    });
  }
  // Rate-limit keys never hold a raw address or token: `rate_limits` is a
  // long-lived table that gets dumped and read during incident work, so both
  // identity components are SHA-256'd before they become a key.
  const rl = await rateLimit("login", `${sha256Hex(email)}|${clientIp(request)}`);
  if (rl.limited) return rateLimitPage(request, rl.retryAfterSeconds);
  // Per-account cap across rotating IPs (the email+IP key alone allows one
  // fresh budget per address an attacker controls).
  const accountRl = await rateLimit("login-account", sha256Hex(email));
  if (accountRl.limited) return rateLimitPage(request, accountRl.retryAfterSeconds);
  try {
    await ensureAuthTables();
    const rows = await sql()`SELECT id, email, name, password_hash, suspended_at, email_verified_at FROM users WHERE lower(email) = lower(${email}) LIMIT 1`;
    const user = rows[0] as any;
    const ok = user ? await verifyPassword(password, user.password_hash) : false;
    if (!user || !ok) {
      // A bare legacy SHA-256 row is refused by verifyPassword (see hash.ts).
      // Say so once per attempt, with the id only — never the address or the
      // password — so the wrap script can be run before/after a deploy.
      if (user && isLegacySha256Hash(user.password_hash)) {
        console.warn(
          `[auth] login refused for user ${user.id}: stored password is a bare sha256 digest — run scripts/security/wrap-legacy-password-hashes.ts --apply`,
        );
      }
      // Same message for unknown email vs wrong password (no enumeration).
      return errorPage(request, {
        titleKey: "auth.err.invalidCredentialsTitle",
        bodyKey: "auth.err.invalidCredentialsBody",
        status: 401,
        links: [
          { href: "/forgot-password", labelKey: "auth.nav.forgot" },
          { href: "/register", labelKey: "auth.nav.register" },
          { href: "/", labelKey: "auth.nav.home" },
        ],
      });
    }
    if (user.suspended_at) {
      // Honest suspension gate: a suspended account cannot log in. The
      // suspension itself is a real DB state set by an admin (safety phase).
      return errorPage(request, {
        titleKey: "auth.err.suspendedTitle",
        bodyKey: "auth.err.suspendedBody",
        status: 403,
        links: NAV_HOME_LOGIN,
      });
    }
    // Unverified-address gate (P0). A registered-but-unverified account must
    // not get a full session while outbound email actually works — that is an
    // address nobody proved they own. When mail delivery is NOT configured
    // (today: no RESEND_API_KEY anywhere) nobody could ever verify, so blocking
    // would lock every user out; the login is allowed and the signed-in UI
    // shows a persistent, truthful "email non vérifiée" banner instead. The
    // branch flips by itself the day the Resend key lands.
    const gate = verificationGate({
      emailVerifiedAt: user.email_verified_at,
      mailConfigured: emailConfigured(),
    });
    if (gate === "block-unverified") {
      // No session is issued, and we say exactly why. `/verify-email` explains
      // the flow; the register form re-issues a verification link for an
      // unverified address (the session-only resend endpoint cannot be used
      // here: refusing the session is the whole point of this branch).
      return errorPage(request, {
        titleKey: "auth.err.unverifiedLoginTitle",
        bodyKey: "auth.err.unverifiedLoginBody",
        bodyArgs: { email: user.email },
        status: 403,
        links: [
          { href: "/verify-email", labelKey: "auth.nav.verify" },
          { href: "/login", labelKey: "auth.nav.login" },
          { href: "/", labelKey: "auth.nav.home" },
        ],
      });
    }
    if (gate === "allow-unverified") {
      // Honest, non-blocking: nothing claims the address is verified.
      console.warn(
        `[auth] login allowed for unverified user ${user.id}: outbound email is not configured, so no verification could ever be sent`,
      );
    }
    // Legacy SHA-256 (bare or scrypt-wrapped) or weaker scrypt parameters:
    // re-hash with the current scheme now that the password is known to match.
    // Compare-and-swap on the old hash so a concurrent reset is never undone.
    if (needsRehash(user.password_hash)) {
      await sql()`UPDATE users SET password_hash = ${await hashPassword(password)}, updated_at = NOW()
                  WHERE id = ${user.id} AND password_hash = ${user.password_hash}`;
    }
    const session = await createSession(request, Number(user.id));
    return redirectResponse("/match", [session.cookieHeader]);
  } catch (err) {
    console.error("[auth] login failed", err);
    return serverErrorResponse(request);
  }
}

// ---- verify email -----------------------------------------------------------
async function handleVerifyEmail(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) return blockedResponse(request);
  const token = formValue(await request.formData().catch(() => new FormData()), "token");
  if (!token) {
    return errorPage(request, {
      titleKey: "auth.err.missingTokenTitle",
      bodyKey: "auth.err.missingTokenBody",
      status: 400,
      links: VERIFY_LINKS,
    });
  }
  // Keyed on the token's hash: rate_limits.key is stored for up to 48 h and
  // must never hold a working credential.
  const rl = await rateLimit("verify-token", `${clientIp(request)}|${sha256Hex(token)}`);
  if (rl.limited) return rateLimitPage(request, rl.retryAfterSeconds);
  try {
    await ensureAuthTables();
    const consumed = await consumeEmailToken(token, "verify");
    if (!consumed.ok && consumed.reason === "used") {
      return errorPage(request, {
        titleKey: "auth.err.linkUsedTitle",
        bodyKey: "auth.err.linkUsedBody",
        status: 404,
        links: [{ href: "/login", labelKey: "auth.nav.login" }],
      });
    }
    if (!consumed.ok) {
      return errorPage(request, {
        titleKey: "auth.err.linkInvalidTitle",
        bodyKey: "auth.err.linkInvalidBody",
        status: 404,
        links: VERIFY_LINKS,
      });
    }
    await sql()`UPDATE users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = ${consumed.userId}`;
    const session = await createSession(request, consumed.userId);
    return redirectResponse("/match/create?verified=1", [session.cookieHeader]);
  } catch (err) {
    console.error("[auth] verify failed", err);
    return serverErrorResponse(request, VERIFY_LINKS);
  }
}

// ---- logout -----------------------------------------------------------------
async function handleLogout(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) return blockedResponse(request);
  await revokeSession(request).catch((e) => console.error("[auth] logout revoke failed", e));
  return redirectResponse("/", [clearSessionCookieHeader(requestIsSecure(request))]);
}

// ---- password reset request -------------------------------------------------
async function handlePasswordResetRequest(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) return blockedResponse(request, RESET_LINKS);
  const email = formValue(await request.formData().catch(() => new FormData()), "email").toLowerCase().slice(0, 320);
  if (!EMAIL_RE.test(email)) {
    return errorPage(request, {
      titleKey: "auth.err.emailInvalidTitle",
      bodyKey: "auth.err.emailInvalidBody",
      status: 400,
      links: RESET_LINKS,
    });
  }
  const rl = await rateLimit("reset-request", sha256Hex(email));
  if (rl.limited) return rateLimitPage(request, rl.retryAfterSeconds);
  try {
    await ensureAuthTables();
    const rows = await sql()`SELECT id FROM users WHERE lower(email) = lower(${email}) LIMIT 1`;
    const user = rows[0] as any;
    let delivered = false;
    if (user) {
      const token = await issueEmailToken(Number(user.id), "reset");
      const mail = await sendMail(passwordResetEmail(email, token));
      if (!mail.ok) {
        return errorPage(request, {
          titleKey: "auth.err.emailUnavailableTitle",
          bodyKey: "auth.err.emailUnavailableBody",
          status: 503,
          links: RESET_LINKS,
        });
      }
      delivered = mail.mode === "prod";
      writeAudit(Number(user.id), "password_reset_requested", {});
    } else {
      console.log(`[auth] password reset requested for unknown email (no email sent): ${email}`);
    }
    // Same page either way (no account enumeration); the copy only claims a
    // send when email delivery is actually configured in this environment.
    if (delivered) {
      return noticePage(request, {
        titleKey: "auth.forgot.checkTitle",
        bodyKey: "auth.forgot.checkBody",
        bodyArgs: { email },
        links: RESET_LINKS,
      });
    }
    if (user) {
      return noticePage(request, {
        titleKey: "auth.forgot.noEmailTitle",
        bodyKey: "auth.forgot.noEmailBody",
        bodyArgs: { email },
        links: RESET_LINKS,
      });
    }
    return noticePage(request, {
      titleKey: "auth.forgot.noEmailTitle",
      bodyKey: "auth.forgot.noEmailUnknownAccountBody",
      links: RESET_LINKS,
    });
  } catch (err) {
    console.error("[auth] reset-request failed", err);
    return serverErrorResponse(request, RESET_LINKS);
  }
}

// ---- password reset (token) -------------------------------------------------
async function handlePasswordReset(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) return blockedResponse(request, RESET_LINKS);
  let token = "", password = "";
  try {
    const form = await request.formData();
    token = formValue(form, "token");
    password = String(form.get("password") ?? "");
  } catch {
    return errorPage(request, {
      titleKey: "auth.err.badRequest",
      bodyKey: "auth.err.badRequestBody",
      status: 400,
      links: RESET_LINKS,
    });
  }
  if (!token) {
    return errorPage(request, {
      titleKey: "auth.err.missingTokenTitle",
      bodyKey: "auth.err.missingTokenBody",
      status: 400,
      links: RESET_LINKS,
    });
  }
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return errorPage(request, {
      titleKey: "auth.err.passwordLengthTitle",
      bodyKey: "auth.err.passwordLengthBody",
      bodyArgs: PASSWORD_RULE_ARGS,
      status: 400,
      links: RESET_LINKS,
    });
  }
  const rl = await rateLimit("reset-token", `${clientIp(request)}|${sha256Hex(token)}`);
  if (rl.limited) return rateLimitPage(request, rl.retryAfterSeconds);
  try {
    await ensureAuthTables();
    const consumed = await consumeEmailToken(token, "reset");
    if (!consumed.ok) {
      return errorPage(request, {
        titleKey: consumed.reason === "used" ? "auth.err.linkUsedTitle" : "auth.err.linkInvalidTitle",
        bodyKey: consumed.reason === "used" ? "auth.err.linkUsedBody" : "auth.err.linkInvalidBody",
        status: 404,
        links: RESET_LINKS,
      });
    }
    await sql()`UPDATE users SET password_hash = ${await hashPassword(password)}, updated_at = NOW() WHERE id = ${consumed.userId}`;
    await revokeAllSessions(consumed.userId);
    writeAudit(consumed.userId, "password_reset", {});
    return redirectResponse("/login?reset=1");
  } catch (err) {
    console.error("[auth] password reset failed", err);
    return serverErrorResponse(request, RESET_LINKS);
  }
}

// ---- password change (authenticated) ----------------------------------------
async function handlePasswordChange(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) return blockedResponse(request, SETTINGS_LINKS);
  const auth = await requireUser(request);
  if (!auth.ok) {
    return errorPage(request, {
      titleKey: "auth.err.loginRequiredTitle",
      bodyKey: "auth.err.loginRequiredBody",
      status: 401,
      links: NAV_HOME_LOGIN,
    });
  }
  let current = "", next = "";
  try {
    const form = await request.formData();
    current = String(form.get("currentPassword") ?? "");
    next = String(form.get("newPassword") ?? "");
  } catch {
    return errorPage(request, {
      titleKey: "auth.err.badRequest",
      bodyKey: "auth.err.badRequestBody",
      status: 400,
      links: SETTINGS_LINKS,
    });
  }
  if (next.length < PASSWORD_MIN_LENGTH || next.length > PASSWORD_MAX_LENGTH) {
    return errorPage(request, {
      titleKey: "auth.err.passwordLengthTitle",
      bodyKey: "auth.err.passwordLengthBody",
      bodyArgs: PASSWORD_RULE_ARGS,
      status: 400,
      links: SETTINGS_LINKS,
    });
  }
  try {
    await ensureAuthTables();
    const rows = await sql()`SELECT password_hash FROM users WHERE id = ${auth.user.id} LIMIT 1`;
    const stored = (rows[0] as any)?.password_hash ?? null;
    if (!(await verifyPassword(current, stored))) {
      return errorPage(request, {
        titleKey: "auth.err.currentPasswordTitle",
        bodyKey: "auth.err.currentPasswordBody",
        status: 403,
        links: SETTINGS_LINKS,
      });
    }
    await sql()`UPDATE users SET password_hash = ${await hashPassword(next)}, updated_at = NOW() WHERE id = ${auth.user.id}`;
    await revokeOtherSessions(request, auth.user.id);
    writeAudit(auth.user.id, "password_changed", {});
    return redirectResponse("/settings?changed=1");
  } catch (err) {
    console.error("[auth] password change failed", err);
    return serverErrorResponse(request, SETTINGS_LINKS);
  }
}

// ---- delete account (authenticated + confirmed) -----------------------------
async function handleDeleteAccount(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) return blockedResponse(request, SETTINGS_LINKS);
  const auth = await requireUser(request);
  if (!auth.ok) {
    return errorPage(request, {
      titleKey: "auth.err.loginRequiredTitle",
      bodyKey: "auth.err.loginRequiredBody",
      status: 401,
      links: NAV_HOME_LOGIN,
    });
  }
  let confirmEmail = "", confirmed = "";
  try {
    const form = await request.formData();
    confirmEmail = formValue(form, "confirmEmail").toLowerCase();
    confirmed = String(form.get("confirm") ?? "");
  } catch {
    return errorPage(request, {
      titleKey: "auth.err.badRequest",
      bodyKey: "auth.err.badRequestBody",
      status: 400,
      links: SETTINGS_LINKS,
    });
  }
  if (confirmed !== "1") {
    return errorPage(request, {
      titleKey: "auth.err.confirmationRequiredTitle",
      bodyKey: "auth.err.confirmationRequiredBody",
      status: 400,
      links: SETTINGS_LINKS,
    });
  }
  if (!constantTimeEqual(confirmEmail, auth.user.email.toLowerCase())) {
    return errorPage(request, {
      titleKey: "auth.err.emailMismatchTitle",
      bodyKey: "auth.err.emailMismatchBody",
      status: 400,
      links: SETTINGS_LINKS,
    });
  }
  const result = await deleteUserAccount(auth.user);
  if (!result.ok) {
    console.error("[auth] account deletion failed", result.error);
    return serverErrorResponse(request, SETTINGS_LINKS);
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
