/**
 * Campaign attribution — /join acquisition funnel.
 *
 * A strict, fail-safe campaign slug parser plus an HMAC-signed opaque token
 * used to carry a campaign (and an optional generic source) from the /join
 * landing page through registration (which here is an async email-verify
 * funnel that performs auth redirects). Because registration does not complete
 * in a single request, the attribution is persisted server-side, keyed to the
 * real user, at the moment of registration.
 *
 * SECURITY POSTURE
 * - Attribution is PURE METADATA. A valid token grants NO entitlement, no
 *   feature, no role, no privilege. It only decides which analytics event
 *   properties a conversion is tagged with.
 * - The token is HMAC-SHA256 signed with a server-only secret, so a client
 *   cannot mint a token that the server will accept. The server also
 *   re-validates the slug format on verification (defense in depth).
 * - Unknown / malformed / forged tokens fail verification and are simply
 *   dropped: the funnel still works (generic /join experience), and no fake
 *   campaign data is ever recorded.
 */

import { createHmac, createHash } from "node:crypto";
import { constantTimeEqual } from "./auth/hash";

/** Supported campaign prefixes per the plan: venue / event / provider / ad / general. */
export const CAMPAIGN_PREFIXES = ["v", "e", "p", "a", "g"] as const;

// Slug part: lowercase alnum, hyphens, underscores — so it is safe to embed
// in URLs and cannot smuggle markup or separators. No spaces/uppercase.
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export type CampaignInfo = {
  /** Normalized campaign slug, e.g. "v-cafedugrenier". */
  campaign: string;
  /** Optional generic source parameter (e.g. "qr", "ig", sanitized free text). */
  source: string | null;
};

/**
 * Parse + validate a raw `?c=` value. Returns the normalized slug, or null if
 * the value is missing / malformed / has an unsupported prefix. A null result
 * means "degrade to the generic /join experience" — never an error, never
 * treated as real.
 */
export function parseCampaignSlug(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s.length < 3 || s.length > 96) return null;
  const idx = s.indexOf("-");
  if (idx <= 0 || idx === s.length - 1) return null;
  const prefix = s.slice(0, idx);
  if (!(CAMPAIGN_PREFIXES as readonly string[]).includes(prefix)) return null;
  const slug = s.slice(idx + 1);
  if (!SLUG_RE.test(slug)) return null;
  return s;
}

/** Safe, short generic source label. */
export function sanitizeSource(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().slice(0, 80);
  return s ? s : null;
}

/**
 * Server-only signing secret. Derived deterministically so both the SSR /join
 * route and the pre-SSR auth handler (which run in the same deployed
 * environment) produce and verify identical tokens. Falls back to a constant
 * only in the (secretless) local/dev case — never in prod, where DATABASE_URL
 * is always present.
 */
function signingKey(): string {
  const explicit = process.env.PAWLS_ATTR_SIGNING_KEY;
  if (explicit && explicit.trim()) return explicit.trim();
  return createHash("sha256")
    .update(process.env.DATABASE_URL ?? "pawls-dev-attr-secret")
    .digest("hex");
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

/** Build an opaque signed token that carries the campaign + source. */
export function makeAttributionToken(info: CampaignInfo): string {
  // Sign the CANONICAL JSON payload (the same string verify() re-derives from
  // the base64url body) — never the base64url encoding itself, or the
  // signature would never match on verification.
  const json = JSON.stringify({ c: info.campaign, s: info.source ?? "" });
  const payloadB64 = Buffer.from(json, "utf8").toString("base64url");
  return `${payloadB64}.${sign(json)}`;
}

/**
 * Verify a token and return its CampaignInfo, or null when it is malformed,
 * forged, or contains a slug that fails validation. Never throws.
 */
export function verifyAttributionToken(token: unknown): CampaignInfo | null {
  if (typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payloadB64 = token.slice(0, dot);
  const supplied = token.slice(dot + 1);
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = sign(payload);
  if (!constantTimeEqual(expected, supplied)) return null;
  let data: { c?: unknown; s?: unknown };
  try {
    data = JSON.parse(payload) as { c?: unknown; s?: unknown };
  } catch {
    return null;
  }
  const campaign = parseCampaignSlug(data?.c);
  if (!campaign) return null;
  return { campaign, source: sanitizeSource(data?.s) };
}
