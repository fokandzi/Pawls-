/**
 * Security Finding #9 — Stripe webhook payment + entitlement transitions.
 *
 * SINGLE source of truth for Stripe webhook processing, shared by:
 *  - src/routes/api/webhooks/stripe.ts   (the LIVE processing path on Vercel/prod SSR)
 *  - webhook-handler.ts                  (the LIVE processing path on the Bun serve.ts runtime)
 *  - src/db/webhook-core.test.ts         (deterministic adversarial tests, no live Stripe)
 *
 * Non-negotiable principles implemented here:
 *  - Metadata is a LOOKUP HINT ONLY — never proof of payment, amount, currency,
 *    ownership, product, subscription or booking.
 *  - Signature verification (constructEvent) must pass before any processing.
 *  - Idempotency is an ATOMIC claim on processed_webhook_events (INSERT ...
 *    ON CONFLICT DO NOTHING RETURNING) — two concurrent deliveries of the same
 *    event cannot both process.
 *  - A booking is only marked paid when the WHOLE chain verifies:
 *      event session === booking.stripe_session_id (server-created at checkout)
 *    AND session amount === booking.price_cents (server snapshot)
 *    AND currency matches, mode === 'payment', payment completed
 *    AND booking.customer_user_id exists server-side and the session's verified
 *    customer email matches booking.customer_email — server-side ownership only;
 *    client-supplied metadata is never trusted.
 *  - Platform fee comes from the server-side commission config (env
 *    PAWLS_COMMISSION_BPS, default 0 = founding beta locked at 0%) — never from
 *    metadata, never hard-coded to a specific rate.
 *  - Plus entitlements resolve to an immutable users.id (client_reference_id /
 *    metadata userId / stored mapping) — email is informational only.
 *  - Breeder/provider tier upgrades only when the session product/price passes a
 *    server-side allowlist (env PAWLS_STRIPE_ALLOWLIST) — metadata tier alone is
 *    never sufficient.
 *  - Missing STRIPE_WEBHOOK_SECRET in PRODUCTION FAILS CLOSED (500 + alert) —
 *    never a silent 200 ack for unprocessed real events.
 *  - Any mismatch writes a webhook_alerts row (ops alert channel:
 *    webhook_alerts + mail_log mode='ops_alert') and does NOT grant the
 *    entitlement transition.
 */
import type Stripe from "stripe";
import { sql } from "../db";
import { getStripe } from "../lib/stripe";

// ─── Server-side config (env-driven) ───────────────────────────────────────────

export type TierConfig = {
  price_ids?: string[];
  product_ids?: string[];
  amount_cents?: number;
  currency?: string;
};

export type Allowlist = { tiers: Record<string, TierConfig> };

/** Parse the allowlist from env; malformed/missing JSON = NO allowlist (fail closed). */
export function parseAllowlist(raw: string | undefined): Allowlist | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.tiers || typeof parsed.tiers !== "object") {
      return null;
    }
    const tiers: Record<string, TierConfig> = {};
    for (const [name, cfg] of Object.entries(parsed.tiers as Record<string, unknown>)) {
      if (!cfg || typeof cfg !== "object") continue;
      const t = cfg as Record<string, unknown>;
      tiers[name] = {
        price_ids: Array.isArray(t.price_ids) ? t.price_ids.filter((p) => typeof p === "string") : [],
        product_ids: Array.isArray(t.product_ids) ? t.product_ids.filter((p) => typeof p === "string") : [],
        amount_cents: Number.isInteger(t.amount_cents) ? (t.amount_cents as number) : undefined,
        currency: typeof t.currency === "string" ? (t.currency as string).toLowerCase() : undefined,
      };
    }
    return { tiers };
  } catch {
    return null;
  }
}

export function getAllowlist(opts?: WebhookOpts): Allowlist | null {
  if (opts?.allowlist) return opts.allowlist;
  return parseAllowlist(process.env.PAWLS_STRIPE_ALLOWLIST);
}

/**
 * Authoritative commission config. Founding beta is LOCKED at 0% (default).
 * Future standard rate is configurable via PAWLS_COMMISSION_BPS (basis points) —
 * NEVER hard-coded here, never client-influenced.
 */
export function getCommissionBps(): number {
  const raw = process.env.PAWLS_COMMISSION_BPS;
  if (!raw || !raw.trim()) return 0;
  const bps = Number(raw);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
    console.error(`[webhook-config] PAWLS_COMMISSION_BPS invalid (${raw}) — falling back to 0`);
    return 0;
  }
  return bps;
}

export type WebhookOpts = {
  /** Overrides process.env.STRIPE_WEBHOOK_SECRET (tests). */
  secret?: string;
  /** Overrides prod detection (tests). */
  isProd?: boolean;
  /** Injected allowlist (tests); defaults to process.env.PAWLS_STRIPE_ALLOWLIST. */
  allowlist?: Allowlist;
};

