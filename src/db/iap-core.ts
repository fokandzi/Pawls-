/**
 * Security Finding #8 — RevenueCat / In-App-Purchase Plus-entitlement webhook.
 *
 * Direct counterpart of Finding #9 (src/db/webhook-core.ts, commit f344576):
 * the SAME standards applied to the RevenueCat path so Pawls Plus can never
 * become an entitlement hole when it activates.
 *
 * Non-negotiable principles implemented here:
 *  - Entitlement is resolved ONLY from RevenueCat's IMMUTABLE `app_user_id`
 *    (its stable subscriber id), mapped to a real Pawls users.id. The
 *    client-set subscriber_attributes.email (and any email-looking app_user_id)
 *    is INFORMATIONAL ONLY and never grants anything by itself.
 *  - app_user_id is resolved to a users.id via the server-side convention
 *    `pawls_<userId>` / `user:<userId>` / `rc_<userId>` / bare numeric id, or a
 *    mapping previously persisted on the subscriptions row
 *    (revenuecat_app_user_id). Unresolvable -> alert + NO entitlement (fail closed).
 *  - Fail-closed secret handling in production: a missing or `replace_me`
 *    REVENUECAT_WEBHOOK_SECRET returns 500 + writes a webhook_alerts row —
 *    NEVER a silent `200 {received:true}` ack that drops real events.
 *  - Signature verification happens before ANY processing (raw secret header or
 *    HMAC-SHA256 signing-proxy header; same two-mode verification the previous
 *    implementation used, now enforced against the fail-closed secret gate).
 *  - Idempotency uses the SAME atomic processed_webhook_events claim as #9 —
 *    replayed events cannot double-transition.
 *  - Plus is NOT an active product in Phase 1 — this is defense-in-depth
 *    hardening of a not-yet-active path. Nothing here "turns on" Plus or
 *    fabricates entitlements/pricing.
 */
import { sql } from "../db";
import {
  ensureWebhookTablesOnce,
  claimWebhookEvent,
  completeWebhookEvent,
  releaseWebhookEvent,
  writeWebhookAlert,
  isProdEnv,
  userIdFromString,
} from "./webhook-core";

// ─── Event taxonomy (RevenueCat event names) ───────────────────────────────────

const ACTIVE_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "NON_RENEWING_PURCHASE",
]);
const INACTIVE_EVENTS = new Set(["CANCELLATION", "EXPIRATION"]);

export type RcWebhookOpts = {
  /** Overrides process.env.REVENUECAT_WEBHOOK_SECRET (tests). */
  secret?: string;
  /** Overrides prod detection (tests). */
  isProd?: boolean;
};

// ─── Additive schema (subscriptions columns keyed by immutable identity) ──────

async function ensureSubscriptionsColumns() {
  await sql()`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS user_id INTEGER`;
  await sql()`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS revenuecat_app_user_id TEXT`;
  // Email is INFORMATIONAL ONLY (never identity). The legacy table declared
  // email NOT NULL; that constraint must not force us to fabricate an email to
  // grant a real entitlement. Relaxed to nullable — additive in effect, fully
  // reversible (SET NOT NULL once no NULLs remain), touches no existing rows.
  await sql()`ALTER TABLE subscriptions ALTER COLUMN email DROP NOT NULL`;
}

/** Deterministic event id for idempotency (RevenueCat always sends `id`). */
function eventKey(event: Record<string, any>): string {
  if (typeof event.id === "string" && event.id.trim()) return event.id.trim();
  const tx =
    event.transaction_id ??
    event.store_transaction_id ??
    event.original_transaction_id ??
    event.transfer_id ??
    "no_tx";
  return `rc_${String(event.type ?? "event")}_${String(event.app_user_id ?? "no_user")}_${String(tx)}`;
}

/**
 * Resolve RevenueCat's immutable app_user_id to a Pawls users.id.
 * 1. Direct immutable parse (`pawls_<id>`, `user:<id>`, `rc_<id>`, `<id>`)
 *    verified against the users table.
 * 2. Persisted mapping on an existing subscription row
 *    (revenuecat_app_user_id -> user_id).
 * NEVER resolves from email, and an email-looking app_user_id is NOT a valid
 * identity (userIdFromString requires digits).
 */
export async function resolveRevenueCatUser(appUserId: unknown): Promise<number | null> {
  if (appUserId === null || appUserId === undefined) return null;
  const raw = String(appUserId).trim();
  if (!raw) return null;

  const direct = userIdFromString(raw);
  if (direct) {
    const [u] = await sql()`SELECT id FROM users WHERE id = ${direct}`;
    if (u) return direct;
    return null; // numeric mapping to a non-existent user -> NOT resolvable
  }

  const [mapped] = await sql()`
    SELECT user_id FROM subscriptions
    WHERE revenuecat_app_user_id = ${raw} AND user_id IS NOT NULL
    LIMIT 1
  `;
  if (mapped?.user_id) return Number(mapped.user_id);
  return null;
}

