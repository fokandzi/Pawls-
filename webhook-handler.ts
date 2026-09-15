/**
 * LIVE Stripe webhook processing path on the Bun runtime (serve.ts, port 3000).
 *
 * Pre-SSR interceptor for /api/webhooks/stripe only — the old insecure
 * /api/stripe-webhook path is a fail-closed 501 stub and never processes events.
 *
 * All logic lives in src/db/webhook-core.ts (single source of truth shared with
 * the Vercel route src/routes/api/webhooks/stripe.ts and the adversarial tests).
 */
import { handleStripeWebhookRequest } from "./src/db/webhook-core";

export async function handleStripeWebhook(request: Request): Promise<Response> {
  return handleStripeWebhookRequest(request);
}