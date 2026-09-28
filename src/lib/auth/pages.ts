/**
 * FR-first HTML pages for the pre-SSR auth handlers (no React, no Tailwind).
 *
 * WHY THIS EXISTS
 * The native form POSTs (/register, /auth/*) are answered by auth-handler.ts
 * BEFORE the TanStack SSR layer, so they cannot render a route component. The
 * previous implementation answered every error with a bare, English, unstyled
 * page ("Too many attempts", "Link invalid or expired", …) that dropped the
 * user's form input and offered no way back.
 *
 * These helpers render the same page in the site's language model:
 *   - FR primary (the product default), EN still available through the
 *     visitor's `Accept-Language` primary tag, resolved with the EXISTING
 *     i18n dictionary (`t()` from src/lib/i18n) — no new string system.
 *   - Every page carries a visible recovery route (back to home / login /
 *     register / password reset), including the 429 rate-limit page.
 *   - Validation errors re-render the register form with the submitted
 *     name / email / date of birth preserved (never the password).
 *
 * Styling is inline on purpose: this layer runs before SSR, so Tailwind class
 * names would not be guaranteed to exist in the shipped stylesheet.
 */
import { t, DEFAULT_LANG, langFromLocale, type Lang } from "../i18n";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../password-policy";

const NO_STORE = "no-store, max-age=0, must-revalidate";
const BRAND = "#C95D43"; // --pawls-terracotta-500
const INK = "#3d3d3d";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** FR primary: default 'fr', EN when the visitor's browser explicitly asks. */
export function pageLang(request: Request): Lang {
  try {
    const primary = (request.headers.get("accept-language") ?? "").split(",")[0]?.trim() ?? "";
    return langFromLocale(primary);
  } catch {
    return DEFAULT_LANG;
  }
}

/** Fill {placeholders} in a dictionary string (same convention as the UI). */
export function fill(template: string, args: Record<string, string | number> = {}): string {
  let out = template;
  for (const [k, v] of Object.entries(args)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

export interface AuthPageLink {
  href: string;
  /** i18n key for the link label. */
  labelKey: string;
}

function linksHtml(lang: Lang, links: AuthPageLink[]): string {
  if (!links.length) return "";
  return `<p style="margin:22px 0 0;font-size:14px">${links
    .map(
      (l, i) =>
        `${i ? '<span style="color:#c9c2b6"> · </span>' : ""}<a href="${escapeHtml(l.href)}" style="color:${BRAND};font-weight:600;text-decoration:underline">${escapeHtml(t(l.labelKey, lang))}</a>`,
    )
    .join("")}</p>`;
}

/** Standard recovery links so no auth page is a dead end. */
export const NAV_HOME_LOGIN: AuthPageLink[] = [
  { href: "/", labelKey: "auth.nav.home" },
  { href: "/login", labelKey: "auth.nav.login" },
];

interface PageShellOptions {
  lang: Lang;
  title: string;
  inner: string;
  status?: number;
  headers?: Record<string, string>;
}

function pageShell({ lang, title, inner, status = 200, headers = {} }: PageShellOptions): Response {
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} — Pawls</title></head>
<body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#faf6ef;color:${INK};margin:0;padding:24px;display:flex;align-items:flex-start;justify-content:center;min-height:100vh;box-sizing:border-box">
<div style="width:100%;max-width:520px;margin-top:32px">
<a href="/" style="display:inline-block;font-size:20px;font-weight:800;color:#2f2a25;text-decoration:none;letter-spacing:-0.02em">🐾 Pawls</a>
<div style="margin-top:16px;background:#fff;border:1px solid #efe7dc;border-radius:16px;padding:24px;box-shadow:0 8px 24px rgba(61,45,32,0.06)">
<h1 style="font-size:1.35rem;line-height:1.3;margin:0 0 10px;color:#2f2a25">${escapeHtml(title)}</h1>
${inner}
</div>
<p style="margin:16px 0 0;font-size:12px;color:#9a9086">Pawls · <a href="/terms" style="color:#9a9086">${escapeHtml(t("auth.terms", lang))}</a> · <a href="/privacy" style="color:#9a9086">${escapeHtml(t("auth.privacy", lang))}</a></p>
</div>
</body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": NO_STORE, ...headers },
  });
}

