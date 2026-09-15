/**
 * Security Finding #5 — checkout price + booking identity MUST be derived
 * server-side (P0 launch blocker).
 *
 * These tests run against the real dev Neon database (DATABASE_URL from .env,
 * same precedent as scripts/migrate.ts) with a MOCKED Stripe session creator:
 * live Stripe is never called and no secrets are printed.
 *
 * Coverage:
 *  - happy path: authenticated owner creates booking -> checkout returns a
 *    session URL; the Stripe amount/currency/product name equal the server-side
 *    snapshot (services.price_cents at creation); metadata carries only the
 *    bookingId; stripe_session_id is persisted on the booking before the
 *    redirect URL is returned.
 *  - adversarial: forged price, another user's booking, unauthenticated,
 *    unapproved provider, inactive service, already-paid, cancelled, expired,
 *    nonexistent booking — each must be rejected with a 4xx and never charged.
 *  - state machine: a new booking is pending_payment (never 'confirmed'); the
 *    DB CHECK constraint rejects 'confirmed' outright.
 */
import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

// Load .env with override (the sandbox shell injects a placeholder
// DATABASE_URL that shadows Bun's auto-load — same approach as migrate.ts).
// Must run before any sql() call; sql() is lazy so static imports are fine.
const ENV_PATH = join(process.cwd(), ".env");
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

import { sql } from "../db";
import { createBookingCore } from "./bookings";
import { deriveCheckout, parseCheckoutPayload } from "./payments";
import { sha256Hex, SESSION_COOKIE } from "../lib/auth/session";

const MARKER = `secfind5_${Date.now()}`;
const CUST_EMAIL = `${MARKER}_customer@example.com`;

// ── test fixtures ────────────────────────────────────────────────────────────
let userA: { id: number; token: string };
let userB: { id: number; token: string };
let approvedProviderId: number;
let providerPendingId: number;
let approvedServiceId: number;
let servicePriceCents = 3450; // €34.50 — server-authored price
let serviceCurrency = "eur"; // stored lowercase; checkout must uppercase it
let serviceName = `SecFind5 Walk ${MARKER}`;
const createdBookingIds: number[] = [];

