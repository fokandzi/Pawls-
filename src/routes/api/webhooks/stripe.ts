import { createFileRoute } from "@tanstack/react-router";
import { getStripe } from "../../../lib/stripe";
import { sql } from "../../../db";

/**
 * Ensures the subscriptions table exists (IF NOT EXISTS).
 */
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

/**
 * Ensures the bookings table has the paid_at and stripe_session_id columns
 * needed for idempotent webhook processing.
 */
async function ensureBookingsColumns() {
  await sql()`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ
  `;
  await sql()`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS stripe_session_id TEXT
  `;
}

/**
 * Ensures the breeders table has the stripe_session_id column.
 */
async function ensureBreedersColumns() {
  await sql()`
    ALTER TABLE breeders
    ADD COLUMN IF NOT EXISTS stripe_session_id TEXT
  `;
}

/**
 * Ensures the processed_events table exists for idempotency tracking.
 * This prevents processing the same Stripe event twice.
 */
async function ensureProcessedEventsTable() {
  await sql()`
    CREATE TABLE IF NOT EXISTS processed_webhook_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      processed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

/**
 * Check if a Stripe event has already been processed.
 * Returns true if already processed, false otherwise.
 */
async function isEventProcessed(eventId: string): Promise<boolean> {
  const rows = await sql()`
    SELECT id FROM processed_webhook_events WHERE id = ${eventId}
  `;
  return rows.length > 0;
}

/**
 * Mark a Stripe event as processed.
 */
async function markEventProcessed(eventId: string, eventType: string) {
  await sql()`
    INSERT INTO processed_webhook_events (id, event_type)
    VALUES (${eventId}, ${eventType})
    ON CONFLICT (id) DO NOTHING
  `;
}

/**
 * Handle a Pawls Plus subscription checkout completion.
 * User identified by email from the Stripe session.
 */
async function handlePlusSubscription(session: any) {
  const email = session.customer_details?.email?.trim()?.toLowerCase();
  if (!email) {
    console.error("[webhook] Plus subscription: no email in session", session.id);
    return;
  }

  const plan = session.metadata?.plan || "pawnder-plus";
  const stripeSessionId = session.id;

  await ensureSubscriptionsTable();

  // Upsert: activate subscription for this email, updating if it already exists
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
  // Send an aggregate server-side event without email or other PII.
  const analyticsKey = process.env.POSTHOG_API_KEY;
  if (analyticsKey && analyticsKey !== "phc_placeholder_replace_me") {
    try {
      await fetch("https://us.i.posthog.com/capture/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: analyticsKey,
          event: "subscription_activated",
          distinct_id: "pawls-subscription-system",
          properties: { plan },
        }),
      });
    } catch (error) {
      console.warn("[analytics] subscription event failed", error);
    }
  }
}

/**
 * Handle a booking payment checkout completion.
 * Marks the booking as paid.
 */
async function handleBookingPayment(session: any) {
  const bookingId = session.metadata?.bookingId;
  if (!bookingId) {
    console.error("[webhook] Booking payment: no bookingId in session", session.id);
    return;
  }

  const stripeSessionId = session.id;

  await ensureBookingsColumns();

  // Idempotent: only update if not already paid (paid_at IS NULL)
  const result = await sql()`
    UPDATE bookings
    SET
      status = 'paid',
      paid_at = NOW(),
      stripe_session_id = ${stripeSessionId}
    WHERE id = ${Number(bookingId)}
      AND paid_at IS NULL
  `;

  if (result.count && result.count > 0) {
    console.log(`[webhook] Booking marked as paid: #${bookingId} (session: ${stripeSessionId})`);
  } else {
    console.log(`[webhook] Booking #${bookingId} already paid or not found (session: ${stripeSessionId})`);
  }
}

/**
 * Handle a breeder membership checkout completion.
 * Updates the breeder's membership tier.
 */
async function handleBreederMembership(session: any) {
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

  // Idempotent: only update if the membership tier has actually changed
  const result = await sql()`
    UPDATE breeders
    SET
      membership_tier = ${tier},
      stripe_session_id = ${stripeSessionId}
    WHERE id = ${Number(breederId)}
      AND membership_tier <> ${tier}
  `;

  if (result.count && result.count > 0) {
    console.log(`[webhook] Breeder #${breederId} upgraded to '${tier}' (session: ${stripeSessionId})`);
  } else {
    console.log(`[webhook] Breeder #${breederId} already at tier '${tier}' or not found (session: ${stripeSessionId})`);
  }
}

export const Route = createFileRoute("/api/webhooks/stripe")({
  methods: ["POST"],
  handler: async ({ request }: { request: Request }) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    // If webhook secret is not configured, acknowledge but log a warning.
    // Returns 200 so Stripe doesn't keep retrying while the owner sets it up.
    if (!webhookSecret) {
      console.warn("[webhook] STRIPE_WEBHOOK_SECRET not configured — acknowledging but not processing");
      return new Response(
        JSON.stringify({
          received: true,
          note: "Webhook secret not configured. Set STRIPE_WEBHOOK_SECRET in .env.",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    let body: string;
    try {
      body = await request.text();
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to read request body" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Verify the Stripe signature
    let event: any;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid signature";
      console.error("[webhook] Signature verification failed:", message);
      return new Response(
        JSON.stringify({ error: `Signature verification failed: ${message}` }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Log all incoming webhook events for debugging
    console.log(`[webhook] Received event: ${event.type} (id: ${event.id})`);

    // Ensure the processed-events tracking table exists
    await ensureProcessedEventsTable();

    // Idempotency guard: skip if we've already processed this exact event
    if (await isEventProcessed(event.id)) {
      console.log(`[webhook] Event ${event.id} already processed — skipping`);
      return new Response(JSON.stringify({ received: true, note: "already processed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Process the event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // Determine event type from metadata
      if (session.metadata?.plan === "pawnder-plus") {
        // Pawls Plus subscription
        await handlePlusSubscription(session);
      } else if (session.metadata?.bookingId) {
        // Booking payment
        await handleBookingPayment(session);
      } else if (session.metadata?.breederId) {
        // Breeder membership
        await handleBreederMembership(session);
      } else {
        console.log("[webhook] checkout.session.completed with unrecognized metadata:", session.metadata);
      }
    } else if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.updated") {
      const subscription = event.data.object;
      await ensureSubscriptionsTable();
      const email = subscription.customer_email || subscription.metadata?.email;
      const status = event.type === "customer.subscription.deleted" ? "canceled" : subscription.status;
      if (email) await sql()`UPDATE subscriptions SET status=${status}, updated_at=NOW() WHERE lower(email)=lower(${String(email)})`;
      console.log(`[webhook] Subscription entitlement synced: ${status}`);
    } else if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      await ensureSubscriptionsTable();
      const email = invoice.customer_email || invoice.metadata?.email;
      if (email) await sql()`UPDATE subscriptions SET status='past_due', updated_at=NOW() WHERE lower(email)=lower(${String(email)})`;
      console.log(`[webhook] Payment failed; Plus marked past_due`);
    } else {
      console.log(`[webhook] Unhandled event type: ${event.type}`);
    }

    // Mark event as processed
    await markEventProcessed(event.id, event.type);

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});
