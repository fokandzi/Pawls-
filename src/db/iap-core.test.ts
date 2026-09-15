/**
 * Security Finding #8 — adversarial tests for the HARDENED RevenueCat webhook
 * path (src/db/iap-core.ts) and the de-email-ified Plus grant/join sites
 * (isDogProfilePlus / plusTrendingDogs in src/db/schema.ts).
 *
 * Runs against the real dev Neon database (DATABASE_URL from .env, same
 * precedent as webhook-core.test.ts / payments.test.ts) with INJECTED
 * fabricated RevenueCat events — live RevenueCat is never called and no real
 * REVENUECAT_WEBHOOK_SECRET exists (the env var is documented, not fabricated).
 *
 * Coverage (all required by the finding):
 *  (a) forged/missing subscriber_attributes.email does NOT grant
 *  (b) valid app_user_id -> users.id mapping DOES grant (positive control)
 *  (c) email alone (even a real, valid-looking user email) does NOT grant
 *  (d) missing/replace_me prod secret -> FAIL CLOSED (500 + alert), NOT 200
 *  (e) CANCELLATION/EXPIRATION flip status off by user_id
 *  (f) replayed event -> idempotent, no double transition
 *  (g) checkSwipeAllowance + trending join resolve Plus via user identity,
 *      never email (a dog sharing a Plus subscriber's email but unlinked does
 *      NOT get entitlement)
 *  plus: signature verification (raw secret + HMAC sha256, invalid -> 401)
 */
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Load .env with override (sandbox shell injects a placeholder DATABASE_URL that
// shadows Bun's auto-load — same approach as webhook-core.test.ts).
const ENV_PATH = join(process.cwd(), ".env");
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

import { sql } from "../db";
import { processRevenueCatEvent, handleRevenueCatWebhookRequest, resolveRevenueCatUser } from "./iap-core";
import { isDogProfilePlus, plusTrendingDogs } from "./schema";

const MARKER = `sf8_${Date.now()}`;
const EVENT_PREFIX = `evt_rc_${MARKER}`;
let userCounter = 0;
let eventCounter = 0;

const users: Record<string, { id: number; email: string }> = {};
const dogs: Record<string, number> = {};

function nextEventId(): string {
  eventCounter += 1;
  return `${EVENT_PREFIX}_${eventCounter}`;
}

async function insertUser(role: string): Promise<{ id: number; email: string }> {
  userCounter += 1;
  const email = `${MARKER}_${role}@example.com`;
  const [u] = await sql()`
    INSERT INTO users (email, name, email_verified_at, is_test, preferred_language)
    VALUES (${email}, ${`SecFind8 ${role}`}, NOW(), true, 'fr')
    RETURNING id
  `;
  return { id: Number(u.id), email };
}

/** Lightweight, additive DDL so the test is self-sufficient on any dev DB. */
async function ensureTestTables() {
  await sql()`
    CREATE TABLE IF NOT EXISTS dog_profiles (
      id SERIAL PRIMARY KEY,
      owner_name TEXT NOT NULL,
      dog_name TEXT NOT NULL,
      breed TEXT NOT NULL,
      age INTEGER NOT NULL,
      size TEXT NOT NULL,
      energy_level TEXT NOT NULL,
      temperament TEXT NOT NULL,
      bio TEXT,
      photo_url TEXT,
      location TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS email TEXT`;
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false`;
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`;
  await sql()`CREATE INDEX IF NOT EXISTS idx_dog_profiles_user_id ON dog_profiles(user_id)`;
  await sql()`
    CREATE TABLE IF NOT EXISTS swipes (
      id SERIAL PRIMARY KEY,
      swiper_profile_id INTEGER REFERENCES dog_profiles(id),
      target_profile_id INTEGER REFERENCES dog_profiles(id),
      direction TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT swipes_unique_swiper_target_direction UNIQUE (swiper_profile_id, target_profile_id, direction)
    )
  `;
  await sql()`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      user_id INTEGER,
      plan TEXT NOT NULL DEFAULT 'pawnder-plus',
      status TEXT NOT NULL DEFAULT 'active',
      stripe_session_id TEXT,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      revenuecat_app_user_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql()`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS user_id INTEGER`;
  await sql()`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS revenuecat_app_user_id TEXT`;
}

async function insertDog(opts: {
  name: string;
  userId: number | null;
  email: string | null;
  isDemo?: boolean;
}): Promise<number> {
  const [d] = await sql()`
    INSERT INTO dog_profiles (
      owner_name, dog_name, breed, age, size, energy_level, temperament, bio, location,
      email, is_demo, user_id
    )
    VALUES (
      'SecFind8 Owner', ${opts.name}, 'Labrador', 3, 'M', 'high', 'friendly', 'sf8 dog', 'Paris',
      ${opts.email}, ${opts.isDemo ?? true}, ${opts.userId}
    )
    RETURNING id
  `;
  return Number(d.id);
}

/** Fabricated RevenueCat event (inner `event` object, as RevenueCat signs it). */
function rcEvent(overrides: Record<string, unknown>) {
  return {
    id: nextEventId(),
    type: "INITIAL_PURCHASE",
    app_user_id: "not-resolvable",
    transaction_id: `tx_${MARKER}_${eventCounter}`,
    store: "app_store",
    product_id: "pawls_plus_monthly",
    ...overrides,
  };
}

function rcSubscriptionRows(userId: number) {
  return sql()`SELECT user_id, email, plan, status, revenuecat_app_user_id FROM subscriptions WHERE user_id = ${userId}`;
}

beforeAll(async () => {
  await sql()`SELECT 1`;
  await ensureTestTables();
  users.a = await insertUser("a");
  users.b = await insertUser("b");
  users.c = await insertUser("c");
  users.d = await insertUser("d");
  users.e = await insertUser("e");
  dogs.a = await insertDog({ name: `${MARKER}_dogA`, userId: users.a.id, email: users.a.email });
  dogs.b = await insertDog({ name: `${MARKER}_dogB`, userId: null, email: users.a.email }); // spoofed email, no owner
  dogs.c = await insertDog({ name: `${MARKER}_dogC`, userId: users.b.id, email: users.b.email });
  dogs.swiper = await insertDog({ name: `${MARKER}_swiper`, userId: null, email: null });
});

afterAll(async () => {
  process.env.REVENUECAT_WEBHOOK_SECRET = undefined;
  const steps = [
    () => sql()`DELETE FROM processed_webhook_events WHERE id LIKE ${EVENT_PREFIX + "%"}`,
    () => sql()`DELETE FROM webhook_alerts WHERE event_id LIKE ${EVENT_PREFIX + "%"}`,
    () => sql()`DELETE FROM webhook_alerts WHERE code = 'REVENUECAT_SECRET_MISSING'`,
    () => sql()`DELETE FROM webhook_alerts WHERE message LIKE ${"%" + MARKER + "%"}`,
    () => sql()`DELETE FROM mail_log WHERE subject LIKE ${"%" + MARKER + "%"} OR body LIKE ${"%" + MARKER + "%"}`,
    () => sql()`DELETE FROM mail_log WHERE mode = 'ops_alert' AND subject = '[Pawls] webhook alert REVENUECAT_SECRET_MISSING'`,
    () => sql()`DELETE FROM swipes WHERE target_profile_id IN (${dogs.a}, ${dogs.b}, ${dogs.c}, ${dogs.swiper}) OR swiper_profile_id IN (${dogs.a}, ${dogs.b}, ${dogs.c}, ${dogs.swiper})`,
    () => sql()`DELETE FROM subscriptions WHERE email LIKE ${"%" + MARKER + "%"} OR revenuecat_app_user_id LIKE ${"%" + MARKER + "%"}`,
    () => sql()`DELETE FROM dog_profiles WHERE dog_name LIKE ${"%" + MARKER + "%"}`,
    () => sql()`DELETE FROM users WHERE email LIKE ${"%" + MARKER + "%"}`,
  ];
  for (const step of steps) {
    try { await step(); } catch { /* best-effort */ }
  }
});

describe("Security Finding #8: RevenueCat entitlement identity (immutable app_user_id)", () => {
  test("(a) forged email attribute (real user's email + unresolvable app_user_id) does NOT grant", async () => {
    const evt = rcEvent({
      app_user_id: "attacker-controlled-id",
      subscriber_attributes: { email: { value: users.c.email } },
    });
    const res = await processRevenueCatEvent(evt);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("PLUS_USER_UNRESOLVED");
    expect((await rcSubscriptionRows(users.c.id)).length).toBe(0);
    const [alert] = await sql()`SELECT code FROM webhook_alerts WHERE event_id = ${evt.id}`;
    expect(alert?.code).toBe("PLUS_USER_UNRESOLVED");
  });

  test("(a2) missing email attribute + unresolvable app_user_id -> no grant, alert", async () => {
    const evt = rcEvent({ app_user_id: "attacker-id-2" });
    delete evt.subscriber_attributes;
    const res = await processRevenueCatEvent(evt);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("PLUS_USER_UNRESOLVED");
  });

  test("(b) valid app_user_id -> users.id mapping (pawls_<id>) DOES grant (positive control)", async () => {
    const appUserId = `pawls_${users.a.id}`;
    const evt = rcEvent({
      app_user_id: appUserId,
      subscriber_attributes: { email: { value: users.a.email } },
    });
    const res = await processRevenueCatEvent(evt);
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    const rows = await rcSubscriptionRows(users.a.id);
    expect(rows.length).toBe(1);
    expect(Number(rows[0].user_id)).toBe(users.a.id);
    expect(rows[0].status).toBe("active");
    expect(rows[0].plan).toBe("pawnder-plus");
    expect(rows[0].revenuecat_app_user_id).toBe(appUserId);
    expect(String(rows[0].email)).toBe(users.a.email); // informational only
    // Bare-numeric legacy convention also resolves
    expect(await resolveRevenueCatUser(String(users.a.id))).toBe(users.a.id);
    expect(await resolveRevenueCatUser(`user:${users.a.id}`)).toBe(users.a.id);
  });

  test("(c) email alone (real, valid-looking user email) does NOT grant — with and without app_user_id", async () => {
    // No app_user_id at all: the old code granted purely on subscriber_attributes.email.
    const evt1 = rcEvent({ subscriber_attributes: { email: { value: users.d.email } } });
    delete evt1.app_user_id;
    const res1 = await processRevenueCatEvent(evt1);
    expect(res1.ok).toBe(false);
    expect(res1.code).toBe("PLUS_USER_UNRESOLVED");

    // app_user_id that merely LOOKS like an email must NOT be treated as identity.
    const evt2 = rcEvent({ app_user_id: users.d.email, subscriber_attributes: { email: { value: users.d.email } } });
    const res2 = await processRevenueCatEvent(evt2);
    expect(res2.ok).toBe(false);
    expect(res2.code).toBe("PLUS_USER_UNRESOLVED");
    expect((await rcSubscriptionRows(users.d.id)).length).toBe(0);
  });

  test("(d) missing or replace_me prod secret -> FAIL CLOSED (500 + alert), never 200", async () => {
    for (const missing of ["", "replace_me"]) {
      const res = await handleRevenueCatWebhookRequest(
        new Request("http://localhost/api/iap/validate", { method: "POST" }),
        { isProd: true, secret: missing },
      );
      expect(res.status).toBe(500);
      const body = (await res.json()) as { code?: string };
      expect(body.code).toBe("REVENUECAT_SECRET_MISSING");
    }
    const alerts = await sql()`SELECT code FROM webhook_alerts WHERE code = 'REVENUECAT_SECRET_MISSING' ORDER BY id DESC LIMIT 1`;
    expect(alerts.length).toBeGreaterThan(0);
  });

  test("(d2) missing secret in dev/test -> 200 warn, no mutation", async () => {
    const res = await handleRevenueCatWebhookRequest(
      new Request("http://localhost/api/iap/validate", { method: "POST" }),
      { isProd: false, secret: "" },
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { received?: boolean }).received).toBe(true);
  });

  test("(e) CANCELLATION flips Plus status off by user_id; EXPIRATION too", async () => {
    const appUserId = `pawls_${users.b.id}`;
    expect((await processRevenueCatEvent(rcEvent({ app_user_id: appUserId }))).ok).toBe(true);
    expect((await rcSubscriptionRows(users.b.id))[0].status).toBe("active");

    const cancelEvt = rcEvent({ type: "CANCELLATION", app_user_id: appUserId });
    const res = await processRevenueCatEvent(cancelEvt);
    expect(res.ok).toBe(true);
    expect((await rcSubscriptionRows(users.b.id))[0].status).toBe("canceled");

    // EXPIRATION is a no-op on an already-canceled row but must not error.
    const expEvt = rcEvent({ type: "EXPIRATION", app_user_id: appUserId });
    expect((await processRevenueCatEvent(expEvt)).ok).toBe(true);
    expect((await rcSubscriptionRows(users.b.id))[0].status).toBe("canceled");
  });

  test("(f) replayed event (same event id twice) -> idempotent, no double transition", async () => {
    const appUserId = `pawls_${users.e.id}`;
    const evt = rcEvent({ app_user_id: appUserId });
    const first = await processRevenueCatEvent(evt);
    expect(first.ok).toBe(true);
    const second = await processRevenueCatEvent(evt);
    expect(second.ok).toBe(true);
    expect(second.duplicate).toBe(true);
    const [count] = await sql()`SELECT COUNT(*)::int AS n FROM processed_webhook_events WHERE id = ${evt.id}`;
    expect(Number(count.n)).toBe(1);
    expect((await rcSubscriptionRows(users.e.id)).length).toBe(1);
    expect((await rcSubscriptionRows(users.e.id))[0].status).toBe("active");
  });

  test("signature verification: raw secret and HMAC sha256 pass; wrong signature -> 401", async () => {
    const secret = `test_secret_${MARKER}`;
    const event = rcEvent({ app_user_id: `pawls_${users.c.id}` });
    const body = JSON.stringify({ event });

    const raw = await handleRevenueCatWebhookRequest(
      new Request("http://localhost/api/iap/validate", { method: "POST", headers: { "x-revenuecat-signature": secret }, body }),
      { isProd: true, secret },
    );
    expect(raw.status).toBe(200);

    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
    const hex = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
    const hmac = await handleRevenueCatWebhookRequest(
      new Request("http://localhost/api/iap/validate", { method: "POST", headers: { "x-revenuecat-signature": `sha256=${hex}` }, body }),
      { isProd: true, secret },
    );
    expect(hmac.status).toBe(200);

    const bad = await handleRevenueCatWebhookRequest(
      new Request("http://localhost/api/iap/validate", { method: "POST", headers: { "x-revenuecat-signature": "forged" }, body }),
      { isProd: true, secret },
    );
    expect(bad.status).toBe(401);
  });
});

describe("Security Finding #8: Plus grant/join sites use user identity, not email", () => {
  test("(g) checkSwipeAllowance (isDogProfilePlus) grants via dog owner's user_id, never email", async () => {
    // Fresh grant for user a (idempotent upsert; active from earlier positive control).
    expect((await processRevenueCatEvent(rcEvent({ app_user_id: `pawls_${users.a.id}` }))).ok).toBe(true);

    // dogA owned by the Plus user -> Plus.
    expect(await isDogProfilePlus(dogs.a)).toBe(true);
    // dogB shares the SAME email as the Plus subscription but has NO owner link
    // -> must NOT be Plus (the old `dog_profiles.email = subscriptions.email`
    // check would have granted it).
    expect(await isDogProfilePlus(dogs.b)).toBe(false);
    // dogC owned by user b whose subscription is canceled -> not Plus.
    expect(await isDogProfilePlus(dogs.c)).toBe(false);
  });

  test("(g2) trending join resolves Plus dogs via user_id; email-only spoofed dogs never appear", async () => {
    await sql()`INSERT INTO swipes (swiper_profile_id, target_profile_id, direction) VALUES (${dogs.swiper}, ${dogs.a}, 'right') ON CONFLICT DO NOTHING`;
    const trending = await plusTrendingDogs();
    const ids = trending.map((d: any) => Number(d.id));
    expect(ids).toContain(dogs.a);
    // dogB's email matches the active subscription email exactly, but it has no
    // user_id link -> the old email join would include it; the user_id join must not.
    expect(ids).not.toContain(dogs.b);
    expect(ids).not.toContain(dogs.c);
    const dogARow = trending.find((d: any) => Number(d.id) === dogs.a);
    expect(Number(dogARow?.swipe_count ?? 0)).toBeGreaterThanOrEqual(1);
  });
});