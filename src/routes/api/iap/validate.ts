import { createFileRoute } from "@tanstack/react-router";
import { handleRevenueCatWebhookRequest } from "../../../db/iap-core";

/**
 * RevenueCat webhook (Pawls Plus entitlements) — Security Finding #8.
 *
 * Thin wrapper around src/db/iap-core.ts (the single source of truth, mirroring
 * Finding #9's stripe webhook core): immutable app_user_id -> users.id
 * entitlement resolution, email informational only, fail-closed production
 * secret handling, HMAC/secret signature verification, atomic idempotency.
 *
 * Pawls Plus is NOT an active product in Phase 1 — this path is hardened
 * defense-in-depth and grants nothing unless a verified, resolver-mappable
 * RevenueCat event arrives (no such secret/account exists yet; env var names
 * documented in iap-core.ts).
 */
export const Route = createFileRoute("/api/iap/validate")({
  methods: ["POST"],
  handler: async ({ request }) => handleRevenueCatWebhookRequest(request),
});