// ─── Entitlement transition (keyed by users.id; email informational only) ─────

async function upsertPlusEntitlement(opts: {
  userId: number;
  appUserId: string;
  email?: string | null;
  status: "active" | "canceled";
}) {
  const email = opts.email ? String(opts.email).trim().toLowerCase() : null;
  const up = await sql()`
    UPDATE subscriptions SET
      plan = 'pawnder-plus',
      status = ${opts.status},
      revenuecat_app_user_id = COALESCE(${opts.appUserId}, revenuecat_app_user_id),
      email = COALESCE(${email}, email),
      updated_at = NOW()
    WHERE user_id = ${opts.userId}
    RETURNING id
  `;
  if (up.length > 0) return;
  // Claim a legacy email-bound row (informational email) that has no user binding.
  if (email) {
    const legacy = await sql()`
      UPDATE subscriptions SET
        user_id = ${opts.userId},
        plan = 'pawnder-plus',
        status = ${opts.status},
        revenuecat_app_user_id = COALESCE(${opts.appUserId}, revenuecat_app_user_id),
        email = COALESCE(${email}, email),
        updated_at = NOW()
      WHERE lower(email) = ${email} AND user_id IS NULL
      RETURNING id
    `;
    if (legacy.length > 0) return;
  }
  try {
    await sql()`
      INSERT INTO subscriptions (user_id, email, plan, status, revenuecat_app_user_id)
      VALUES (${opts.userId}, ${email}, 'pawnder-plus', ${opts.status}, ${opts.appUserId})
    `;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23505" && email) {
      // Unique-email row owned by another user_id: same email = same account, re-bind.
      await sql()`
        UPDATE subscriptions SET
          user_id = ${opts.userId},
          plan = 'pawnder-plus',
          status = ${opts.status},
          revenuecat_app_user_id = COALESCE(${opts.appUserId}, revenuecat_app_user_id),
          updated_at = NOW()
        WHERE lower(email) = ${email}
      `;
      return;
    }
    throw err;
  }
}

/** Informational email extraction — stored verbatim, NEVER used as identity. */
function eventEmail(event: Record<string, any>): string | null {
  const attrs = event.subscriber_attributes || event.subscriber_attributes_by_key || {};
  const value = attrs.email?.value || attrs.$email?.value || event.email || event.properties?.email;
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s.toLowerCase() : null;
}

// ─── Event processing (deterministic + injectable; no live RevenueCat) ────────

export type RcHandlerResult =
  | { ok: true; note?: string; code?: string }
  | { ok: false; code: string; message: string };