/** Production detection: explicit NODE_ENV / VERCEL_ENV decides fail-closed behavior. */
export function isProdEnv(): boolean {
  const env = String(process.env.NODE_ENV ?? "").toLowerCase() || String(process.env.VERCEL_ENV ?? "").toLowerCase();
  return env === "production" || env === "prod";
}

// ─── Shared helpers re-exported for sibling hardening modules ──────────────────
// Security Finding #8 reuses the SAME idempotency claim, alert channel, tables
// and prod detection as Finding #9 (single source of truth — no divergence).

export async function ensureWebhookTablesOnce() {
  await ensureTablesOnce();
}
export async function claimWebhookEvent(eventId: string, eventType: string) {
  return claimEvent(eventId, eventType);
}
export async function completeWebhookEvent(eventId: string) {
  await completeEvent(eventId);
}
export async function releaseWebhookEvent(eventId: string) {
  await releaseEvent(eventId);
}
export async function writeWebhookAlert(opts: {
  eventId?: string | null;
  eventType?: string | null;
  code: string;
  severity?: "info" | "warning" | "error";
  message: string;
  details?: AlertDetails;
}) {
  await logAlert(opts);
}
export { userIdFromString };

// ─── Schema helpers (additive, idempotent) ────────────────────────────────────

async function ensureWebhookTables() {
  await sql()`
    CREATE TABLE IF NOT EXISTS processed_webhook_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'done',
      processed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Legacy table from Finding-0/1 era has only id/event_type/processed_at.
  await sql()`ALTER TABLE processed_webhook_events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'done'`;
  await sql()`
    CREATE TABLE IF NOT EXISTS webhook_alerts (
      id SERIAL PRIMARY KEY,
      event_id TEXT,
      event_type TEXT,
      code TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      message TEXT NOT NULL,
      details JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql()`
    CREATE TABLE IF NOT EXISTS mail_log (
      id SERIAL PRIMARY KEY,
      "to" TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'test',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // subscriptions must exist before the ALTERs below (first-ever plus purchase).
  await sql()`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      user_id INTEGER,
      plan TEXT NOT NULL DEFAULT 'pawnder-plus',
      status TEXT NOT NULL DEFAULT 'active',
      stripe_session_id TEXT,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql()`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS user_id INTEGER`;
  await sql()`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`;
  await sql()`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT`;
  // Security Finding #8: immutable RevenueCat app_user_id mapping (email alone is
  // never identity). Additive; legacy rows keep NULL.
  await sql()`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS revenuecat_app_user_id TEXT`;
  await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT`;
  await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER NOT NULL DEFAULT 0`;
  await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS platform_fee_bps INTEGER NOT NULL DEFAULT 0`;
}

// ─── Ops alert channel ─────────────────────────────────────────────────────────

export type AlertDetails = Record<string, unknown> | null;

let tablesEnsured = false;

/** Run the additive DDL once per process (tables are permanent). */
async function ensureTablesOnce() {
  if (tablesEnsured) return;
  await ensureWebhookTables();
  tablesEnsured = true;
}

async function logAlert(opts: {
  eventId?: string | null;
  eventType?: string | null;
  code: string;
  severity?: "info" | "warning" | "error";
  message: string;
  details?: AlertDetails;
}) {
  const severity = opts.severity ?? "warning";
  const details = opts.details ? JSON.stringify(opts.details) : null;
  try {
    await sql()`
      INSERT INTO webhook_alerts (event_id, event_type, code, severity, message, details)
      VALUES (${opts.eventId ?? null}, ${opts.eventType ?? null}, ${opts.code}, ${severity}, ${opts.message}, ${details}::jsonb)
    `;
    await sql()`
      INSERT INTO mail_log ("to", subject, body, mode)
      VALUES ('ops@internal', ${`[Pawls] webhook alert ${opts.code}`}, ${opts.message}, 'ops_alert')
    `;
  } catch (err) {
    console.error("[webhook-alert] failed to persist alert row:", err);
  }
  console.error(`[webhook-alert] ${severity} ${opts.code}: ${opts.message} ${details ?? ""}`);
}

// ─── Idempotency (atomic claim — preserves the confirmed-positive mechanism) ──

type Claim = "claimed" | "duplicate";

async function claimEvent(eventId: string, eventType: string): Promise<Claim> {
  const rows = await sql()`
    INSERT INTO processed_webhook_events (id, event_type, status)
    VALUES (${eventId}, ${eventType}, 'processing')
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;
  return rows.length > 0 ? "claimed" : "duplicate";
}

async function completeEvent(eventId: string) {
  await sql()`
    UPDATE processed_webhook_events SET status = 'done', processed_at = NOW() WHERE id = ${eventId}
  `;
}

/** On failure, release the claim so Stripe's retry (500) can reprocess. */
async function releaseEvent(eventId: string) {
  await sql()`
    DELETE FROM processed_webhook_events WHERE id = ${eventId} AND status = 'processing'
  `;
}

// ─── Shared verdict type ───────────────────────────────────────────────────────

export type HandlerResult =
  | { ok: true; note?: string; code?: string }
  | { ok: false; code: string; message: string; alert: boolean; alertSeverity?: "warning" | "error" };

const REJECT = (code: string, message: string, alert = true): HandlerResult => ({
  ok: false,
  code,
  message,
  alert,
});

const OK = (note?: string): HandlerResult => ({ ok: true, note });

// ─── Booking payment (checkout.session.completed, mode === 'payment') ─────────

async function handleBookingPayment(session: Record<string, any>): Promise<HandlerResult> {
  const bookingId = Number(session?.metadata?.bookingId);
  const sessionId = typeof session?.id === "string" ? session.id : "";
  if (!Number.isInteger(bookingId) || bookingId < 1) {
    await logAlert({ eventId: session?.id, code: "BOOKING_ID_MISSING", message: "checkout.session.completed without a valid bookingId metadata lookup hint", details: { metadata: session?.metadata ?? null } });
    return REJECT("BOOKING_ID_MISSING", "checkout.session.completed without a valid bookingId metadata");
  }
  if (!sessionId) {
    return REJECT("SESSION_ID_MISSING", "checkout.session.completed without a session id");
  }

  // 1. Expected Stripe payment state.
  if (String(session.mode ?? "") !== "payment") {
    return REJECT("SESSION_MODE_NOT_PAYMENT", `booking webhook session mode is '${String(session.mode)}' — expected 'payment'`, true);
  }
  const paymentStatus = String(session.payment_status ?? "");
  const sessionStatus = String(session.status ?? "");
  if (!(paymentStatus === "paid" || paymentStatus === "no_payment_required") || sessionStatus !== "complete") {
    return REJECT("PAYMENT_NOT_COMPLETED", `session ${sessionId} is not paid (payment_status='${paymentStatus}', status='${sessionStatus}')`, true);
  }

  const amountTotal = Number(session.amount_total ?? session.amount_subtotal ?? null);
  const currency = String(session.currency ?? "").toLowerCase();
  if (!Number.isInteger(amountTotal) || amountTotal <= 0) {
    return REJECT("AMOUNT_MISSING", `session ${sessionId} has no valid amount_total`);
  }
  const piRaw = session.payment_intent;
  const paymentIntentId = typeof piRaw === "string" ? piRaw : typeof piRaw?.id === "string" ? piRaw.id : null;
  const sessionCustomerEmail = String(session.customer_details?.email ?? "").trim().toLowerCase();

  // 2. Load the authoritative Pawls record (metadata bookingId is the lookup hint).
  const [b] = await sql()`
    SELECT id, customer_user_id, customer_email, price_cents, currency, status, payment_status,
           paid_at, cancellation_status, stripe_session_id
    FROM bookings WHERE id = ${bookingId}
  `;
  if (!b) {
    await logAlert({ eventId: sessionId, code: "BOOKING_NOT_FOUND", message: `webhook referenced booking #${bookingId} which does not exist`, details: { sessionId } });
    return REJECT("BOOKING_NOT_FOUND", `booking #${bookingId} referenced by webhook does not exist`);
  }
  const booking = b as Record<string, any>;

  // 4+5. The event session MUST be the exact server-created session persisted at checkout.
  if (!booking.stripe_session_id || String(booking.stripe_session_id) !== sessionId) {
    await logAlert({ eventId: sessionId, code: "SESSION_MISMATCH", message: `event session ${sessionId} does not match booking #${bookingId} stored session ${String(booking.stripe_session_id)}`, details: { bookingId, eventSession: sessionId, storedSession: booking.stripe_session_id } });
    return REJECT("SESSION_MISMATCH", "checkout session does not match the session recorded for this booking");
  }

  // 3. Amount + currency must equal the server-side snapshot.
  if (Number(booking.price_cents) !== amountTotal) {
    await logAlert({ eventId: sessionId, code: "AMOUNT_MISMATCH", message: `session total ${amountTotal}${currency} != booking #${bookingId} snapshot ${booking.price_cents}`, details: { bookingId, sessionAmount: amountTotal, bookingAmount: booking.price_cents } });
    return REJECT("AMOUNT_MISMATCH", `charged amount does not match the booking price (${amountTotal} vs ${booking.price_cents})`);
  }
  if (String(booking.currency ?? "").toLowerCase() !== currency) {
    await logAlert({ eventId: sessionId, code: "CURRENCY_MISMATCH", message: `session currency ${currency} != booking #${bookingId} currency ${booking.currency}`, details: { bookingId, sessionCurrency: currency, bookingCurrency: booking.currency } });
    return REJECT("CURRENCY_MISMATCH", `charged currency does not match the booking currency (${currency} vs ${booking.currency})`);
  }

  // Server-side ownership: the booking must have a bound authenticated user.
  if (!booking.customer_user_id || Number(booking.customer_user_id) < 1) {
    await logAlert({ eventId: sessionId, code: "NO_SERVER_OWNER", message: `booking #${bookingId} has no server-side customer_user_id — refusing to grant paid`, details: { bookingId } });
    return REJECT("NO_SERVER_OWNER", "booking has no server-side owner; refusing to mark paid");
  }
  // The session belongs to the expected customer: Stripe-verified checkout email
  // must match the booking's stored customer email when both are present.
  const bookingEmail = String(booking.customer_email ?? "").trim().toLowerCase();
  if (!sessionCustomerEmail) {
    return REJECT("NO_CUSTOMER_EMAIL", "checkout session carries no customer email — cannot confirm the expected customer");
  }
  if (bookingEmail && sessionCustomerEmail !== bookingEmail) {
    await logAlert({ eventId: sessionId, code: "CUSTOMER_MISMATCH", message: `session customer ${sessionCustomerEmail} != booking #${bookingId} customer ${bookingEmail}`, details: { bookingId, sessionEmail: sessionCustomerEmail, bookingEmail } });
    return REJECT("CUSTOMER_MISMATCH", "checkout session belongs to a different customer than this booking");
  }

  // State machine: only chargeable bookings become paid; granted paid is final.
  if (booking.status === "paid" && booking.payment_status === "paid" && booking.paid_at) {
    return OK("already paid — no transition");
  }
  if (["refunded", "completed", "cancelled", "failed"].includes(String(booking.status))) {
    // Out-of-order delivery (e.g. completed after refund): preserve the later state.
    await logAlert({ eventId: sessionId, code: "STATE_SUPERSEDED", severity: "warning", message: `checkout.session.completed for booking #${bookingId} arrived after terminal state '${booking.status}' — paid NOT granted`, details: { bookingId, status: booking.status } });
    return OK("booking state superseded — paid not granted");
  }
  if (String(booking.status) !== "pending_payment" || String(booking.cancellation_status ?? "none") !== "none") {
    await logAlert({ eventId: sessionId, code: "BOOKING_NOT_CHARGEABLE", message: `booking #${bookingId} is in state ${booking.status}/${booking.cancellation_status} — refusing paid`, details: { bookingId, status: booking.status, cancellationStatus: booking.cancellation_status } });
    return REJECT("BOOKING_NOT_CHARGEABLE", `booking is not chargeable in its current state (${booking.status})`);
  }

  // Platform fee: server-side commission config ONLY.
  const bps = getCommissionBps();
  const feeCents = Math.floor((Number(booking.price_cents) * bps) / 10000);

  // Atomic transition inside the idempotency guard (single event claim).
  const up = await sql()`
    UPDATE bookings SET
      status = 'paid',
      payment_status = 'paid',
      paid_at = NOW(),
      stripe_payment_intent_id = ${paymentIntentId},
      stripe_session_id = ${sessionId},
      platform_fee_cents = ${feeCents},
      platform_fee_bps = ${bps},
      updated_at = NOW()
    WHERE id = ${bookingId}
      AND paid_at IS NULL
      AND status = 'pending_payment'
      AND payment_status <> 'paid'
  `;
  if (Number(up.count ?? 0) === 0) {
    const [now] = await sql()`SELECT status, payment_status, paid_at FROM bookings WHERE id = ${bookingId}`;
    if (now && now.status === "paid" && now.paid_at) {
      return OK("concurrently transitioned to paid — already handled");
    }
    await logAlert({ eventId: sessionId, code: "CONCURRENT_TRANSITION", message: `booking #${bookingId} could not be transitioned to paid (state changed concurrently to ${now?.status ?? "?"}/${now?.payment_status ?? "?"})`, details: { bookingId } });
    return REJECT("CONCURRENT_TRANSITION", "booking state changed concurrently; paid not granted");
  }

  console.log(`[webhook] Booking #${bookingId} marked paid (session ${sessionId}, fee ${feeCents} cents @ ${bps}bps)`);
  return OK();
}

// ─── Refund (charge.refunded) and payment failure (payment_intent.payment_failed) ──

async function handleChargeRefunded(charge: Record<string, any>): Promise<HandlerResult> {
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? null;
  if (!pi) return REJECT("REFUND_NO_PAYMENT_INTENT", "charge.refunded without a payment_intent");
  const [b] = await sql()`SELECT id, status, payment_status FROM bookings WHERE stripe_payment_intent_id = ${pi}`;
  if (!b) {
    // Normal when the payment intent belongs to a non-booking purchase (membership/plus);
    // only alert when metadata points at a booking.
    if (charge.metadata?.bookingId) {
      await logAlert({ eventId: charge.id, code: "REFUND_BOOKING_NOT_FOUND", message: `refund for payment_intent ${pi} references booking #${charge.metadata.bookingId} but no booking maps to it`, details: { paymentIntent: pi, bookingId: charge.metadata.bookingId } });
      return REJECT("REFUND_BOOKING_NOT_FOUND", "refund references a booking that cannot be resolved by payment intent");
    }
    return OK("no booking maps to this payment intent");
  }
  const booking = b as Record<string, any>;
  if (booking.status === "refunded") return OK("already refunded");
  if (booking.status === "paid" || booking.status === "completed" || booking.payment_status === "paid") {
    await sql()`UPDATE bookings SET status = 'refunded', payment_status = 'refunded', updated_at = NOW() WHERE id = ${Number(booking.id)}`;
    console.log(`[webhook] Booking #${booking.id} refunded (payment_intent ${pi})`);
    return OK();
  }
  await logAlert({ eventId: charge.id, code: "REFUND_UNPAID_BOOKING", severity: "warning", message: `refund for payment_intent ${pi} arrived for booking #${booking.id} in state ${booking.status} — no transition`, details: { bookingId: booking.id, status: booking.status } });
  return OK("booking not paid — no transition");
}

async function handlePaymentFailed(paymentIntent: Record<string, any>): Promise<HandlerResult> {
  const pi = String(paymentIntent.id ?? "");
  if (!pi) return REJECT("PAYMENT_FAILED_NO_ID", "payment_intent.payment_failed without an id");
  const [b] = await sql()`SELECT id, status, payment_status FROM bookings WHERE stripe_payment_intent_id = ${pi}`;
  if (!b) return OK("no booking maps to this payment intent"); // normal for non-booking intents
  const booking = b as Record<string, any>;
  if (booking.payment_status === "paid" || booking.status === "paid") return OK("already paid — failure event ignored");
  if (booking.status === "pending_payment" || booking.payment_status === "unpaid" || booking.payment_status === "pending") {
    await sql()`UPDATE bookings SET status = 'failed', payment_status = 'failed', updated_at = NOW() WHERE id = ${Number(booking.id)} AND paid_at IS NULL`;
    console.log(`[webhook] Booking #${booking.id} payment failed — marked failed`);
    return OK();
  }
  return OK("booking not in a chargeable state — no transition");
}

// ─── User identity resolution for entitlements (immutable users.id) ──────────

function userIdFromString(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  // Accept the Pawls app_user_id conventions (`pawls_<id>`, `user:<id>`,
  // `rc_<id>`) and bare numeric ids — NEVER email-like strings.
  const m = /^(?:(?:user|pawls|rc)[:_]?)?(\d+)$/.exec(s);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Strip a `sha256=` / `sha1=` HMAC prefix (webhook signature headers). */
export function stripSignaturePrefix(signature: string): string {
  const m = /^(?:sha256|sha1)=(.*)$/i.exec(signature.trim());
  return m ? m[1] : signature.trim();
}

async function resolveEntitlementUserId(
  session: Record<string, any>,
): Promise<number | null> {
  const clientRef = session?.client_reference_id;
  if (clientRef) {
    const id = userIdFromString(clientRef);
    if (id) return id;
  }
  const md = session?.metadata ?? {};
  for (const key of ["userId", "user_id", "appUserId", "app_user_id", "revenuecatUserId", "revenue_cat_user_id"]) {
    const id = userIdFromString(md[key]);
    if (id) return id;
  }
  // Retry-safe: an earlier delivery may have persisted the mapping already.
  if (typeof session?.id === "string") {
    const [existing] = await sql()`
      SELECT user_id FROM subscriptions WHERE stripe_session_id = ${session.id} AND user_id IS NOT NULL LIMIT 1
    `;
    if (existing?.user_id) return Number(existing.user_id);
  }
  return null;
}

/** Persist entitlement keyed by user_id (email informational only). */
async function upsertEntitlement(opts: {
  userId: number;
  email?: string | null;
  plan: string;
  status: string;
  sessionId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
}) {
  const email = opts.email ? String(opts.email).trim().toLowerCase() : null;
  const updated = await sql()`
    UPDATE subscriptions SET
      plan = ${opts.plan},
      status = ${opts.status},
      stripe_session_id = COALESCE(${opts.sessionId ?? null}, stripe_session_id),
      stripe_customer_id = COALESCE(${opts.customerId ?? null}, stripe_customer_id),
      stripe_subscription_id = COALESCE(${opts.subscriptionId ?? null}, stripe_subscription_id),
      email = COALESCE(${email}, email),
      updated_at = NOW()
    WHERE user_id = ${opts.userId}
    RETURNING id
  `;
  if (updated.length > 0) return;
  // Claim a legacy email row (informational email) if it has no user binding.
  if (email) {
    const legacy = await sql()`
      UPDATE subscriptions SET
        user_id = ${opts.userId},
        plan = ${opts.plan},
        status = ${opts.status},
        stripe_session_id = COALESCE(${opts.sessionId ?? null}, stripe_session_id),
        stripe_customer_id = COALESCE(${opts.customerId ?? null}, stripe_customer_id),
        stripe_subscription_id = COALESCE(${opts.subscriptionId ?? null}, stripe_subscription_id),
        updated_at = NOW()
      WHERE lower(email) = ${email} AND user_id IS NULL
      RETURNING id
    `;
    if (legacy.length > 0) return;
  }
  try {
    await sql()`
      INSERT INTO subscriptions (user_id, email, plan, status, stripe_session_id, stripe_customer_id, stripe_subscription_id)
      VALUES (${opts.userId}, ${email}, ${opts.plan}, ${opts.status}, ${opts.sessionId ?? null}, ${opts.customerId ?? null}, ${opts.subscriptionId ?? null})
    `;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23505" && email) {
      // Unique email row owned by another user_id — same email = same account, re-bind.
      await sql()`
        UPDATE subscriptions SET
          user_id = ${opts.userId},
          plan = ${opts.plan},
          status = ${opts.status},
          stripe_session_id = COALESCE(${opts.sessionId ?? null}, stripe_session_id),
          stripe_customer_id = COALESCE(${opts.customerId ?? null}, stripe_customer_id),
          stripe_subscription_id = COALESCE(${opts.subscriptionId ?? null}, stripe_subscription_id),
          updated_at = NOW()
        WHERE lower(email) = ${email}
      `;
      return;
    }
    throw err;
  }
}

/** Validate a session's product/price against the allowlist; returns the tier config or null. */
function allowlistCheck(
  session: Record<string, any>,
  kind: "breeder" | "plus",
  allowlist: Allowlist | null,
): { tierName: string; cfg: TierConfig } | { error: string } {
  const md = session?.metadata ?? {};
  const tierName = kind === "breeder" ? String(md.tier ?? "") : String(md.plan ?? "");
  if (!tierName) return { error: `${kind} session without tier metadata` };
  if (!allowlist) return { error: "server-side Stripe allowlist is not configured; refusing to trust metadata product" };
  const cfg = allowlist.tiers?.[tierName];
  if (!cfg) return { error: `tier/product '${tierName}' is not in the server-side allowlist` };

  const line = Array.isArray(session.line_items) && session.line_items.length > 0 ? session.line_items[0] : null;
  const priceId = typeof line?.price === "string" ? line.price : typeof line?.price?.id === "string" ? line.price.id : null;
  const productId = typeof line?.product === "string" ? line.product : typeof line?.price?.product === "string" ? line.price.product : null;
  if (priceId && Array.isArray(cfg.price_ids) && cfg.price_ids.length > 0 && !cfg.price_ids.includes(priceId)) {
    return { error: `price ${priceId} is not allowlisted for '${tierName}'` };
  }
  if (productId && Array.isArray(cfg.product_ids) && cfg.product_ids.length > 0 && !cfg.product_ids.includes(productId)) {
    return { error: `product ${productId} is not allowlisted for '${tierName}'` };
  }
  if (typeof cfg.amount_cents === "number") {
    const amount = Number(session.amount_total ?? session.amount_subtotal ?? null);
    if (!Number.isInteger(amount) || amount !== cfg.amount_cents) {
      return { error: `charged amount ${amount} does not match allowlisted ${cfg.amount_cents} for '${tierName}'` };
    }
  }
  if (cfg.currency && String(session.currency ?? "").toLowerCase() !== cfg.currency) {
    return { error: `charged currency does not match allowlisted currency for '${tierName}'` };
  }
  return { tierName, cfg };
}

// ─── Plus subscription (Pawls Plus — mode 'subscription') ─────────────────────

async function handlePlusSubscription(session: Record<string, any>): Promise<HandlerResult> {
  const userId = await resolveEntitlementUserId(session);
  if (!userId) {
    await logAlert({ eventId: session?.id, code: "PLUS_USER_UNRESOLVED", message: "Plus checkout could not be resolved to an immutable users.id (email alone is not identity)", details: { clientReferenceId: session?.client_reference_id ?? null, metadata: session?.metadata ?? null } });
    return REJECT("PLUS_USER_UNRESOLVED", "Plus subscription could not be resolved to a real user id — entitlement NOT granted");
  }
  const [user] = await sql()`SELECT id FROM users WHERE id = ${userId}`;
  if (!user) {
    await logAlert({ eventId: session?.id, code: "PLUS_USER_NOT_FOUND", message: `Plus subscription resolved to users.id ${userId} which does not exist`, details: { userId } });
    return REJECT("PLUS_USER_NOT_FOUND", "resolved users.id does not exist — entitlement NOT granted");
  }
  if (String(session.mode ?? "") !== "subscription") {
    await logAlert({ eventId: session?.id, code: "PLUS_MODE_NOT_SUBSCRIPTION", message: `Plus session ${String(session.id)} mode is '${String(session.mode)}' — expected subscription`, details: { sessionId: session?.id } });
    return REJECT("PLUS_MODE_NOT_SUBSCRIPTION", "Plus checkout is not a subscription-mode session");
  }
  const check = allowlistCheck(session, "plus", getAllowlist());
  if ("error" in check) {
    await logAlert({ eventId: session?.id, code: "PLUS_PRODUCT_NOT_ALLOWLISTED", message: check.error, details: { metadata: session?.metadata ?? null } });
    return REJECT("PLUS_PRODUCT_NOT_ALLOWLISTED", check.error);
  }
  const plan = check.tierName;
  const customerId = typeof session.customer === "string" ? session.customer : (session.customer_details?.id as string | undefined) ?? null;
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  const email = session.customer_details?.email ?? null;

  await upsertEntitlement({ userId, email, plan, status: "active", sessionId: session?.id ?? null, customerId, subscriptionId: subId });
  console.log(`[webhook] Plus entitlement active for users.id ${userId} (plan ${plan}, session ${String(session?.id)})`);
  return OK();
}

// ─── Subscription status sync (customer.subscription.* / invoice.payment_failed) ──

async function resolveStatusSyncUser(obj: Record<string, any>): Promise<number | null> {
  const md = obj?.metadata ?? {};
  for (const key of ["userId", "user_id", "appUserId", "app_user_id"]) {
    const id = userIdFromString(md[key]);
    if (id) return id;
  }
  const customerId = typeof obj.customer === "string" ? obj.customer : null;
  if (customerId) {
    const [sub] = await sql()`
      SELECT user_id FROM subscriptions WHERE stripe_customer_id = ${customerId} AND user_id IS NOT NULL LIMIT 1
    `;
    if (sub?.user_id) return Number(sub.user_id);
  }
  const subscriptionId = typeof obj.subscription === "string" ? obj.subscription : null;
  if (subscriptionId) {
    const [sub] = await sql()`
      SELECT user_id FROM subscriptions WHERE stripe_subscription_id = ${subscriptionId} AND user_id IS NOT NULL LIMIT 1
    `;
    if (sub?.user_id) return Number(sub.user_id);
  }
  return null;
}

async function handleSubscriptionStatusSync(obj: Record<string, any>, status: string): Promise<HandlerResult> {
  const userId = await resolveStatusSyncUser(obj);
  if (!userId) {
    await logAlert({ eventId: obj?.id ?? null, code: "STATUS_SYNC_UNRESOLVED", message: `subscription status sync (${status}) could not resolve to an immutable users.id`, details: { metadata: obj?.metadata ?? null, customer: obj?.customer ?? null } });
    return REJECT("STATUS_SYNC_UNRESOLVED", "subscription status sync could not resolve to a real user id");
  }
  await sql()`UPDATE subscriptions SET status = ${status}, updated_at = NOW() WHERE user_id = ${userId}`;
  console.log(`[webhook] Subscription status synced to '${status}' for users.id ${userId}`);
  return OK();
}

async function handleInvoicePaymentFailed(invoice: Record<string, any>): Promise<HandlerResult> {
  const userId = await resolveStatusSyncUser(invoice);
  if (!userId) {
    await logAlert({ eventId: invoice?.id ?? null, code: "INVOICE_UNRESOLVED", message: "invoice.payment_failed could not resolve to an immutable users.id", details: { customer: invoice?.customer ?? null, metadata: invoice?.metadata ?? null } });
    return REJECT("INVOICE_UNRESOLVED", "invoice.payment_failed could not resolve to a real user id");
  }
  await sql()`UPDATE subscriptions SET status = 'past_due', updated_at = NOW() WHERE user_id = ${userId}`;
  console.log(`[webhook] Subscription marked past_due for users.id ${userId}`);
  return OK();
}

// ─── Breeder/provider membership (allowlisted product/price) ─────────────────

async function handleBreederMembership(session: Record<string, any>): Promise<HandlerResult> {
  const breederId = Number(session?.metadata?.breederId);
  if (!Number.isInteger(breederId) || breederId < 1) return REJECT("BREEDER_ID_MISSING", "checkout.session.completed without a valid breederId metadata lookup hint");
  const check = allowlistCheck(session, "breeder", getAllowlist());
  if ("error" in check) {
    await logAlert({ eventId: session?.id, code: "BREEDER_PRODUCT_NOT_ALLOWLISTED", message: check.error, details: { metadata: session?.metadata ?? null } });
    return REJECT("BREEDER_PRODUCT_NOT_ALLOWLISTED", check.error);
  }
  const [breeder] = await sql()`SELECT id, membership_tier FROM breeders WHERE id = ${breederId}`;
  if (!breeder) {
    await logAlert({ eventId: session?.id, code: "BREEDER_NOT_FOUND", message: `breeder #${breederId} referenced by webhook does not exist`, details: { breederId } });
    return REJECT("BREEDER_NOT_FOUND", `breeder #${breederId} referenced by webhook does not exist`);
  }
  const tierName = check.tierName;
  const up = await sql()`
    UPDATE breeders SET membership_tier = ${tierName}, stripe_session_id = ${session.id}, updated_at = NOW()
    WHERE id = ${breederId} AND membership_tier <> ${tierName}
  `;
  if (Number(up.count ?? 0) === 0) return OK("membership tier unchanged");
  console.log(`[webhook] Breeder #${breederId} upgraded to '${tierName}' (session ${String(session.id)})`);
  return OK();
}

// ─── Event dispatch ─────────────────────────────────────────────────────────────

/**
 * Process a VERIFIED Stripe event. Deterministic and injectable: tests call this
 * directly with fabricated events — live Stripe (constructEvent) is never needed.
 * Idempotency is enforced here via the atomic processed_webhook_events claim.
 */
export async function processStripeEvent(event: { id: string; type: string; data?: { object?: any } }): Promise<{ ok: boolean; duplicate?: boolean; note?: string; code?: string; status?: number }> {
  await ensureTablesOnce();

  const claim = await claimEvent(event.id, event.type);
  if (claim === "duplicate") {
    return { ok: true, duplicate: true, note: "already processed", status: 200 };
  }

  try {
    let verdict: HandlerResult;
    const obj = event.data?.object ?? ({} as any);

    if (event.type === "checkout.session.completed") {
      const md = obj.metadata ?? {};
      if (md.bookingId && !md.plan && !md.breederId) {
        verdict = await handleBookingPayment(obj);
      } else if (md.plan) {
        verdict = await handlePlusSubscription(obj);
      } else if (md.breederId) {
        verdict = await handleBreederMembership(obj);
      } else {
        verdict = OK("unrecognized metadata — nothing to do");
      }
    } else if (event.type === "charge.refunded") {
      verdict = await handleChargeRefunded(obj);
    } else if (event.type === "payment_intent.payment_failed") {
      verdict = await handlePaymentFailed(obj);
    } else if (event.type === "customer.subscription.deleted") {
      verdict = await handleSubscriptionStatusSync(obj, "canceled");
    } else if (event.type === "customer.subscription.updated") {
      verdict = await handleSubscriptionStatusSync(obj, String(obj.status ?? "active"));
    } else if (event.type === "invoice.payment_failed") {
      verdict = await handleInvoicePaymentFailed(obj);
    } else {
      verdict = OK("unhandled event type — ignored");
    }

    if (!verdict.ok) {
      if (verdict.alert) {
        await logAlert({ eventId: event.id, eventType: event.type, code: verdict.code, severity: verdict.alertSeverity ?? "error", message: verdict.message, details: { object: event.data?.object } });
      }
      await releaseEvent(event.id);
      return { ok: false, code: verdict.code, status: 500 };
    }

    await completeEvent(event.id);
    return { ok: true, note: verdict.note, status: 200 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logAlert({ eventId: event.id, eventType: event.type, code: "WEBHOOK_PROCESSING_ERROR", severity: "error", message, details: { object: event.data?.object } });
    await releaseEvent(event.id);
    return { ok: false, code: "WEBHOOK_PROCESSING_ERROR", status: 500 };
  }
}

// ─── HTTP entry point (signature verification + fail-closed secret) ───────────

/**
 * Full webhook request handler. Both live runtimes (Bun serve.ts via
 * webhook-handler.ts, Vercel via the /api/webhooks/stripe route) call this.
 * `opts` are test injection points; production always reads env.
 */
export async function handleStripeWebhookRequest(request: Request, opts?: WebhookOpts): Promise<Response> {
  const json = (data: unknown, status: number): Response =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

  const isProd = opts?.isProd ?? isProdEnv();
  const webhookSecret = opts?.secret !== undefined ? opts.secret : process.env.STRIPE_WEBHOOK_SECRET;

  // Fail closed in production: an unsecreted handler must NEVER silently ack
  // real unprocessed events (they would be dropped permanently).
  if (!webhookSecret) {
    if (isProd) {
      const message = "STRIPE_WEBHOOK_SECRET is not configured — refusing to process webhook (fail closed)";
      console.error(`[webhook] ${message}`);
      try {
        await ensureTablesOnce();
        await logAlert({ eventId: null, eventType: null, code: "WEBHOOK_SECRET_MISSING", severity: "error", message, details: { env: { NODE_ENV: process.env.NODE_ENV ?? null, VERCEL_ENV: process.env.VERCEL_ENV ?? null } } });
      } catch { /* alert best-effort */ }
      return json({ error: "webhook processing unavailable", code: "WEBHOOK_SECRET_MISSING" }, 500);
    }
    // dev/test: warn + ack (never processes, but keeps local flows unblocked).
    console.warn("[webhook] STRIPE_WEBHOOK_SECRET not configured — acknowledging but not processing (dev/test only)");
    return json({ received: true, note: "Webhook secret not configured (dev) — not processed" }, 200);
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return json({ error: "Missing stripe-signature header" }, 400);
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return json({ error: "Failed to read request body" }, 400);
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("[webhook] Signature verification failed:", message);
    return json({ error: `Signature verification failed: ${message}` }, 400);
  }

  const result = await processStripeEvent(event as { id: string; type: string; data?: { object?: any } });
  if (!result.ok) {
    return json({ error: result.code, message: result.note ?? result.code }, result.status ?? 500);
  }
  return json({ received: true, note: result.note ?? "processed" }, result.status ?? 200);
}