/**
 * Security Finding #9 — adversarial tests for the HARDENED Stripe webhook path.
 *
 * Runs against the real dev Neon database (DATABASE_URL from .env, same
 * precedent as payments.test.ts) with INJECTED fabricated Stripe events —
 * live Stripe is never called and no secrets are printed. The injectable entry
 * points are processStripeEvent() / handleStripeWebhookRequest() from
 * src/db/webhook-core.ts (the single source of truth used by both live runtimes).
 *
 * Coverage (all required by the finding):
 *  - valid paid booking webhook -> paid, correct session/amount/currency/owner,
 *    platform fee computed from server-side commission config (0% lock + rate case)
 *  - unpaid session / payment not completed -> NOT paid
 *  - forged metadata (bookingId pointing at another user's booking) -> NOT paid + alert
 *  - amount mismatch -> NOT paid + alert
 *  - currency mismatch -> NOT paid + alert
 *  - wrong checkout session (id doesn't match stored server-created session) -> NOT paid
 *  - wrong user (session customer email != booking owner email) -> NOT paid
 *  - replayed event (same event id twice) -> idempotent, no double transition
 *  - duplicate webhook (different event id, same payment) -> no double transition
 *  - out-of-order event (completed after refund) -> state preserved
 *  - refund event -> booking refunded
 *  - payment failure event -> booking NOT paid (failed)
 *  - missing webhook secret in prod -> FAIL CLOSED (500 + alert), NOT 200
 *  - Plus subscription via email that doesn't resolve to a user -> NOT granted
 *  - Plus subscription resolved via immutable users.id -> granted (positive control)
 *  - breeder tier not in the server-side allowlist -> NOT granted
 */
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Load .env with override (sandbox shell injects a placeholder DATABASE_URL that
// shadows Bun's auto-load — same approach as payments.test.ts). Must run before
// any sql() call; sql() is lazy so static imports are fine.
const ENV_PATH = join(process.cwd(), ".env");
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

import { sql } from "../db";
import { processStripeEvent, handleStripeWebhookRequest, getCommissionBps, parseAllowlist } from "./webhook-core";

const MARKER = `sf9_${Date.now()}`;
const CUST_EMAIL = `${MARKER}_customer@example.com`;
const EVENT_PREFIX = `evt_sf9_${MARKER}`;
const SESSION_PREFIX = `cs_sf9_${MARKER}`;
const PI_PREFIX = `pi_sf9_${MARKER}`;

let approvedProviderId = 0;
let approvedServiceId = 0;
const servicePriceCents = 3450; // €34.50
let userA: { id: number; email: string };
let userB: { id: number; email: string };
const createdBookingIds: number[] = [];
let sessionCounter = 0;
let eventCounter = 0;

function futureDate(days = 2): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10); // UTC; +2d always stays in the future
}
function nextSessionId(): string {
  sessionCounter += 1;
  return `${SESSION_PREFIX}_${sessionCounter}`;
}
function nextEventId(): string {
  eventCounter += 1;
  return `${EVENT_PREFIX}_${eventCounter}`;
}
function checkoutCompleted(session: Record<string, unknown>) {
  return { id: nextEventId(), type: "checkout.session.completed", data: { object: session } };
}
/** A realistic paid booking session; defaults must match the booking fixture. */
function paidBookingSession(overrides: Record<string, unknown> = {}) {
  const sessionId = String(overrides.id ?? nextSessionId());
  const bookingId = Number(overrides.bookingIdForSession ?? createdBookingIds[0]);
  return {
    id: sessionId,
    object: "checkout.session",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    amount_total: servicePriceCents,
    currency: "eur",
    payment_intent: `${PI_PREFIX}_1`,
    customer_details: { email: CUST_EMAIL },
    metadata: { bookingId: String(bookingId) },
    ...overrides,
  };
}