/** Authenticated request with a real session cookie → DB. */
function authRequest(token: string): Request {
  return new Request("http://localhost:3000", {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
}
const ANON_REQUEST = new Request("http://localhost:3000");

async function insertUser(role: string): Promise<{ id: number; token: string }> {
  const email = `${MARKER}_${role}@example.com`;
  const [u] = await sql()`
    INSERT INTO users (email, name, email_verified_at, is_test, preferred_language)
    VALUES (${email}, ${"SecFind5 " + role}, NOW(), true, 'fr')
    RETURNING id
  `;
  const token = randomBytes(32).toString("base64url");
  await sql()`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (${Number(u.id)}, ${sha256Hex(token)}, NOW() + interval '1 day')
  `;
  return { id: Number(u.id), token };
}

async function insertProvider(approvalStatus: string): Promise<number> {
  const [p] = await sql()`
    INSERT INTO providers (name, category, description, location, approval_status)
    VALUES (${`${MARKER}_provider_${approvalStatus}`}, 'walker', 'test fixture - security finding 5', 'Paris', ${approvalStatus})
    RETURNING id
  `;
  return Number(p.id);
}

async function insertService(
  providerId: number,
  opts: { priceCents?: number; currency?: string; isActive?: boolean } = {},
): Promise<{ id: number; price_cents: number; currency: string; name: string }> {
  const priceCents = opts.priceCents ?? servicePriceCents;
  const currency = opts.currency ?? serviceCurrency;
  const name = `${serviceName}_${providerId}_${priceCents}`;
  const [s] = await sql()`
    INSERT INTO services (provider_id, name, price_cents, duration_minutes, currency, is_active)
    VALUES (${providerId}, ${name}, ${priceCents}, 60, ${currency}, ${opts.isActive ?? true})
    RETURNING id
  `;
  return { id: Number(s.id), price_cents: priceCents, currency, name };
}

/**
 * Direct booking insert for adversarial states (expired/paid/cancelled) that
 * the production createBooking flow correctly refuses to create.
 */
async function insertBooking(
  userId: number,
  providerId: number,
  serviceId: number,
  overrides: {
    bookingDate?: string; // 'YYYY-MM-DD'
    status?: string;
    paymentStatus?: string;
    cancellationStatus?: string;
    priceCents?: number;
    currency?: string;
  } = {},
): Promise<number> {
  const [b] = await sql()`
    INSERT INTO bookings (
      provider_id, service_id, customer_name, customer_email, booking_date, start_time,
      status, customer_user_id, price_cents, currency, payment_status, cancellation_status
    )
    VALUES (
      ${providerId}, ${serviceId}, 'SecFind5 Customer', ${CUST_EMAIL},
      ${overrides.bookingDate ?? tomorrowStr()}::date, '09:00'::time,
      ${overrides.status ?? "pending_payment"}, ${userId},
      ${overrides.priceCents ?? servicePriceCents}, ${overrides.currency ?? "EUR"},
      ${overrides.paymentStatus ?? "unpaid"}, ${overrides.cancellationStatus ?? "none"}
    )
    RETURNING id
  `;
  const id = Number(b.id);
  createdBookingIds.push(id);
  return id;
}

/** Mock Stripe: captures the exact params sent to Stripe, returns a fake session. */
let capturedParams: unknown[] = [];
const mockStripeCreate = async (params: unknown) => {
  capturedParams.push(params);
  const id = `cs_test_${capturedParams.length}_${MARKER}`;
  return { id, url: `https://checkout.stripe.com/c/pay/${id}` };
};

function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ── setup / teardown ─────────────────────────────────────────────────────────
beforeAll(async () => {
  await sql()`SELECT 1`; // ensure connectivity up-front
  userA = await insertUser("ownerA");
  userB = await insertUser("ownerB");
  approvedProviderId = await insertProvider("approved");
  providerPendingId = await insertProvider("pending");
  const svc = await insertService(approvedProviderId);
  approvedServiceId = svc.id;
  servicePriceCents = svc.price_cents;
  serviceCurrency = svc.currency;
  serviceName = svc.name;
});

afterAll(async () => {
  // Remove ONLY the fixtures this suite created (never touches other data).
  // Each statement is isolated so one failure cannot stop the rest.
  const steps = [
    () => sql()`DELETE FROM bookings WHERE customer_email = ${CUST_EMAIL}`,
    () => sql()`DELETE FROM services WHERE name LIKE ${`${MARKER}%`} OR name LIKE ${`SecFind5%`}`,
    () => sql()`DELETE FROM providers WHERE name LIKE ${`${MARKER}%`}`,
    () => sql()`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE ${`${MARKER}%`})`,
    () => sql()`DELETE FROM users WHERE email LIKE ${`${MARKER}%`}`,
  ];
  for (const step of steps) {
    try { await step(); } catch { /* best-effort */ }
  }
});

// ── tests ────────────────────────────────────────────────────────────────────
describe("Security Finding #5: server-derived checkout price + identity", () => {
  beforeEach(() => {
    capturedParams = [];
  });
  test("happy path: booking created by authenticated owner -> checkout uses server-derived amount/currency/product and persists session id", async () => {
    const created = await createBookingCore(
      authRequest(userA.token),
      {
        providerId: approvedProviderId,
        serviceId: approvedServiceId,
        customerName: "SecFind5 Customer",
        customerEmail: `${MARKER}_customer@example.com`,
        date: tomorrowStr(),
        time: "10:30",
      },
    );
    expect(created.success).toBe(true);
    if (!created.success) return;
    const bookingId = created.booking.id;
    createdBookingIds.push(bookingId);

    // Price/currency snapshot landed on the booking at creation time.
    expect(created.booking.price_cents).toBe(servicePriceCents);

    const res = await deriveCheckout(authRequest(userA.token), bookingId, {
      stripeCreate: mockStripeCreate,
    });
    expect(res).toHaveProperty("url");

    // Exactly ONE session was created, with server-derived values only.
    expect(capturedParams).toHaveLength(1);
    const p = capturedParams[0] as any;
    expect(p.line_items[0].price_data.unit_amount).toBe(servicePriceCents); // = services.price_cents snapshot
    expect(p.line_items[0].price_data.currency).toBe("EUR"); // uppercased server-side
    expect(p.line_items[0].price_data.product_data.name).toBe(serviceName);
    expect(p.metadata).toEqual({ bookingId: String(bookingId) }); // no client strings, no email

    const [row = null] = await sql()`
      SELECT status, payment_status, cancellation_status, stripe_session_id, price_cents, currency
      FROM bookings WHERE id = ${bookingId}
    `;
    expect(row).not.toBeNull();
    // Session id persisted BEFORE redirect (the URL was only returned after UPDATE).
    expect(String(row?.stripe_session_id)).toContain("cs_test_");
    // Unpaid booking is NOT confirmed — explicit pending_payment state.
    expect(String(row?.status)).toBe("pending_payment");
    expect(String(row?.payment_status)).toBe("unpaid");
    expect(String(row?.cancellation_status)).toBe("none");
    expect(Number(row?.price_cents)).toBe(servicePriceCents);
    expect(String(row?.currency)).toBe("EUR");
  });

  test("new booking snapshot: price_cents/currency are persisted at creation and the booking is never 'confirmed'", async () => {
    const created = await createBookingCore(
      authRequest(userB.token),
      {
        providerId: approvedProviderId,
        serviceId: approvedServiceId,
        customerName: "SecFind5 Customer",
        customerEmail: `${MARKER}_customer2@example.com`,
        date: tomorrowStr(),
        time: "11:00",
      },
    );
    expect(created.success).toBe(true);
    if (!created.success) return;
    createdBookingIds.push(created.booking.id);
    const [row = null] = await sql()`
      SELECT status, payment_status, price_cents, currency FROM bookings WHERE id = ${created.booking.id}
    `;
    expect(String(row?.status)).toBe("pending_payment");
    expect(String(row?.payment_status)).toBe("unpaid");
    expect(Number(row?.price_cents)).toBe(servicePriceCents);
    expect(String(row?.currency)).toBe("EUR");
  });

  test("client tampered price: validator rejects price fields entirely", () => {
    expect(() => parseCheckoutPayload({ bookingId: 1, priceCents: 1 })).toThrow(/priceCents/);
    expect(() => parseCheckoutPayload({ bookingId: 1, serviceName: "Hacked" })).toThrow(/serviceName/);
    expect(() => parseCheckoutPayload({ bookingId: 1, providerName: "Hacked" })).toThrow(/providerName/);
    expect(() => parseCheckoutPayload({ bookingId: 1, currency: "usd" })).toThrow(/currency/);
    expect(() => parseCheckoutPayload({ bookingId: 1, email: "x@y.z" })).toThrow(/email/);
    // Only the opaque id is accepted.
    expect(parseCheckoutPayload({ bookingId: 42 })).toEqual({ bookingId: 42 });
  });

  test("another user's booking: user B cannot open checkout for user A's booking", async () => {
    const bookingId = await insertBooking(userA.id, approvedProviderId, approvedServiceId);
    const res = await deriveCheckout(authRequest(userB.token), bookingId, {
      stripeCreate: mockStripeCreate,
    });
    expect(res).toMatchObject({ status: 403, code: "NOT_YOUR_BOOKING" });
    expect(capturedParams).toHaveLength(0); // never charged
  });

  test("unauthenticated checkout is rejected with 401 and never charged", async () => {
    const bookingId = await insertBooking(userA.id, approvedProviderId, approvedServiceId);
    const res = await deriveCheckout(ANON_REQUEST, bookingId, {
      stripeCreate: mockStripeCreate,
    });
    expect(res).toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(capturedParams).toHaveLength(0);
  });

  test("unapproved provider: checkout is rejected and never charged", async () => {
    const svc = await insertService(providerPendingId);
    const bookingId = await insertBooking(userA.id, providerPendingId, svc.id);
    const res = await deriveCheckout(authRequest(userA.token), bookingId, {
      stripeCreate: mockStripeCreate,
    });
    expect(res).toMatchObject({ status: 403, code: "PROVIDER_NOT_APPROVED" });
    expect(capturedParams).toHaveLength(0);
  });

  test("suspended provider: checkout is rejected (approval_status != approved)", async () => {
    const suspendedProviderId = await insertProvider("suspended");
    const svc = await insertService(suspendedProviderId);
    const bookingId = await insertBooking(userA.id, suspendedProviderId, svc.id);
    const res = await deriveCheckout(authRequest(userA.token), bookingId, {
      stripeCreate: mockStripeCreate,
    });
    expect(res).toMatchObject({ status: 403, code: "PROVIDER_NOT_APPROVED" });
    expect(capturedParams).toHaveLength(0);
  });

  test("inactive service: checkout is rejected and never charged", async () => {
    const svc = await insertService(approvedProviderId, { isActive: false });
    const bookingId = await insertBooking(userA.id, approvedProviderId, svc.id);
    const res = await deriveCheckout(authRequest(userA.token), bookingId, {
      stripeCreate: mockStripeCreate,
    });
    expect(res).toMatchObject({ status: 403, code: "SERVICE_INACTIVE" });
    expect(capturedParams).toHaveLength(0);
  });

  test("already-paid booking: checkout is rejected and never charged", async () => {
    const bookingId = await insertBooking(userA.id, approvedProviderId, approvedServiceId, {
      status: "paid",
      paymentStatus: "paid",
    });
    const res = await deriveCheckout(authRequest(userA.token), bookingId, {
      stripeCreate: mockStripeCreate,
    });
    expect(res).toMatchObject({ status: 409, code: "BOOKING_ALREADY_PAID" });
    expect(capturedParams).toHaveLength(0);
  });

  test("cancelled booking: checkout is rejected and never charged", async () => {
    const bookingId = await insertBooking(userA.id, approvedProviderId, approvedServiceId, {
      status: "cancelled",
      cancellationStatus: "cancelled_by_customer",
    });
    const res = await deriveCheckout(authRequest(userA.token), bookingId, {
      stripeCreate: mockStripeCreate,
    });
    expect(res).toMatchObject({ status: 409, code: "BOOKING_CANCELLED" });
    expect(capturedParams).toHaveLength(0);
  });

  test("expired booking (date passed): checkout is rejected and never charged", async () => {
    const bookingId = await insertBooking(userA.id, approvedProviderId, approvedServiceId, {
      bookingDate: "2026-01-01",
    });
    const res = await deriveCheckout(authRequest(userA.token), bookingId, {
      stripeCreate: mockStripeCreate,
    });
    expect(res).toMatchObject({ status: 422, code: "BOOKING_EXPIRED" });
    expect(capturedParams).toHaveLength(0);
  });

  test("nonexistent booking id: checkout is rejected with 404 and never charged", async () => {
    const res = await deriveCheckout(authRequest(userA.token), 2147483647, {
      stripeCreate: mockStripeCreate,
    });
    expect(res).toMatchObject({ status: 404, code: "BOOKING_NOT_FOUND" });
    expect(capturedParams).toHaveLength(0);
  });

  test("state machine: 'confirmed' is not a legal status anymore (DB CHECK constraint)", async () => {
    // Migration 006 replaced the loose default with an explicit CHECK — an
    // unpaid booking can no longer be represented as confirmed.
    let checkViolation = false;
    try {
      await sql()`
        INSERT INTO bookings (
        provider_id, service_id, customer_name, customer_email, booking_date, start_time, status
      ) VALUES (
        ${approvedProviderId}, ${approvedServiceId}, 'SecFind5', ${CUST_EMAIL},
        CURRENT_DATE + 1, '09:00', 'confirmed'
      )`;
    } catch (err: unknown) {
      checkViolation = err instanceof Error && /check constraint/i.test(String(err.message));
      await sql()`DELETE FROM bookings WHERE customer_email = ${`${MARKER}_customer@example.com`} AND status = 'confirmed'`;
    }
    expect(checkViolation).toBe(true);
  });
});