/**
 * Native POST /api/match/dog/photo — authenticated dog-photo upload / replace /
 * remove (P0 batch B).
 *
 * Wired into the SAME pre-SSR path as the rest of the Match API (serve.ts and
 * vercel-entry.ts both route `/api/match/*` to match-api-handler.ts, which
 * delegates here), so no new server wiring and no client-side entitlement.
 *
 * Contract (server-enforced):
 *   - POST only; same-site Origin/Referer required (else 403).
 *   - Session required — no session => 401, nothing is written.
 *   - The dog must exist AND belong to the session user — else 403 (same reply
 *     for "no such dog" and "not yours": no id enumeration).
 *   - multipart/form-data: dogId, optional `action=remove`, optional `photo`,
 *     optional `next` (same-site path only).
 *   - Photo: JPEG/PNG/WebP, ≤ 4 MB, content-sniffed. Anything else => 400 FR copy.
 *   - Upload failure (no token / SDK error / timeout) => 502/503 FR copy and the
 *     EXISTING photo_url is left exactly as it was — never cleared, never lost.
 *   - Success => photo_url replaced (or cleared for `action=remove`) and either a
 *     302 back to `next` (browser form) or 200 JSON (API client).
 *
 * Responses are FR-first honest pages for browser submissions (Accept: text/html,
 * with recovery links) and controlled JSON otherwise — the same status code either
 * way, so the behaviour is identical for a human and for a test harness.
 */
import {
  ownedDogPhotoTarget,
  setDogPhotoUrl,
  uploadDogPhoto,
  validateDogPhotoFile,
  deleteSupersededDogPhoto,
  type PhotoFailure,
} from "./dog-photo";
import { errorPage, pageLang, type AuthPageLink } from "./auth/pages";
import { assertSameOrigin } from "./auth/csrf";
import { t } from "./i18n";

const NO_STORE = "no-store, max-age=0, must-revalidate";

const MY_DOGS: AuthPageLink = { href: "/match/my-dogs", labelKey: "photo.nav.myDogs" };
const HOME: AuthPageLink = { href: "/", labelKey: "auth.nav.home" };
const LOGIN: AuthPageLink = { href: "/login", labelKey: "auth.nav.login" };

/** Browser form submission (Accept: text/html) => HTML page; otherwise JSON. */
function wantsHtml(request: Request): boolean {
  const accept = (request.headers.get("accept") ?? "").toLowerCase();
  if (!accept) return false;
  if (accept.includes("application/json")) return false;
  return accept.includes("text/html");
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": NO_STORE },
  });
}

/** Only same-site absolute paths may be used as a redirect target. */
function safeNext(raw: string): string | null {
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.includes("\\") || raw.includes("\n") || raw.includes("\r")) return null;
  return raw;
}

function fail(
  request: Request,
  failure: PhotoFailure,
  code: string,
  links: AuthPageLink[],
): Response {
  console.error(`[dog-photo] ${code} (${failure.status}): ${failure.log}`);
  if (wantsHtml(request)) {
    return errorPage(request, {
      titleKey: failure.titleKey,
      bodyKey: failure.bodyKey,
      status: failure.status,
      links,
    });
  }
  return json(
    { ok: false, error: code, message: t(failure.bodyKey, pageLang(request)) },
    failure.status,
  );
}

export async function handleDogPhotoRequest(
  request: Request,
  sessionUser: { id: number } | null,
): Promise<Response> {
  if (request.method !== "POST") {
    return fail(
      request,
      {
        ok: false,
        status: 405,
        titleKey: "photo.err.badRequestTitle",
        bodyKey: "photo.err.badRequestBody",
        log: `${request.method} is not allowed on this endpoint`,
      },
      "METHOD_NOT_ALLOWED",
      [MY_DOGS, HOME],
    );
  }

  // CSRF: same-site Origin/Referer, exactly like every other mutating endpoint.
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) {
    return fail(
      request,
      {
        ok: false,
        status: 403,
        titleKey: "auth.err.blocked",
        bodyKey: "auth.err.blockedBody",
        log: `csrf rejected: ${csrf.error}`,
      },
      "CSRF",
      [MY_DOGS, HOME],
    );
  }

  // Identity comes from the session cookie only — never from the form.
  if (!sessionUser) {
    return fail(
      request,
      {
        ok: false,
        status: 401,
        titleKey: "photo.err.unauthTitle",
        bodyKey: "photo.err.unauthBody",
        log: "no session on a dog-photo request",
      },
      "UNAUTHENTICATED",
      [LOGIN, HOME],
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    return fail(
      request,
      {
        ok: false,
        status: 400,
        titleKey: "photo.err.badRequestTitle",
        bodyKey: "photo.err.badRequestBody",
        log: `form parse failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      "BAD_REQUEST",
      [MY_DOGS, HOME],
    );
  }

  const action = String(form.get("action") ?? "upload").trim() || "upload";
  const next = safeNext(String(form.get("next") ?? "").trim());

  // Ownership in SQL: the dog must exist AND belong to the session user.
  const target = await ownedDogPhotoTarget(sessionUser.id, form.get("dogId"));
  if (!target.ok) return fail(request, target, "FORBIDDEN", [MY_DOGS, HOME]);

  if (action === "remove") {
    const cleared = await setDogPhotoUrl(sessionUser.id, target.dogId, null);
    if (!cleared.ok) return fail(request, cleared, "SAVE_FAILED", [MY_DOGS, HOME]);
    console.log(`[dog-photo] removed photo for dog ${target.dogId} (user ${sessionUser.id})`);
    return success(request, next ?? "/match/my-dogs?photo=removed", { photoUrl: null });
  }

  if (action !== "upload") {
    return fail(
      request,
      {
        ok: false,
        status: 400,
        titleKey: "photo.err.badRequestTitle",
        bodyKey: "photo.err.badRequestBody",
        log: `unknown action "${action}"`,
      },
      "BAD_REQUEST",
      [MY_DOGS, HOME],
    );
  }

  const validation = await validateDogPhotoFile(form.get("photo"));
  if (!validation.ok) return fail(request, validation, "INVALID_PHOTO", [MY_DOGS, HOME]);

  // Upload first, persist second: a failed upload cannot touch the stored URL.
  const uploaded = await uploadDogPhoto(validation.file);
  if (!uploaded.ok) return fail(request, uploaded, "UPLOAD_FAILED", [MY_DOGS, HOME]);

  const saved = await setDogPhotoUrl(sessionUser.id, target.dogId, uploaded.url);
  if (!saved.ok) return fail(request, saved, "SAVE_FAILED", [MY_DOGS, HOME]);

  console.log(
    `[dog-photo] dog ${target.dogId} (user ${sessionUser.id}) photo_url replaced (${uploaded.url})`,
  );
  // Non-fatal housekeeping: drop the file we just replaced (if it was ours).
  await deleteSupersededDogPhoto(target.previousPhotoUrl, target.dogId);

  return success(request, next ?? "/match/my-dogs?photo=saved", { photoUrl: uploaded.url });
}

/** Browser form: 302 back into the page. API client: 200 with the stored URL. */
function success(
  request: Request,
  next: string,
  body: { photoUrl: string | null },
): Response {
  if (wantsHtml(request)) {
    return new Response(null, {
      status: 302,
      headers: { Location: next, "Cache-Control": NO_STORE },
    });
  }
  return json({ ok: true, ...body }, 200);
}