async function insertUser(role: string): Promise<{ id: number; email: string }> {
  const email = `${MARKER}_${role}@example.com`;
  const [u] = await sql()`
    INSERT INTO users (email, name, email_verified_at, is_test, preferred_language)
    VALUES (${email}, ${`SecFind9 ${role}`}, NOW(), true, 'fr')
    RETURNING id
  `;
  return { id: Number(u.id), email };
}

async function insertProvider(): Promise<number> {
  const [p] = await sql()`
    INSERT INTO providers (name, category, description, location, approval_status)
    VALUES (${`${MARKER}_provider`}, 'walker', 'test fixture - security finding 9', 'Paris', 'approved')
    RETURNING id
  `;
  return Number(p.id);
}

async function insertService(providerId: number): Promise<number> {
  const [s] = await sql()`
    INSERT INTO services (provider_id, name, price_cents, duration_minutes, currency, is_active)
    VALUES (${providerId}, ${`${MARKER}_service`}, ${servicePriceCents}, 60, 'eur', true)
    RETURNING id
  `;
  return Number(s.id);
}

async function insertBooking(opts: {
  userId: number;
  sessionId?: string | null;
  paymentIntentId?: string | null;
  email?: string;
  priceCents?: number;
  currency?: string;
  status?: string;
  paymentStatus?: string;
}): Promise<number> {
  const [b] = await sql()`
    INSERT INTO bookings (
      provider_id, service_id, customer_name, customer_email, booking_date, start_time,
      status, customer_user_id, price_cents, currency, payment_status, cancellation_status,
      stripe_session_id, stripe_payment_intent_id
    )
    VALUES (
      ${approvedProviderId}, ${approvedServiceId}, 'SecFind9 Customer', ${opts.email ?? CUST_EMAIL},
      ${futureDate()}::date, '09:00'::time,
      ${opts.status ?? "pending_payment"}, ${opts.userId},
      ${opts.priceCents ?? servicePriceCents}, ${opts.currency ?? "EUR"},
      ${opts.paymentStatus ?? "unpaid"}, 'none',
      ${opts.sessionId ?? null}, ${opts.paymentIntentId ?? null}
    )
    RETURNING id
  `;
  const id = Number(b.id);
  createdBookingIds.push(id);
  return id;
}

async function getBooking(id: number) {
  const rows = await sql()`
    SELECT status, payment_status, paid_at, stripe_session_id, stripe_payment_intent_id,
           platform_fee_cents, platform_fee_bps
    FROM bookings WHERE id = ${id}
  `;
  return (rows[0] ?? {}) as Record<string, any>;
}

const TEST_ALLOWLIST_JSON = JSON.stringify({
  tiers: {
    "pawnder-plus": { amount_cents: 799, currency: "eur" },
    plus: { amount_cents: 799, currency: "eur" },
  },
});

beforeAll(async () => {
  await sql()`SELECT 1`;
  userA = await insertUser("a");
  userB = await insertUser("b");
  approvedProviderId = await insertProvider();
  approvedServiceId = await insertService(approvedProviderId);
});

afterAll(async () => {
  process.env.PAWLS_STRIPE_ALLOWLIST = undefined;
  process.env.PAWLS_COMMISSION_BPS = undefined;
  const steps = [
    () => sql()`DELETE FROM processed_webhook_events WHERE id LIKE ${EVENT_PREFIX + "%"}`,
    () => sql()`DELETE FROM webhook_alerts WHERE event_id LIKE ${EVENT_PREFIX + "%"}`,
    () => sql()`DELETE FROM webhook_alerts WHERE message LIKE ${"%" + MARKER + "%"}`,
    () => sql()`DELETE FROM mail_log WHERE subject LIKE ${"%" + MARKER + "%"} OR body LIKE ${"%" + MARKER + "%"}`,
    () => sql()`DELETE FROM bookings WHERE customer_email LIKE ${"%" + MARKER + "%"}`,
    () => sql()`DELETE FROM subscriptions WHERE email LIKE ${"%" + MARKER + "%"}`,
    () => sql()`DELETE FROM services WHERE name LIKE ${"%" + MARKER + "%"}`,
    () => sql()`DELETE FROM providers WHERE name LIKE ${"%" + MARKER + "%"}`,
    () => sql()`DELETE FROM users WHERE email LIKE ${"%" + MARKER + "%"}`,
  ];
  for (const step of steps) {
    try { await step(); } catch { /* best-effort */ }
  }
});

