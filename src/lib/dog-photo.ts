/**
 * Dog photo storage — server-side core (P0 batch B, launch-critical).
 *
 * WHY THIS EXISTS
 * The /match/create form has always rendered a `<input type="file" name="photo">`
 * ("JPG or PNG, up to 4 MB") but nothing ever persisted it: the file was read,
 * handed to an unconfigured Uploadthing client and silently dropped, so a user
 * could "add a photo" and see it nowhere. Silence was the defect. This module is
 * the single, server-side source of truth for:
 *
 *   1. validation  — JPEG/PNG/WebP only, ≤ 4 MB, content-sniffed (not just the
 *                    client-declared MIME type), FR-first error copy;
 *   2. upload      — Uploadthing v7 `UTApi` (env var `UPLOADTHING_TOKEN`,
 *                    `UPLOADTHING_SECRET` accepted as the legacy alias), with a
 *                    bounded timeout so a hung upload can never hang the form;
 *   3. persistence — `dog_profiles.photo_url`, replace-on-upload / clear-on-remove,
 *                    ownership enforced in SQL (`user_id = session user`);
 *   4. honesty     — when the token is missing, the SDK errors, or the DB write
 *                    fails, the caller gets an explicit failure and the EXISTING
 *                    photo_url is never cleared. No silent discard, ever.
 *
 * No client-side entitlement: every entry point takes the session user id and
 * re-checks ownership in the database. Nothing here trusts a client-provided URL,
 * dog owner, or file type.
 *
 * The 4 MB cap stays under Vercel's ~4.5 MB serverless request-body limit, so a
 * rejected file is rejected by us with honest FR copy instead of a platform 413.
 */
import { sql } from "../db";

/** Hard upload cap — must stay below Vercel's ~4.5MB function body limit. */
export const MAX_DOG_PHOTO_BYTES = 4 * 1024 * 1024;

/** Accepted image MIME types (server-side allowlist). */
export const DOG_PHOTO_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;

const DOG_PHOTO_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

/** Bounded upstream call — a hung Uploadthing request must not hang the form. */
const UPLOAD_TIMEOUT_MS = 15_000;

/** Hosts we are willing to hand a delete request for (our own uploads only). */
const OWN_UPLOAD_HOST = /(^|\.)(uploadthing\.com|ufs\.sh|utfs\.io)$/i;

/**
 * Token state — `ok` / `missing` / `malformed` (P0 hardening, audit §A.2).
 *
 * An uploadthing **v7** token is `base64(JSON { apiKey, appId, regions[] })`.
 * Anything else — a v6 `UPLOADTHING_SECRET`, a truncated paste, a random
 * placeholder — is rejected by the SDK with `INVALID_SERVER_CONFIG` *before a
 * single HTTP request is made*. Without this check that surfaced as a 502
 * "try again in a moment" (a lie: retrying a config error can never succeed)
 * and, on the browser form path, as a silent bounce back to the page.
 *
 * Checking the shape here turns it into an explicit 503 "not configured here"
 * plus one precise server log line, so the next reader knows immediately
 * whether the variable is absent or present-but-wrong.
 */
export type DogPhotoTokenState =
  | { kind: "ok"; token: string }
  | { kind: "missing"; reason: string }
  | { kind: "malformed"; reason: string };

