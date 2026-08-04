import { createFileRoute } from "@tanstack/react-router";
import { getStripe } from "../../lib/stripe";
import { sql } from "../../db";
import { createBookingTables } from "../../db/schema";

export const Route = createFileRoute("/api/stripe-webhook")({
  methods: ["POST"],
  handler: async ({ request }: { request: Request }) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return new Response(JSON.stringify({ received: true, note: "Webhook secret not configured" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let body: string;
    try {
      body = await request.text();
    } catch {
      return new Response(JSON.stringify({ error: "Failed to read request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid signature";
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const bookingId = session.metadata?.bookingId;

      if (bookingId) {
        try {
          await createBookingTables();
          await sql()`
            UPDATE bookings SET status = 'paid' WHERE id = ${Number(bookingId)}
          `;
        } catch (err) {
          console.error("Failed to update booking status:", err);
          return new Response(JSON.stringify({ error: "Failed to update booking" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});