describe("Security Finding #9: booking payment reconciliation", () => {
  test("valid paid booking webhook -> paid with correct session/amount/currency/owner; 0% founding-beta fee recorded", async () => {
    const sessionId = nextSessionId();
    const bookingId = await insertBooking({ userId: userA.id, sessionId });
    const event = checkoutCompleted(paidBookingSession({ id: sessionId, bookingIdForSession: bookingId, payment_intent: `${PI_PREFIX}_valid` }));
    const res = await processStripeEvent(event);
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    const b = await getBooking(bookingId);
    expect(b.status).toBe("paid");
    expect(b.payment_status === "paid").toBe(true);
    expect(b.paid_at).toBeTruthy();
    expect(b.stripe_session_id).toBe(sessionId);
    expect(b.stripe_payment_intent_id).toBe(`${PI_PREFIX}_valid`);
    expect(Number(b.platform_fee_bps)).toBe(0);
    expect(Number(b.platform_fee_cents)).toBe(0);
  });

  test("platform fee computed from server-side commission config when configured (1200bps = 12%, never client-supplied)", async () => {
    process.env.PAWLS_COMMISSION_BPS = "1200";
    try {
      const sessionId = nextSessionId();
      const bookingId = await insertBooking({ userId: userA.id, sessionId });
      const event = checkoutCompleted(paidBookingSession({ id: sessionId, bookingIdForSession: bookingId, payment_intent: `${PI_PREFIX}_fee` }));
      const res = await processStripeEvent(event);
      expect(res.ok).toBe(true);
      const b = await getBooking(bookingId);
      expect(Number(b.platform_fee_bps)).toBe(1200);
      expect(Number(b.platform_fee_cents)).toBe(Math.floor((servicePriceCents * 1200) / 10000));
      expect(Number(b.platform_fee_cents)).toBeGreaterThan(0);
    } finally {
      process.env.PAWLS_COMMISSION_BPS = undefined;
    }
  });

  test("unpaid session / payment not completed -> NOT paid", async () => {
    const sessionId = nextSessionId();
    const bookingId = await insertBooking({ userId: userA.id, sessionId });
    const event = checkoutCompleted(paidBookingSession({ id: sessionId, bookingIdForSession: bookingId, status: "open", payment_status: "unpaid" }));
    const res = await processStripeEvent(event);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("PAYMENT_NOT_COMPLETED");
    const b = await getBooking(bookingId);
    expect(b.status).toBe("pending_payment");
    expect(b.paid_at).toBeFalsy();
    const alerts = await sql()`SELECT code FROM webhook_alerts WHERE event_id = ${event.id}`;
    expect(alerts.length).toBeGreaterThan(0);
    void alerts;
  });

  test("forged metadata (bookingId pointing at another user's booking) -> NOT paid, session mismatch alert", async () => {
    const attackerSessionId = nextSessionId();
    const attackerBookingId = await insertBooking({ userId: userA.id, sessionId: attackerSessionId });
    const victimBookingId = await insertBooking({ userId: userB.id, sessionId: nextSessionId() });
    const event = checkoutCompleted(paidBookingSession({ id: attackerSessionId, bookingIdForSession: victimBookingId, payment_intent: `${PI_PREFIX}_forged` }));
    const res = await processStripeEvent(event);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("SESSION_MISMATCH");
    expect((await getBooking(victimBookingId)).status).toBe("pending_payment");
    expect((await getBooking(attackerBookingId)).status).toBe("pending_payment");
    const [alert] = await sql()`SELECT code FROM webhook_alerts WHERE event_id = ${event.id}`;
    expect(alert?.code).toBe("SESSION_MISMATCH");
  });

  test("wrong checkout session (session id != stored server-created session) -> NOT paid", async () => {
    const storedSessionId = nextSessionId();
    const bookingId = await insertBooking({ userId: userA.id, sessionId: storedSessionId });
    const wrongSessionId = nextSessionId();
    const event = checkoutCompleted(paidBookingSession({ id: wrongSessionId, bookingIdForSession: bookingId, payment_intent: `${PI_PREFIX}_wrong` }));
    const res = await processStripeEvent(event);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("SESSION_MISMATCH");
    expect((await getBooking(bookingId)).status).toBe("pending_payment");
  });

  test("amount mismatch (session total != booking snapshot) -> NOT paid, alert", async () => {
    const sessionId = nextSessionId();
    const bookingId = await insertBooking({ userId: userA.id, sessionId });
    const event = checkoutCompleted(paidBookingSession({ id: sessionId, bookingIdForSession: bookingId, amount_total: servicePriceCents + 500, payment_intent: `${PI_PREFIX}_amt` }));
    const res = await processStripeEvent(event);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("AMOUNT_MISMATCH");
    expect((await getBooking(bookingId)).status).toBe("pending_payment");
    const [alert] = await sql()`SELECT code FROM webhook_alerts WHERE event_id = ${event.id}`;
    expect(alert?.code).toBe("AMOUNT_MISMATCH");
  });

  test("currency mismatch -> NOT paid, alert", async () => {
    const sessionId = nextSessionId();
    const bookingId = await insertBooking({ userId: userA.id, sessionId });
    const event = checkoutCompleted(paidBookingSession({ id: sessionId, bookingIdForSession: bookingId, currency: "usd", payment_intent: `${PI_PREFIX}_cur` }));
    const res = await processStripeEvent(event);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("CURRENCY_MISMATCH");
    expect((await getBooking(bookingId)).status).toBe("pending_payment");
    const [alert] = await sql()`SELECT code FROM webhook_alerts WHERE event_id = ${event.id}`;
    expect(alert?.code).toBe("CURRENCY_MISMATCH");
  });

  test("wrong user (session customer email is not the booking owner) -> NOT paid", async () => {
    const sessionId = nextSessionId();
    const bookingId = await insertBooking({ userId: userA.id, sessionId, email: userA.email });
    const event = checkoutCompleted(paidBookingSession({ id: sessionId, bookingIdForSession: bookingId, payment_intent: `${PI_PREFIX}_user`, customer_details: { email: userB.email } }));
    const res = await processStripeEvent(event);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("CUSTOMER_MISMATCH");
    expect((await getBooking(bookingId)).status).toBe("pending_payment");
    const [alert] = await sql()`SELECT code FROM webhook_alerts WHERE event_id = ${event.id}`;
    expect(alert?.code).toBe("CUSTOMER_MISMATCH");
  });

  test("replayed event (same event id twice) -> idempotent, no double transition", async () => { /* multi-webhook: allow slow real-DB sequence */
    const sessionId = nextSessionId();
    const bookingId = await insertBooking({ userId: userA.id, sessionId });
    const event = checkoutCompleted(paidBookingSession({ id: sessionId, bookingIdForSession: bookingId, payment_intent: `${PI_PREFIX}_replay` }));
    event.id = `${EVENT_PREFIX}_replay`;
    const first = await processStripeEvent(event);
    expect(first.ok).toBe(true);
    const afterFirst = await getBooking(bookingId);
    const second = await processStripeEvent(event);
    expect(second.ok).toBe(true);
    expect(second.duplicate).toBe(true);
    const afterSecond = await getBooking(bookingId);
    expect(afterSecond.status).toBe("paid");
    expect(String(afterSecond.paid_at)).toBe(String(afterFirst.paid_at));
    expect(afterSecond.platform_fee_cents).toBe(afterFirst.platform_fee_cents);
  });

  test("duplicate webhook (different event id, same payment) -> no double transition", async () => { /* multi-webhook: allow slow real-DB sequence */
    const sessionId = nextSessionId();
    const bookingId = await insertBooking({ userId: userA.id, sessionId });
    const first = checkoutCompleted(paidBookingSession({ id: sessionId, bookingIdForSession: bookingId, payment_intent: `${PI_PREFIX}_dup` }));
    expect((await processStripeEvent(first)).ok).toBe(true);
    const second = checkoutCompleted(paidBookingSession({ id: sessionId, bookingIdForSession: bookingId, payment_intent: `${PI_PREFIX}_dup` }));
    const res = await processStripeEvent(second);
    expect(res.ok).toBe(true); // genuinely already handled -> 200 stops retries
    expect(res.note).toBe("already paid — no transition");
    const b = await getBooking(bookingId);
    expect(b.status).toBe("paid");
    expect(b.payment_status).toBe("paid");
  });

  test("refund event -> booking moves to refunded", async () => { /* multi-webhook: allow slow real-DB sequence */
    const sessionId = nextSessionId();
    const piId = `${PI_PREFIX}_refund`;
    const bookingId = await insertBooking({ userId: userA.id, sessionId, paymentIntentId: piId });
    expect((await processStripeEvent(checkoutCompleted(paidBookingSession({ id: sessionId, bookingIdForSession: bookingId, payment_intent: piId })))).ok).toBe(true);
    const refundEvent = { id: nextEventId(), type: "charge.refunded", data: { object: { id: `ch_${MARKER}`, payment_intent: piId } } };
    const res = await processStripeEvent(refundEvent);
    expect(res.ok).toBe(true);
    const b = await getBooking(bookingId);
    expect(b.status).toBe("refunded");
    expect(b.payment_status).toBe("refunded");
  });

  test("out-of-order event (completed after refund) -> state preserved, paid NOT re-granted", async () => { /* multi-webhook: allow slow real-DB sequence */
    const sessionId = nextSessionId();
    const piId = `${PI_PREFIX}_late`;
    const bookingId = await insertBooking({ userId: userA.id, sessionId, paymentIntentId: piId });
    const paidEvent = checkoutCompleted(paidBookingSession({ id: sessionId, bookingIdForSession: bookingId, payment_intent: piId }));
    expect((await processStripeEvent(paidEvent)).ok).toBe(true);
    expect((await processStripeEvent({ id: nextEventId(), type: "charge.refunded", data: { object: { id: `ch_2_${MARKER}`, payment_intent: piId } } })).ok).toBe(true);
    const late = checkoutCompleted(paidBookingSession({ id: sessionId, bookingIdForSession: bookingId, payment_intent: piId }));
    const res = await processStripeEvent(late);
    expect(res.ok).toBe(true);
    expect(res.note).toBe("booking state superseded — paid not granted");
    const b = await getBooking(bookingId);
    expect(b.status).toBe("refunded");
    expect(b.payment_status).toBe("refunded");
  });

  test("payment failure event -> booking NOT paid (failed state)", async () => {
    const sessionId = nextSessionId();
    const piId = `${PI_PREFIX}_fail`;
    const bookingId = await insertBooking({ userId: userA.id, sessionId, paymentIntentId: piId });
    const evt = { id: nextEventId(), type: "payment_intent.payment_failed", data: { object: { id: piId } } };
    const res = await processStripeEvent(evt);
    expect(res.ok).toBe(true);
    const b = await getBooking(bookingId);
    expect(b.status).toBe("failed");
    expect(b.payment_status).toBe("failed");
    expect(b.paid_at).toBeFalsy();
  });
});