export async function processRevenueCatEvent(
  event: Record<string, any>,
): Promise<{ ok: boolean; duplicate?: boolean; note?: string; code?: string; status?: number }> {
  await ensureWebhookTablesOnce();
  await ensureSubscriptionsColumns();

  const eid = eventKey(event);
  const eventType = String(event.type ?? "event");
  const claim = await claimWebhookEvent(eid, eventType);
  if (claim === "duplicate") {
    return { ok: true, duplicate: true, note: "already processed", status: 200 };
  }

  try {
    const rawType = String(event.type ?? "").toUpperCase();
    const failAlert = async (code: string, message: string, details?: Record<string, unknown>) => {
      await writeWebhookAlert({ eventId: eid, eventType, code, severity: "error", message, details: details ?? null });
      await releaseWebhookEvent(eid);
      return { ok: false as const, code, status: 500 as const };
    };

    if (ACTIVE_EVENTS.has(rawType) || rawType === "NON_RENEWING_PURCHASE") {
      const appUserId = event.app_user_id === undefined || event.app_user_id === null ? null : String(event.app_user_id).trim();
      if (!appUserId) {
        return await failAlert("PLUS_USER_UNRESOLVED", "RevenueCat active event without a resolvable app_user_id — entitlement NOT granted", { type: rawType });
      }
      const userId = await resolveRevenueCatUser(appUserId);
      if (!userId) {
        return await failAlert(
          "PLUS_USER_UNRESOLVED",
          "RevenueCat app_user_id could not be resolved to an immutable users.id (email alone is never identity) — entitlement NOT granted",
          { appUserId, type: rawType },
        );
      }
      const [user] = await sql()`SELECT id FROM users WHERE id = ${userId}`;
      if (!user) {
        return await failAlert("PLUS_USER_NOT_FOUND", `RevenueCat app_user_id resolved to users.id ${userId} which does not exist — entitlement NOT granted`, { appUserId, userId });
      }
      await upsertPlusEntitlement({ userId, appUserId, email: eventEmail(event), status: "active" });
      console.log(`[iap] Renewal/purchase granted active Plus for users.id ${userId} (app_user_id ${appUserId})`);
    } else if (INACTIVE_EVENTS.has(rawType)) {
      const appUserId = event.app_user_id === undefined || event.app_user_id === null ? null : String(event.app_user_id).trim();
      if (!appUserId) {
        return await failAlert("PLUS_USER_UNRESOLVED", `RevenueCat ${rawType} event without a resolvable app_user_id — status NOT flipped`, { type: rawType });
      }
      const userId = await resolveRevenueCatUser(appUserId);
      if (!userId) {
        return await failAlert("PLUS_USER_UNRESOLVED", `RevenueCat ${rawType} event could not resolve to an immutable users.id — status NOT flipped`, { appUserId, type: rawType });
      }
      await sql()`UPDATE subscriptions SET status = 'canceled', updated_at = NOW() WHERE user_id = ${userId}`;
      console.log(`[iap] ${rawType} — Plus canceled for users.id ${userId}`);
    } else {
      // RevenueCat also sends BILLING_ISSUE, SUBSCRIPTION_PAUSED, TRANSFER,
      // EXPIRATION_NON_SUBSCRIPTION, etc. — none of them grant or revoke Plus.
      await completeWebhookEvent(eid);
      return { ok: true, note: "unhandled event type — ignored", status: 200 };
    }

    await completeWebhookEvent(eid);
    return { ok: true, status: 200 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeWebhookAlert({ eventId: eid, eventType, code: "WEBHOOK_PROCESSING_ERROR", severity: "error", message, details: { type: event.type ?? null } });
    await releaseWebhookEvent(eid);
    return { ok: false, code: "WEBHOOK_PROCESSING_ERROR", status: 500 };
  }
}

// ─── Signature verification ────────────────────────────────────────────────────

async function validSignature(body: string, signature: string, secret: string): Promise<boolean> {
  const bytes = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", bytes.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes.encode(body)));
  const expected = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
  return signature === expected || signature === `sha256=${expected}`;
}

// ─── HTTP entry point (signature verification + fail-closed secret) ───────────

/**
 * Full RevenueCat webhook request handler. The live route
 * (src/routes/api/iap/validate.ts) calls this; tests inject `opts`.
 * In production a missing/`replace_me` REVENUECAT_WEBHOOK_SECRET FAILS CLOSED
 * (500 + alert) — never a silent 200 ack for real unprocessed events.
 */
export async function handleRevenueCatWebhookRequest(request: Request, opts?: RcWebhookOpts): Promise<Response> {
  const json = (data: unknown, status: number): Response =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

  const isProd = opts?.isProd ?? isProdEnv();
  const secret = opts?.secret !== undefined ? opts.secret : process.env.REVENUECAT_WEBHOOK_SECRET;

  if (!secret || secret === "replace_me") {
    if (isProd) {
      const message = "REVENUECAT_WEBHOOK_SECRET is not configured — refusing to process webhook (fail closed)";
      console.error(`[iap] ${message}`);
      try {
        await ensureWebhookTablesOnce();
        await ensureSubscriptionsColumns();
        await writeWebhookAlert({ eventId: null, eventType: null, code: "REVENUECAT_SECRET_MISSING", severity: "error", message, details: { env: { NODE_ENV: process.env.NODE_ENV ?? null, VERCEL_ENV: process.env.VERCEL_ENV ?? null } } });
      } catch { /* alert best-effort */ }
      return json({ error: "webhook processing unavailable", code: "REVENUECAT_SECRET_MISSING" }, 500);
    }
    console.warn("[iap] REVENUECAT_WEBHOOK_SECRET not configured (or replace_me) — acknowledging but not processing (dev/test only)");
    return json({ received: true, note: "Webhook secret not configured (dev) — not processed" }, 200);
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return json({ error: "Failed to read request body" }, 400);
  }

  // RevenueCat sends the configured webhook secret in the
  // x-revenuecat-signature header; deployments behind an HMAC signing proxy may
  // send `sha256=<hex>` instead (or in `authorization`). Both are verified
  // against the server-side secret — nothing client-supplied is trusted.
  const signature = request.headers.get("x-revenuecat-signature") || request.headers.get("authorization") || "";
  if (!(signature === secret || (signature.startsWith("sha256=") && (await validSignature(body, signature, secret))))) {
    return json({ error: "Invalid webhook signature" }, 401);
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(body) as Record<string, any>;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const event = payload.event && typeof payload.event === "object" ? payload.event : payload;

  const result = await processRevenueCatEvent(event);
  if (!result.ok) {
    return json({ error: result.code, message: result.note ?? result.code }, result.status ?? 500);
  }
  return json({ received: true, note: result.note ?? "processed" }, result.status ?? 200);
}