/**
 * Standalone Stripe webhook handler.
 * Used directly by serve.ts to intercept webhook requests before
 * they reach the TanStack Start SSR handler.
 *
 * This module imports from node_modules directly — it runs in Bun,
 * not through the Vite build pipeline.
 */
import Stripe from "stripe";
import { neon } from "@neondatabase/serverless";

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return neon(url);
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

// ─── Schema helpers ────────────────────────────────────────────────

async function ensureSubscriptionsTable() {
  await sql()`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      plan TEXT NOT NULL DEFAULT 'pawnder-plus',
      status TEXT NOT NULL DEFAULT 'active',
      stripe_session_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

async function ensureBookingsColumns() {
  await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`;
  await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_session_id TEXT`;
}

async function ensureBreedersColumns() {
  await sql()`ALTER TABLE breeders ADD COLUMN IF NOT EXISTS stripe_session_id TEXT`;
}

async function ensureProcessedEventsTable() {
  await sql()`
    CREATE TABLE IF NOT EXISTS processed_webhook_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      processed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

async function isEventProcessed(eventId: string): Promise<boolean> {
  const rows = await sql()`SELECT id FROM processed_webhook_events WHERE id = ${eventId}`;
  return rows.length > 0;
}

async function markEventProcessed(eventId: string, eventType: string) {
  await sql()`
    INSERT INTO processed_webhook_events (id, event_type)
    VALUES (${eventId}, ${eventType})
    ON CONFLICT (id) DO NOTHING
  `;
}

// ─── Event handlers ────────────────────────────────────────────────

async function handlePlusSubscription(session: Stripe.Checkout.Session) {
  const email = session.customer_details?.email?.trim()?.toLowerCase();
  if (!email) {
    console.error("[webhook] Plus subscription: no email in session", session.id);
    return;
  }

  const plan = session.metadata?.plan || "pawnder-plus";
  const stripeSessionId = session.id;

  await ensureSubscriptionsTable();

  await sql()`
    INSERT INTO subscriptions (email, plan, status, stripe_session_id, updated_at)
    VALUES (${email}, ${plan}, 'active', ${stripeSessionId}, NOW())
    ON CONFLICT (email) DO UPDATE SET
      plan = EXCLUDED.plan,
      status = 'active',
      stripe_session_id = EXCLUDED.stripe_session_id,
      updated_at = NOW()
  `;

  console.log(`[webhook] Plus subscription activated: ${email} (session: ${stripeSessionId})`);
}

async function handleBookingPayment(session: Stripe.Checkout.Session) {
  const bookingId = session.metadata?.bookingId;
  if (!bookingId) {
    console.error("[webhook] Booking payment: no bookingId in session", session.id);
    return;
  }

  const stripeSessionId = session.id;

  await ensureBookingsColumns();

  const result = await sql()`
    UPDATE bookings
    SET status = 'paid', paid_at = NOW(), stripe_session_id = ${stripeSessionId}
    WHERE id = ${Number(bookingId)} AND paid_at IS NULL
  `;

  if (result.count && result.count > 0) {
    console.log(`[webhook] Booking marked as paid: #${bookingId} (session: ${stripeSessionId})`);
  } else {
    console.log(`[webhook] Booking #${bookingId} already paid or not found (session: ${stripeSessionId})`);
  }
}

async function handleBreederMembership(session: Stripe.Checkout.Session) {
  const breederId = session.metadata?.breederId;
  const tier = session.metadata?.tier;

  if (!breederId) {
    console.error("[webhook] Breeder membership: no breederId in session", session.id);
    return;
  }
  if (!tier) {
    console.error("[webhook] Breeder membership: no tier in session", session.id);
    return;
  }

  const stripeSessionId = session.id;

  await ensureBreedersColumns();

  const result = await sql()`
    UPDATE breeders
    SET membership_tier = ${tier}, stripe_session_id = ${stripeSessionId}
    WHERE id = ${Number(breederId)} AND membership_tier <> ${tier}
  `;

  if (result.count && result.count > 0) {
    console.log(`[webhook] Breeder #${breederId} upgraded to '${tier}' (session: ${stripeSessionId})`);
  } else {
    console.log(`[webhook] Breeder #${breederId} already at tier '${tier}' or not found (session: ${stripeSessionId})`);
  }
}

// ─── Main handler ──────────────────────────────────────────────────

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleStripeWebhook(request: Request): Promise<Response> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn("[webhook] STRIPE_WEBHOOK_SECRET not configured — acknowledging but not processing");
    return jsonResponse(
      { received: true, note: "Webhook secret not configured. Set STRIPE_WEBHOOK_SECRET in .env." },
      200,
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return jsonResponse({ error: "Missing stripe-signature header" }, 400);
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return jsonResponse({ error: "Failed to read request body" }, 400);
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("[webhook] Signature verification failed:", message);
    return jsonResponse({ error: `Signature verification failed: ${message}` }, 400);
  }

  console.log(`[webhook] Received event: ${event.type} (id: ${event.id})`);

  await ensureProcessedEventsTable();

  if (await isEventProcessed(event.id)) {
    console.log(`[webhook] Event ${event.id} already processed — skipping`);
    return jsonResponse({ received: true, note: "already processed" }, 200);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.metadata?.plan === "pawnder-plus") {
      await handlePlusSubscription(session);
    } else if (session.metadata?.bookingId) {
      await handleBookingPayment(session);
    } else if (session.metadata?.breederId) {
      await handleBreederMembership(session);
    } else {
      console.log("[webhook] checkout.session.completed with unrecognized metadata:", session.metadata);
    }
  } else {
    console.log(`[webhook] Unhandled event type: ${event.type}`);
  }

  await markEventProcessed(event.id, event.type);

  return jsonResponse({ received: true }, 200);
}