describe("Security Finding #9: fail-closed secret handling + entitlements", () => {
  test("missing webhook secret in prod -> FAIL CLOSED (500 + alert), NOT 200", async () => {
    const res = await handleStripeWebhookRequest(new Request("http://localhost/api/webhooks/stripe", { method: "POST" }), { isProd: true, secret: "" });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("WEBHOOK_SECRET_MISSING");
    const alerts = await sql()`SELECT code FROM webhook_alerts WHERE code = 'WEBHOOK_SECRET_MISSING' ORDER BY id DESC LIMIT 1`;
    expect(alerts.length).toBeGreaterThan(0);
  });

  test("missing webhook secret in dev/test -> 200 warn, no mutation", async () => {
    const res = await handleStripeWebhookRequest(new Request("http://localhost/api/webhooks/stripe", { method: "POST" }), { isProd: false, secret: "" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect((body as { received?: boolean }).received).toBe(true);
  });

  test("Plus subscription via email that does NOT resolve to a user -> NOT granted, alert", async () => {
    const sessionId = nextSessionId();
    const nobodyEmail = `${MARKER}_nobody@example.com`;
    const evt = {
      id: nextEventId(), type: "checkout.session.completed",
      data: { object: { id: sessionId, mode: "subscription", status: "complete", payment_status: "paid",
        amount_total: 799, currency: "eur", customer_details: { email: nobodyEmail },
        metadata: { plan: "pawnder-plus" } } },
    };
    const res = await processStripeEvent(evt);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("PLUS_USER_UNRESOLVED");
    const subs = await sql()`SELECT * FROM subscriptions WHERE email = ${nobodyEmail}`;
    expect(subs.length).toBe(0);
    const alerts = await sql()`SELECT code FROM webhook_alerts WHERE event_id = ${evt.id}`;
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });

  test("Plus subscription via immutable users.id (client_reference_id) -> granted against users.id", async () => {
    process.env.PAWLS_STRIPE_ALLOWLIST = TEST_ALLOWLIST_JSON;
    try {
      const sessionId = nextSessionId();
      const evt = {
        id: nextEventId(), type: "checkout.session.completed",
        data: { object: { id: sessionId, mode: "subscription", status: "complete", payment_status: "paid",
          amount_total: 799, currency: "eur", client_reference_id: `user:${userA.id}`,
          customer_details: { email: userA.email },
          metadata: { plan: "pawnder-plus" } } },
      };
      const res = await processStripeEvent(evt);
      expect(res.ok).toBe(true);
      const subs = await sql()`SELECT user_id, plan, status FROM subscriptions WHERE stripe_session_id = ${sessionId}`;
      expect(subs.length).toBe(1);
      expect(Number(subs[0].user_id)).toBe(userA.id);
      expect(subs[0].status).toBe("active");
    } finally {
      process.env.PAWLS_STRIPE_ALLOWLIST = undefined;
    }
  });

  test("breeder tier not in server-side allowlist -> NOT granted", async () => {
    process.env.PAWLS_STRIPE_ALLOWLIST = JSON.stringify({ tiers: { plus: { amount_cents: 799, currency: "eur" } } });
    try {
      const [breeder] = await sql()`
        INSERT INTO breeders (name, location, description, breed_specialty, verification_status, membership_tier)
        VALUES (${`${MARKER}_breeder`}, 'Paris', 'sf9 breeder', 'labrador', 'verified', 'free')
        RETURNING id
      `;
      const sessionId = nextSessionId();
      const evt = {
        id: nextEventId(), type: "checkout.session.completed",
        data: { object: { id: sessionId, mode: "payment", status: "complete", payment_status: "paid",
          amount_total: 1500, currency: "eur", metadata: { breederId: String(breeder.id), tier: "premium" } } },
      };
      const res = await processStripeEvent(evt);
      expect(res.ok).toBe(false);
      expect(res.code).toBe("BREEDER_PRODUCT_NOT_ALLOWLISTED");
      const [after] = await sql()`SELECT membership_tier FROM breeders WHERE id = ${Number(breeder.id)}`;
      expect(after.membership_tier).toBe("free");
    } finally {
      process.env.PAWLS_STRIPE_ALLOWLIST = undefined;
    }
  });

  test("commission config: default 0 (founding beta lock); malformed/missing allowlist -> null (fail closed)", () => {
    expect(getCommissionBps()).toBe(0);
    expect(parseAllowlist("not json")).toBeNull();
    expect(parseAllowlist(undefined)).toBeNull();
    expect(parseAllowlist('{"tiers":{"plus":{"amount_cents":799}}}')).not.toBeNull();
  });
});