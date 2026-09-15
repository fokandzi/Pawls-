import { createFileRoute } from "@tanstack/react-router";

/**
 * DEPRECATED — Security Finding #9.
 *
 * This was the non-idempotent webhook path that UNCONDITIONALLY set
 * bookings.status='paid' from metadata (no signature-verified reconciliation,
 * no idempotency, no amount/currency/session/owner checks). It is now a
 * fail-closed stub: it NEVER reads the body, NEVER constructs an event, and
 * NEVER mutates state. Stripe webhooks must be delivered to /api/webhooks/stripe
 * (the single idempotent processing path).
 */
export const Route = createFileRoute("/api/stripe-webhook")({
  methods: ["POST"],
  handler: async () =>
    new Response(
      JSON.stringify({
        error: "deprecated_endpoint",
        message: "This webhook endpoint is retired. Deliver Stripe events to /api/webhooks/stripe.",
      }),
      {
        status: 501,
        headers: { "Content-Type": "application/json" },
      },
    ),
});