import { createFileRoute } from "@tanstack/react-router";
import { handleStripeWebhookRequest } from "../../../db/webhook-core";

/**
 * LIVE Stripe webhook processing path on Vercel (and anywhere the Bun serve.ts
 * interceptor does not run). The old duplicate non-idempotent handler
 * (/api/stripe-webhook) is now a fail-closed 501 stub — this route is the ONLY
 * Stripe event processing entry point per runtime.
 *
 * All logic (signature verification, atomic idempotency, booking/amount/
 * currency/session/owner reconciliation, platform fee, plus user_id
 * resolution, breeder allowlist, fail-closed secret handling, alerts) lives in
 * src/db/webhook-core.ts (single source of truth, shared with webhook-handler.ts
 * on the Bun runtime and the adversarial tests).
 */
export const Route = createFileRoute("/api/webhooks/stripe")({
  methods: ["POST"],
  handler: async ({ request }: { request: Request }) => handleStripeWebhookRequest(request),
});