export interface ErrorPageOptions {
  titleKey: string;
  bodyKey: string;
  bodyArgs?: Record<string, string | number>;
  status?: number;
  links?: AuthPageLink[];
  /** Adds a Retry-After header (used by the 429 page). */
  retryAfterSeconds?: number;
  /** Extra HTML appended after the message (already escaped by the caller). */
  extraHtml?: string;
}

/** Honest, FR-first error page with a visible recovery route. */
export function errorPage(request: Request, opts: ErrorPageOptions): Response {
  const lang = pageLang(request);
  const inner = `<p style="margin:0;font-size:15px;line-height:1.6;color:#5b5249">${escapeHtml(
    fill(t(opts.bodyKey, lang), opts.bodyArgs ?? {}),
  )}</p>${opts.extraHtml ?? ""}${linksHtml(lang, opts.links ?? NAV_HOME_LOGIN)}`;
  const headers: Record<string, string> = {};
  if (opts.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(Math.max(1, Math.ceil(opts.retryAfterSeconds)));
  }
  return pageShell({ lang, title: t(opts.titleKey, lang), inner, status: opts.status ?? 400, headers });
}

/**
 * Rate-limit page (429). Distinct from errorPage only in that it always tells
 * the visitor how long to wait and — unlike the previous version — always
 * offers routes back into the product.
 */
export function rateLimitPage(request: Request, retryAfterSeconds: number): Response {
  const lang = pageLang(request);
  const inner = `<p style="margin:0;font-size:15px;line-height:1.6;color:#5b5249">${escapeHtml(
    fill(t("auth.err.tooManyBody", lang), { seconds: Math.max(1, Math.ceil(retryAfterSeconds)) }),
  )}</p>
<p style="margin:12px 0 0;font-size:14px;color:#7a7168">${escapeHtml(t("auth.err.tooManyHint", lang))}</p>${linksHtml(lang, [
    { href: "/", labelKey: "auth.nav.home" },
    { href: "/login", labelKey: "auth.nav.login" },
    { href: "/forgot-password", labelKey: "auth.nav.forgot" },
  ])}`;
  return pageShell({
    lang,
    title: t("auth.err.tooManyTitle", lang),
    inner,
    status: 429,
    headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))) },
  });
}

export interface NoticePageOptions {
  titleKey: string;
  bodyKey: string;
  bodyArgs?: Record<string, string | number>;
  /** Honest environment notice (e.g. "email is not configured here"). */
  noticeKey?: string;
  status?: number;
  links?: AuthPageLink[];
}

/** Success / informational page (FR-first). */
export function noticePage(request: Request, opts: NoticePageOptions): Response {
  const lang = pageLang(request);
  const notice = opts.noticeKey
    ? `<p style="margin:12px 0 0;padding:10px 12px;border-radius:10px;background:#fdf3e3;border:1px solid #f0dcbd;font-size:14px;line-height:1.5;color:#8a5a12">${escapeHtml(
        fill(t(opts.noticeKey, lang), opts.bodyArgs ?? {}),
      )}</p>`
    : "";
  const inner = `<p style="margin:0;font-size:15px;line-height:1.6;color:#5b5249">${escapeHtml(
    fill(t(opts.bodyKey, lang), opts.bodyArgs ?? {}),
  )}</p>${notice}${linksHtml(lang, opts.links ?? NAV_HOME_LOGIN)}`;
  return pageShell({ lang, title: t(opts.titleKey, lang), inner, status: opts.status ?? 200 });
}

export interface RegisterFormOptions {
  /** Submitted values, rendered back so the visitor does not retype them. */
  values: { name?: string; email?: string; dateOfBirth?: string; attrToken?: string };
  errorKey: string;
  /** Optional bold heading above the error message. */
  errorTitleKey?: string;
  errorArgs?: Record<string, string | number>;
  status?: number;
}

