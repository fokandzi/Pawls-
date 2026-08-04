import { createFileRoute } from "@tanstack/react-router";
import { sql } from "../../../db";

const ACTIVE_EVENTS = new Set(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE"]);
const INACTIVE_EVENTS = new Set(["CANCELLATION", "EXPIRATION"]);

async function ensureSubscriptionsTable() {
  await sql()`CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, plan TEXT NOT NULL DEFAULT 'pawnder-plus',
    status TEXT NOT NULL DEFAULT 'active', stripe_session_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`;
}

async function validSignature(body: string, signature: string, secret: string): Promise<boolean> {
  const bytes = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", bytes.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes.encode(body)));
  const expected = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
  return signature === expected || signature === `sha256=${expected}`;
}

function eventEmail(event: any): string | null {
  const attrs = event.subscriber_attributes || event.subscriber_attributes_by_key || {};
  const value = attrs.email?.value || attrs.$email?.value || event.email || event.properties?.email;
  const appUserId = event.app_user_id;
  return String(value || (String(appUserId).includes("@") ? appUserId : "")).trim().toLowerCase() || null;
}

export const Route = createFileRoute("/api/iap/validate")({
  methods: ["POST"],
  handler: async ({ request }) => {
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
    const body = await request.text();
    if (!secret || secret === "replace_me") return Response.json({ received: true, note: "Webhook secret not configured" });
    const signature = request.headers.get("x-revenuecat-signature") || request.headers.get("authorization") || "";
    // RevenueCat sends the configured secret in Authorization. Accept HMAC too
    // for deployments that use an x-revenuecat-signature signing proxy.
    if (signature !== secret && !(await validSignature(body, signature, secret))) return Response.json({ error: "Invalid webhook signature" }, { status: 401 });

    const payload = JSON.parse(body);
    const event = payload.event || payload;
    const type = String(event.type || "").toUpperCase();
    const email = eventEmail(event);
    if (!email) return Response.json({ received: true, note: "No email identity in event" });
    await ensureSubscriptionsTable();
    if (ACTIVE_EVENTS.has(type) || type === "NON_RENEWING_PURCHASE") {
      await sql()`INSERT INTO subscriptions (email, plan, status, updated_at) VALUES (${email}, 'pawnder-plus', 'active', NOW())
        ON CONFLICT (email) DO UPDATE SET plan='pawnder-plus', status='active', updated_at=NOW()`;
    } else if (INACTIVE_EVENTS.has(type)) {
      await sql()`UPDATE subscriptions SET status='canceled', updated_at=NOW() WHERE lower(email)=lower(${email})`;
    }
    return Response.json({ received: true });
  },
});
