import { createServerFn } from "@tanstack/react-start";
import { getStripe } from "../lib/stripe";
import { sql } from "../db";
import { ensureBookingTablesSql } from "./schema";
import type Stripe from "stripe";

// Revenue math: Stripe web fees are ~3% (€8 => ~€7.76 net); Apple IAP under
// the Small Business Program and Google Play (first $1M) are ~15% (€7.99 => ~€6.80 net).
// The €50K/month target should therefore be modeled against the blended web/native mix.

/**
 * Security Finding #5: checkout accepts ONLY an opaque booking id. Every other
 * value (price, currency, service/product name, provider name, email) is
 * derived from authoritative DB rows server-side. The client cannot influence
 * what is charged nor whose booking is charged.
 */
export type CheckoutInput = {
  bookingId: number;
};

export type CheckoutResult =
  | { url: string }
  | { status: number; code: string; error: string };

const ALLOWED_CHECKOUT_KEYS = new Set(["bookingId"]);

/** Strict payload gate: rejects ANY field beyond the opaque booking id. */
export function parseCheckoutPayload(data: unknown): CheckoutInput {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Invalid checkout data");
  }
  const d = data as Record<string, unknown>;
  for (const key of Object.keys(d)) {
    if (!ALLOWED_CHECKOUT_KEYS.has(key)) {
      throw new Error(`checkout accepts only bookingId; field '${key}' is not accepted`);
    }
  }
  const bookingId = Number(d.bookingId);
  if (!Number.isInteger(bookingId) || bookingId < 1) {
    throw new Error("bookingId is required");
  }
  return { bookingId };
}

/** Injection point for the Stripe call so tests never hit live Stripe. */
export type StripeSessionCreator = (
  params: Stripe.Checkout.SessionCreateParams,
) => Promise<{ id: string; url: string | null }>;

function isStripeSessionCreator(fn: unknown): fn is StripeSessionCreator {
  return typeof fn === "function";
}

/**
 * Core checkout logic (shared by the server function and the tests).
 *
 * Contract (all server-side):
 * - Authentication: requireUser — unauthenticated requests get 401 and are
 *   never charged.
 * - Ownership: the booking must be bound to the authenticated user
 *   (booking.customer_user_id === user.id), so a user can never open a
 *   checkout for someone else's booking.
 * - Price/currency/product_name come from the booking's immutable snapshot
 *   (price_cents/currency taken from `services` at creation time) and the
 *   service name row — never from the client.
 * - The booking must be chargeable: exists, payment_status != 'paid',
 *   cancellation_status = 'none', status = 'pending_payment', not expired
 *   (booking_date not in the past), provider approved and service active.
 * - The server-created Stripe Checkout Session id is persisted on the booking
 *   (stripe_session_id) in the same request, BEFORE the redirect URL is
 *   returned.
 * - Stripe metadata carries only server-derived identifiers (bookingId).
 */