/** Decode + shape-check one candidate token value. Never logs the value. */
export function decodeUploadthingToken(raw: string): DogPhotoTokenState {
  const token = raw.trim();
  if (!token) return { kind: "missing", reason: "value is empty" };
  let decoded: string;
  try {
    decoded = Buffer.from(token, "base64").toString("utf8");
  } catch {
    return { kind: "malformed", reason: "value is not valid base64" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return {
      kind: "malformed",
      reason: "base64 payload is not JSON (a v7 token decodes to {apiKey, appId, regions[]})",
    };
  }
  if (!parsed || typeof parsed !== "object") {
    return { kind: "malformed", reason: "decoded token is not a JSON object" };
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.apiKey !== "string" || !obj.apiKey) {
    return { kind: "malformed", reason: "decoded token has no apiKey" };
  }
  if (typeof obj.appId !== "string" || !obj.appId) {
    return { kind: "malformed", reason: "decoded token has no appId" };
  }
  if (!Array.isArray(obj.regions)) {
    return { kind: "malformed", reason: "decoded token has no regions[]" };
  }
  return { kind: "ok", token };
}

/**
 * Resolve the configured token's state.
 *
 * `UPLOADTHING_TOKEN` is the v7 variable. `UPLOADTHING_SECRET` is kept ONLY to
 * explain the failure: a v6 secret can never work with the v7 SDK, and silently
 * forwarding it produced a 502 nobody could diagnose. It is reported as
 * `malformed` with an actionable reason — never used as a token.
 */
export function dogPhotoTokenState(): DogPhotoTokenState {
  const v7 = process.env.UPLOADTHING_TOKEN;
  if (v7 && v7.trim()) return decodeUploadthingToken(v7);
  const legacy = process.env.UPLOADTHING_SECRET;
  if (legacy && legacy.trim()) {
    return {
      kind: "malformed",
      reason:
        "UPLOADTHING_SECRET is a v6 secret and cannot work with uploadthing v7 — set UPLOADTHING_TOKEN (Uploadthing dashboard → API keys → Token)",
    };
  }
  return { kind: "missing", reason: "UPLOADTHING_TOKEN is not set in this environment" };
}

/** The usable v7 token, or null when storage is not (correctly) configured. */
export function dogPhotoToken(): string | null {
  const state = dogPhotoTokenState();
  return state.kind === "ok" ? state.token : null;
}

/**
 * True when real object storage is configured AND the credential is usable.
 * Never faked, never defaulted — a malformed token is NOT "configured".
 */
export function isDogPhotoUploadConfigured(): boolean {
  return dogPhotoTokenState().kind === "ok";
}

export interface PhotoFailure {
  ok: false;
  status: number;
  /** i18n key pair — rendered by the caller as an FR-first honest page. */
  titleKey: string;
  bodyKey: string;
  /** Server-side detail for the logs only; never shown to the user. */
  log: string;
}

export type PhotoValidation = { ok: true; file: File } | PhotoFailure;

/** Magic-byte sniff: the declared MIME type alone is not proof of anything. */
async function sniffImage(file: File): Promise<"jpeg" | "png" | "webp" | null> {
  let head: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  } catch (err) {
    console.error("[dog-photo] could not read file header", err);
    return null;
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (
    head.length >= 8 &&
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
    head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
  ) {
    return "png";
  }
  if (
    head.length >= 12 &&
    head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 && // "RIFF"
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50 // "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/**
 * Validate an uploaded file before it ever reaches object storage.
 * Rejects empty, oversized, mislabelled and non-image payloads with FR copy.
 */
export async function validateDogPhotoFile(value: unknown): Promise<PhotoValidation> {
  if (!(value instanceof File) || value.size === 0) {
    return {
      ok: false,
      status: 400,
      titleKey: "photo.err.missingTitle",
      bodyKey: "photo.err.missingBody",
      log: "no file part (or empty file) in the photo form",
    };
  }
  if (value.size > MAX_DOG_PHOTO_BYTES) {
    return {
      ok: false,
      status: 400,
      titleKey: "photo.err.tooLargeTitle",
      bodyKey: "photo.err.tooLargeBody",
      log: `file too large: ${value.size} bytes`,
    };
  }
  const name = (value.name ?? "").toLowerCase();
  const mime = (value.type ?? "").toLowerCase();
  const extOk = DOG_PHOTO_EXTS.some((ext) => name.endsWith(ext));
  const mimeOk = (DOG_PHOTO_MIMES as readonly string[]).includes(mime);
  if (!mimeOk && !extOk) {
    return {
      ok: false,
      status: 400,
      titleKey: "photo.err.badTypeTitle",
      bodyKey: "photo.err.badTypeBody",
      log: `rejected type mime=${mime || "(none)"} name=${name || "(none)"}`,
    };
  }
  const sniffed = await sniffImage(value);
  if (sniffed === null) {
    return {
      ok: false,
      status: 400,
      titleKey: "photo.err.badTypeTitle",
      bodyKey: "photo.err.badTypeBody",
      log: `content sniff failed (declared ${mime || "none"}) — not a JPEG/PNG/WebP payload`,
    };
  }
  return { ok: true, file: value };
}

/** Bounded fetch handed to the Uploadthing SDK (see UTApiOptions.fetch). */
function boundedFetch(input: unknown, init?: Record<string, unknown>): Promise<Response> {
  const signal = AbortSignal.timeout(UPLOAD_TIMEOUT_MS);
  return fetch(input as RequestInfo, { ...(init ?? {}), signal } as RequestInit);
}

/**
 * Map an Uploadthing SDK error to an honest failure (audit §A.3).
 *
 * `INVALID_SERVER_CONFIG` / `MISSING_ENV` mean the credential is wrong, not that
 * the network hiccuped: the SDK rejects it before any HTTP call, so "try again
 * in a moment" would be false and endlessly repeated. Those map to **503** with
 * the plain-language "upload is not enabled here, nothing was saved, your
 * current photo is unchanged" copy. Everything else stays a 502 "upload failed".
 */
export function mapUploadthingError(error: unknown): PhotoFailure {
  const code = String((error as any)?.code ?? "");
  const message = String((error as any)?.message ?? "");
  if (code === "INVALID_SERVER_CONFIG" || code === "MISSING_ENV") {
    return {
      ok: false,
      status: 503,
      titleKey: "photo.err.notConfiguredTitle",
      bodyKey: "photo.err.notConfiguredBody",
      log: `uploadthing ${code} — token rejected before any HTTP request; replace UPLOADTHING_TOKEN with a v7 token from the Uploadthing dashboard`,
    };
  }
  return {
    ok: false,
    status: 502,
    titleKey: "photo.err.uploadFailedTitle",
    bodyKey: "photo.err.uploadFailedBody",
    log: `uploadthing error${code ? ` ${code}` : ""}${message ? `: ${message.slice(0, 200)}` : ""}`,
  };
}

/**
 * Upload one validated photo to object storage.
 * uploadthing v7 `uploadFiles()` RESOLVES with `{ data: null, error }` instead of
 * throwing, so both the resolved error and a thrown SDK/network error are handled.
 * This function NEVER touches the database — a failed upload cannot clear or
 * overwrite the user's existing photo.
 */
export async function uploadDogPhoto(
  file: File,
): Promise<{ ok: true; url: string } | PhotoFailure> {
  const state = dogPhotoTokenState();
  if (state.kind !== "ok") {
    // Honest degradation, with the reason spelled out in ONE log line:
    // "missing" (variable absent) and "malformed" (present but not a v7 token)
    // are different problems and must not look alike in the logs.
    console.error(`[dog-photo] storage config ${state.kind}: ${state.reason}`);
    return {
      ok: false,
      status: 503,
      titleKey: "photo.err.notConfiguredTitle",
      bodyKey: "photo.err.notConfiguredBody",
      log: `object storage not configured (${state.kind}): ${state.reason}`,
    };
  }
  try {
    const { UTApi } = await import("uploadthing/server");
    const utapi = new UTApi({ token: state.token, fetch: boundedFetch as unknown as typeof fetch });
    const res = await utapi.uploadFiles(file);
    if (res?.error) {
      const mapped = mapUploadthingError(res.error);
      console.error(`[dog-photo] upload rejected (${mapped.status}): ${mapped.log}`);
      return mapped;
    }
    const url = res?.data?.url;
    if (!url) {
      console.error("[dog-photo] uploadthing returned no URL");
      return {
        ok: false,
        status: 502,
        titleKey: "photo.err.uploadFailedTitle",
        bodyKey: "photo.err.uploadFailedBody",
        log: "uploadthing resolved without data.url",
      };
    }
    return { ok: true, url };
  } catch (err) {
    const mapped = mapUploadthingError(err);
    console.error(
      `[dog-photo] upload threw (${mapped.status}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return mapped;
  }
}

export interface DogPhotoTarget {
  ok: true;
  dogId: number;
  dogName: string;
  previousPhotoUrl: string | null;
}

export type DogPhotoTargetFailure = PhotoFailure;

/**
 * Ownership check for a photo change: the dog must exist AND belong to the
 * session user. Both "no such dog" and "someone else's dog" answer with the same
 * 403 so the endpoint cannot be used to enumerate other people's dog ids.
 */
export async function ownedDogPhotoTarget(
  sessionUserId: number,
  rawDogId: unknown,
): Promise<DogPhotoTarget | DogPhotoTargetFailure> {
  const dogId = Number(rawDogId);
  if (!Number.isSafeInteger(dogId) || dogId <= 0) {
    return {
      ok: false,
      status: 400,
      titleKey: "photo.err.badRequestTitle",
      bodyKey: "photo.err.badRequestBody",
      log: `invalid dogId: ${String(rawDogId)}`,
    };
  }
  try {
    const rows = (await sql()`
      SELECT id, dog_name, photo_url
      FROM dog_profiles
      WHERE id = ${dogId} AND user_id = ${sessionUserId}
      LIMIT 1
    `) as Array<{ id: number; dog_name: string | null; photo_url: string | null }>;
    if (!rows.length) {
      return {
        ok: false,
        status: 403,
        titleKey: "photo.err.forbiddenTitle",
        bodyKey: "photo.err.forbiddenBody",
        log: `dog ${dogId} does not exist or is not owned by user ${sessionUserId}`,
      };
    }
    return {
      ok: true,
      dogId: Number(rows[0].id),
      dogName: String(rows[0].dog_name ?? ""),
      previousPhotoUrl: rows[0].photo_url ? String(rows[0].photo_url) : null,
    };
  } catch (err) {
    console.error("[dog-photo] ownership lookup failed", err);
    return {
      ok: false,
      status: 503,
      titleKey: "photo.err.dbTitle",
      bodyKey: "photo.err.dbBody",
      log: `ownership lookup failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Persist (or clear) `dog_profiles.photo_url` for a dog the caller already owns.
 * Ownership is re-asserted inside the UPDATE so a race can never write to another
 * user's row; `RETURNING id` proves a row was actually written.
 */
export async function setDogPhotoUrl(
  sessionUserId: number,
  dogId: number,
  photoUrl: string | null,
): Promise<{ ok: true } | PhotoFailure> {
  try {
    const rows = (await sql()`
      UPDATE dog_profiles
      SET photo_url = ${photoUrl}, updated_at = NOW()
      WHERE id = ${dogId} AND user_id = ${sessionUserId}
      RETURNING id
    `) as Array<{ id: number }>;
    if (!rows.length) {
      return {
        ok: false,
        status: 403,
        titleKey: "photo.err.forbiddenTitle",
        bodyKey: "photo.err.forbiddenBody",
        log: `photo update matched no owned row (dog ${dogId}, user ${sessionUserId})`,
      };
    }
    return { ok: true };
  } catch (err) {
    console.error("[dog-photo] persisting photo_url failed", err);
    return {
      ok: false,
      status: 500,
      titleKey: "photo.err.saveFailedTitle",
      bodyKey: "photo.err.saveFailedBody",
      log: `photo_url update failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** File key of one of OUR uploads, or null when the URL is not ours. */
function ownUploadKey(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!OWN_UPLOAD_HOST.test(parsed.hostname)) return null;
  const m = parsed.pathname.match(/\/f\/([^/?#]+)$/);
  return m ? m[1] : null;
}

/**
 * Best-effort cleanup of the file an upload just replaced, so replacing a photo
 * repeatedly does not leak orphaned objects (and never a dangling paid quota).
 *
 * Deliberately conservative and strictly non-fatal:
 *   - only for uploadthing URLs we recognise (never a user-pasted URL);
 *   - only when no OTHER dog row still references the same URL;
 *   - failures are logged, never surfaced — the new photo is already saved.
 */
export async function deleteSupersededDogPhoto(
  oldUrl: string | null,
  replacedDogId: number,
): Promise<void> {
  if (!oldUrl) return;
  const key = ownUploadKey(oldUrl);
  if (!key || !isDogPhotoUploadConfigured()) return;
  try {
    const other = (await sql()`
      SELECT id FROM dog_profiles WHERE photo_url = ${oldUrl} AND id <> ${replacedDogId} LIMIT 1
    `) as Array<{ id: number }>;
    if (other.length) return; // still referenced elsewhere — leave it alone
    const { UTApi } = await import("uploadthing/server");
    const utapi = new UTApi({
      token: dogPhotoToken() as string,
      fetch: boundedFetch as unknown as typeof fetch,
    });
    const res = await utapi.deleteFiles(key);
    if (res?.error) console.error("[dog-photo] superseded file delete reported an error", res.error);
  } catch (err) {
    console.error("[dog-photo] superseded file delete failed (non-fatal)", err);
  }
}