function field(label: string, control: string, hint?: string): string {
  return `<div style="margin-top:14px"><label style="display:block;font-size:13px;font-weight:600;color:#2f2a25;margin-bottom:6px">${escapeHtml(
    label,
  )}</label>${control}${hint ? `<p style="margin:6px 0 0;font-size:12px;color:#9a9086">${escapeHtml(hint)}</p>` : ""}</div>`;
}

const INPUT_STYLE =
  "width:100%;box-sizing:border-box;border:1px solid #e6dccd;border-radius:999px;padding:12px 18px;font-size:15px;color:#2f2a25;background:#fff";

/**
 * Re-renders the /register form after a server-side validation failure, FR
 * first, with the submitted name / email / date of birth preserved. The
 * password is NEVER echoed back (and is marked as needing to be re-entered).
 */
export function registerFormPage(request: Request, opts: RegisterFormOptions): Response {
  const lang = pageLang(request);
  const maxDob = new Date(Date.now() - 16 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const banner = `<div style="margin:0 0 4px;padding:10px 12px;border-radius:10px;background:#fdeceb;border:1px solid #f6c9c4;font-size:14px;line-height:1.5;color:#a4361f">${
    opts.errorTitleKey
      ? `<p style="margin:0 0 4px;font-weight:700">${escapeHtml(t(opts.errorTitleKey, lang))}</p>`
      : ""
  }<p style="margin:0">${escapeHtml(fill(t(opts.errorKey, lang), opts.errorArgs ?? {}))}</p></div>`;
  const inner = `${banner}
<form action="/register" method="POST">
${opts.values.attrToken ? `<input type="hidden" name="attr_token" value="${escapeHtml(opts.values.attrToken)}">` : ""}
${field(
  t("auth.name", lang),
  `<input name="name" type="text" required autocomplete="name" value="${escapeHtml(opts.values.name ?? "")}" style="${INPUT_STYLE}">`,
)}
${field(
  t("auth.email", lang),
  `<input name="email" type="email" required autocomplete="email" value="${escapeHtml(opts.values.email ?? "")}" style="${INPUT_STYLE}">`,
)}
${field(
  t("auth.dob", lang),
  `<input name="date_of_birth" type="date" required max="${maxDob}" value="${escapeHtml(opts.values.dateOfBirth ?? "")}" style="${INPUT_STYLE}">`,
  t("auth.dobHint", lang),
)}
${field(
  t("auth.password", lang),
  `<input name="password" type="password" required minlength="${PASSWORD_MIN_LENGTH}" maxlength="${PASSWORD_MAX_LENGTH}" autocomplete="new-password" style="${INPUT_STYLE}">`,
  fill(t("auth.register.passwordNote", lang), { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }),
)}
<button type="submit" style="margin-top:20px;width:100%;border:0;border-radius:999px;background:${BRAND};color:#fff;font-size:16px;font-weight:600;padding:14px 20px;cursor:pointer">${escapeHtml(
    t("auth.signUp", lang),
  )}</button>
</form>
<p style="margin:14px 0 0;font-size:12px;color:#9a9086">${escapeHtml(t("auth.agreeTerms", lang))} <a href="/terms" style="color:#9a9086">${escapeHtml(
    t("auth.terms", lang),
  )}</a> ${escapeHtml(t("auth.andPrivacy", lang))} <a href="/privacy" style="color:#9a9086">${escapeHtml(t("auth.privacy", lang))}</a>.</p>
${linksHtml(lang, [
  { href: "/login", labelKey: "auth.nav.login" },
  { href: "/forgot-password", labelKey: "auth.nav.forgot" },
  { href: "/", labelKey: "auth.nav.home" },
])}`;
  return pageShell({ lang, title: t("auth.register.heading", lang), inner, status: opts.status ?? 400 });
}