export async function deriveCheckout(
  request: Request,
  bookingId: number,
  opts: { stripeCreate?: unknown },
): Promise<CheckoutResult> {
  const { requireUser } = await import("../lib/auth/authz");
  const auth = await requireUser(request);
  if (!auth.ok) {
    return { status: auth.status, code: auth.code, error: auth.message };
  }

  await ensureBookingTablesSql();

  const [row] = await sql()`
    SELECT
      b.id, b.provider_id, b.service_id, b.customer_user_id, b.booking_date::text AS booking_date,
      b.price_cents, b.currency, b.status, b.payment_status, b.cancellation_status,
      s.name AS service_name, s.is_active,
      p.name AS provider_name, p.approval_status
    FROM bookings b
    JOIN services s ON s.id = b.service_id
    JOIN providers p ON p.id = b.provider_id
    WHERE b.id = ${bookingId}
  `;

  if (!row) {
    return { status: 404, code: "BOOKING_NOT_FOUND", error: "Booking not found." };
  }

  const b = row as Record<string, unknown>;

  // Ownership: only the authenticated customer may open checkout for this booking.
  if (b.customer_user_id === null || Number(b.customer_user_id) !== auth.user.id) {
    return { status: 403, code: "NOT_YOUR_BOOKING", error: "This booking does not belong to your account." };
  }

  // Already paid.
  if (String(b.payment_status) === "paid") {
    return { status: 409, code: "BOOKING_ALREADY_PAID", error: "This booking has already been paid." };
  }

  // Cancelled.
  if (String(b.cancellation_status ?? "none") !== "none" || String(b.status) === "cancelled") {
    return { status: 409, code: "BOOKING_CANCELLED", error: "This booking has been cancelled." };
  }

  // Only pending_payment bookings may be charged (never paid/completed/refunded/failed).
  if (String(b.status) !== "pending_payment") {
    return { status: 409, code: "BOOKING_NOT_CHARGEABLE", error: "This booking is not chargeable in its current state." };
  }

  // Expired: booking_date in the past (server time).
  const bookingDate = new Date(String(b.booking_date) + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (isNaN(bookingDate.getTime()) || bookingDate < today) {
    return { status: 422, code: "BOOKING_EXPIRED", error: "This booking date has passed." };
  }

  // Provider must be approved (pending/rejected/suspended are not chargeable).
  if (String(b.approval_status) !== "approved") {
    return { status: 403, code: "PROVIDER_NOT_APPROVED", error: "This provider is not currently available for bookings." };
  }

  // Service must be active.
  const isActive = b.is_active === true || String(b.is_active) === "true";
  if (!isActive) {
    return { status: 403, code: "SERVICE_INACTIVE", error: "This service is no longer available." };
  }

  // Everything below is server-derived: amount/currency from the booking's
  // immutable snapshot, product name from the service row.
  const priceCents = Number(b.price_cents);
  const currency = String(b.currency ?? "EUR").toUpperCase();
  const serviceName = String(b.service_name ?? "Pawls service");
  const providerName = String(b.provider_name ?? "");

  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    return { status: 422, code: "BOOKING_PRICE_INVALID", error: "This booking has an invalid price." };
  }
  if (!/^[a-z]{3}$/i.test(currency)) {
    return { status: 422, code: "BOOKING_CURRENCY_INVALID", error: "This booking has an invalid currency." };
  }

  const stripeCreate = opts.stripeCreate;
  if (!isStripeSessionCreator(stripeCreate)) {
    return { status: 500, code: "PAYMENTS_NOT_CONFIGURED", error: "Payments are not configured." };
  }

  // Determine host from the incoming request
  let host = "http://localhost:3000";
  try {
    const reqHost = request?.headers?.get?.("host");
    if (reqHost) {
      host = `https://${reqHost}`;
    }
  } catch {
    // fall back to localhost
  }

  try {
    const session = await stripeCreate({
      mode: "payment",
      success_url: `${host}/book/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${host}/book`,
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: serviceName,
              description: providerName ? `Service by ${providerName}` : serviceName,
            },
            unit_amount: priceCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        bookingId: String(bookingId),
      },
    });

    if (!session.id || !session.url) {
      return { status: 502, code: "STRIPE_SESSION_FAILED", error: "Failed to create checkout session." };
    }

    // Persist the SERVER-created session id on the booking BEFORE redirect.
    await sql()`
      UPDATE bookings
      SET stripe_session_id = ${session.id}, updated_at = NOW()
      WHERE id = ${bookingId}
    `;

    return { url: session.url };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return { status: 502, code: "STRIPE_ERROR", error: message };
  }
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .validator((data: unknown): CheckoutInput => parseCheckoutPayload(data))
  .handler(async ({ data, request }): Promise<CheckoutResult> => {
    // Gracefully handle missing Stripe key (never present on the client).
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return { status: 500, code: "PAYMENTS_NOT_CONFIGURED", error: "Payments not configured" };
    }
    const stripe = getStripe();
    return deriveCheckout(request, data.bookingId, {
      stripeCreate: (params: Stripe.Checkout.SessionCreateParams) => stripe.checkout.sessions.create(params),
    });
  });

export type MembershipCheckoutInput = {
  breederId: number;
  tier: "plus" | "premium";
  priceCents: number;
};

export const createMembershipCheckout = createServerFn({ method: "POST" })
  .validator((data: unknown): MembershipCheckoutInput => {
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid checkout data");
    }
    const d = data as Record<string, unknown>;

    const breederId = Number(d.breederId);
    const tier = String(d.tier ?? "").trim();
    const priceCents = Number(d.priceCents);

    if (!breederId) throw new Error("breederId is required");
    if (tier !== "plus" && tier !== "premium") throw new Error("tier must be 'plus' or 'premium'");
    if (!priceCents || priceCents <= 0) throw new Error("priceCents must be positive");

    return { breederId, tier: tier as "plus" | "premium", priceCents };
  })
  .handler(async ({ data }): Promise<{ url: string } | { error: string }> => {
    // Gracefully handle missing Stripe key
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return { error: "Payments not configured" };
    }

    const stripe = getStripe();

    // Determine host for success/cancel URLs
    let host = "http://localhost:3000";
    try {
      const reqHost = process.env.VERCEL_URL || process.env.PUBLIC_HOST;
      if (reqHost) {
        host = `https://${reqHost}`;
      }
    } catch {
      // fall back to localhost
    }

    const tierLabel = data.tier === "premium" ? "Premium" : "Plus";
    const priceEuros = (data.priceCents / 100).toFixed(0);

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        success_url: `${host}/breed/${data.breederId}?upgraded=true`,
        cancel_url: `${host}/breed/membership`,
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: `Pawls ${tierLabel} Membership`,
                description: `${tierLabel} breeder membership — €${priceEuros}/month`,
              },
              unit_amount: data.priceCents,
              recurring: {
                interval: "month",
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          breederId: String(data.breederId),
          tier: data.tier,
        },
      });

      if (!session.url) {
        return { error: "Failed to create checkout session" };
      }

      return { url: session.url };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Stripe error";
      return { error: message };
    }
  });