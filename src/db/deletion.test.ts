/**
 * Security Finding #13 — account deletion is subscription-safe on the IMMUTABLE
 * user identity (src/lib/auth/deletion.ts).
 *
 * Entitlement lives on subscriptions.user_id (Findings #8/#9); email is
 * informational-only and nullable. The old deletion keyed subscription cleanup
 * on lower(email), which could orphan a deleted user's subscription row or —
 * worse — delete a DIFFERENT user's subscription on a shared/legacy email.
 * This suite verifies deletion now resolves by user_id (with a legacy
 * user_id IS NULL + email fallback identical to the dog_profiles pattern), that
 * referrals/sessions/conversations leave no dangling rows, and that the
 * post-deletion entitlement views (isDogProfilePlus / plusTrendingDogs) never
 * reference a deleted user's subscription.
 *
 * Runs against the real dev Neon database (DATABASE_URL from .env, same
 * precedent as webhook-core.test.ts / iap-core.test.ts) with INJECTED fabricated
 * rows only — no real user data is touched and everything is cleaned up in
 * afterAll.
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
import { deleteUserAccount } from "../lib/auth/deletion";
import { isDogProfilePlus, plusTrendingDogs } from "./schema";

const MARKER = `sf13_${Date.now()}`;
let userCounter = 0;

interface TUser {
  id: number;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
  preferredLanguage: string | null;
  country: string | null;
  city: string | null;
  timezone: string | null;
}

const sessionUser = (u: { id: number; email: string }): TUser => ({
  id: u.id,
  email: u.email,
  name: `SF13 ${u.id}`,
  role: "user",
  emailVerified: true,
  preferredLanguage: "fr",
  country: null,
  city: null,
  timezone: null,
});

async function insertUser(): Promise<{ id: number; email: string }> {
  userCounter += 1;
  const email = `${MARKER}_u${userCounter}@example.com`;
  const [u] = await sql()`
    INSERT INTO users (email, name, email_verified_at, is_test, preferred_language)
    VALUES (${email}, ${`SecFind13 user ${userCounter}`}, NOW(), true, 'fr')
    RETURNING id
  `;
  return { id: Number(u.id), email };
}

async function insertDog(userId: number, name: string): Promise<number> {
  const [d] = await sql()`
    INSERT INTO dog_profiles (
      owner_name, dog_name, breed, age, size, energy_level, temperament, bio, location,
      email, is_demo, user_id
    )
    VALUES (
      'SF13 Owner', ${name}, 'Labrador', 3, 'M', 'high', 'friendly', 'sf13 dog', 'Paris',
      ${`${MARKER}@example.com`}, true, ${userId}
    )
    RETURNING id
  `;
  return Number(d.id);
}

async function insertSubscription(opts: { userId?: number | null; email?: string | null; plan?: string; status?: string }) {
  const [s] = await sql()`
    INSERT INTO subscriptions (user_id, email, plan, status)
    VALUES (${opts.userId ?? null}, ${opts.email ?? null}, ${opts.plan ?? "pawnder-plus"}, ${opts.status ?? "active"})
    RETURNING id
  `;
  return Number(s.id);
}

/** Lightweight, additive DDL so the test is self-sufficient on any dev DB. */
async function ensureTestTables() {
  await sql()`SELECT 1`;
  // Users / sessions / audit_log are ensured by ensureAuthTables() inside
  // deleteUserAccount itself; we add the remaining tables the cascade touches.
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS email TEXT`;
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false`;
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`;
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS owner_name TEXT`;
  await sql()`CREATE INDEX IF NOT EXISTS idx_dog_profiles_user_id ON dog_profiles(user_id)`;

  await sql()`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      user_id INTEGER,
      plan TEXT NOT NULL DEFAULT 'none',
      status TEXT NOT NULL DEFAULT 'active',
      stripe_session_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql()`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS user_id INTEGER`;
  await sql()`ALTER TABLE subscriptions ALTER COLUMN email DROP NOT NULL`;

  await sql()`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      booking_date DATE NOT NULL,
      start_time TIME NOT NULL,
      status TEXT DEFAULT 'confirmed',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      customer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    )
  `;

  await sql()`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      last_message_at TIMESTAMPTZ
    )
  `;
  await sql()`
    CREATE TABLE IF NOT EXISTS conversation_participants (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      left_at TIMESTAMPTZ,
      UNIQUE (conversation_id, user_id)
    )
  `;
  await sql()`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_profile_id INTEGER REFERENCES dog_profiles(id) ON DELETE SET NULL,
      body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql()`
    CREATE TABLE IF NOT EXISTS referrals (
      id SERIAL PRIMARY KEY,
      referrer_code TEXT NOT NULL,
      referred_email TEXT,
      referred_profile_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

let userX: { id: number; email: string };
let userOther: { id: number; email: string };
let userLegacy: { id: number; email: string };
let userNoSub: { id: number; email: string };
let userShared: { id: number; email: string };
let userOtherShared: { id: number; email: string };
let userBook: { id: number; email: string };
let userFull: { id: number; email: string };

let dogX: number;
let dogFull: number;
let dogOtherShared: number;

const ids: number[] = [];

async function countSubs(userId: number): Promise<number> {
  const [r] = await sql()`SELECT COUNT(*)::int AS n FROM subscriptions WHERE user_id = ${userId}`;
  return Number(r.n);
}
async function countSubsByEmail(email: string): Promise<number> {
  const [r] = await sql()`SELECT COUNT(*)::int AS n FROM subscriptions WHERE lower(email) = lower(${email})`;
  return Number(r.n);
}

beforeAll(async () => {
  await ensureTestTables();
  userX = await insertUser();
  userOther = await insertUser();
  userLegacy = await insertUser();
  userNoSub = await insertUser();
  userShared = await insertUser();
  userOtherShared = await insertUser();
  userBook = await insertUser();
  userFull = await insertUser();

  // (a) userX: subscription whose stored (informational) email does NOT match users.email.
  await insertSubscription({ userId: userX.id, email: `different-${MARKER}@other.invalid` });
  // (a/d) userOther: a NORMAL other user's subscription — must be untouched by X's delete.
  await insertSubscription({ userId: userOther.id, email: userOther.email });

  // (b) userLegacy: legacy subscription with user_id NULL matched by email -> cleaned.
  await insertSubscription({ userId: null, email: userLegacy.email });

  // (d) shared-email boundary: two subscription rows whose lower(email) is IDENTICAL but
  // owned by DIFFERENT user_ids. subscriptions.email is UNIQUE (case-sensitive in PG), so
  // the case-variant lets both rows coexist. Old lower(email) delete would nuke BOTH; the
  // user_id delete must keep userOtherShared's row.
  await insertSubscription({ userId: userShared.id, email: userShared.email });
  await insertSubscription({ userId: userOtherShared.id, email: userShared.email.toUpperCase() });
  dogOtherShared = await insertDog(userOtherShared.id, `${MARKER}_sharedOther`);

  // (e) userBook: a retained booking row (payments retained by law) to anonymize.
  await sql()`
    INSERT INTO bookings (customer_name, customer_email, booking_date, start_time, status, customer_user_id)
    VALUES ('SF13 Booked', ${userBook.email}, '2026-01-01', '10:00:00', 'paid', ${userBook.id})
  `;

  // (f) userFull: session + conversation/participant/message + referrals for dangling-row checks.
  await sql()`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (${userFull.id}, ${`sf13_${MARKER}_${userFull.id}`}, NOW() + interval '1 day')`;
  const [conv] = await sql()`INSERT INTO conversations DEFAULT VALUES RETURNING id`;
  const convId = Number(conv.id);
  await sql()`INSERT INTO conversation_participants (conversation_id, user_id) VALUES (${convId}, ${userFull.id})`;
  dogFull = await insertDog(userFull.id, `${MARKER}_fullDog`);
  await sql()`INSERT INTO messages (conversation_id, sender_user_id, sender_profile_id, body) VALUES (${convId}, ${userFull.id}, ${dogFull}, ${"sf13 msg " + MARKER})`;
  await sql()`INSERT INTO referrals (referrer_code, referred_email, status) VALUES (${userFull.email}, ${`referred-${MARKER}@x.invalid`}, 'pending')`;
  await sql()`INSERT INTO referrals (referrer_code, referred_email, referred_profile_id, status) VALUES (${`code-${MARKER}`}, ${userFull.email}, ${dogFull}, 'pending')`;

  dogX = await insertDog(userX.id, `${MARKER}_plusDog`);

  ids.push(userX.id, userOther.id, userLegacy.id, userNoSub.id, userShared.id, userOtherShared.id, userBook.id, userFull.id, dogX, dogFull, dogOtherShared, convId);
});

afterAll(async () => {
  const steps = [
    () => sql()`DELETE FROM bookings WHERE customer_email LIKE ${"%" + MARKER + "%"} OR customer_name LIKE ${"%" + MARKER + "%"}`,
    () => sql()`DELETE FROM referrals WHERE referrer_code LIKE ${"%" + MARKER + "%"} OR referred_email LIKE ${"%" + MARKER + "%"}`,
    () => sql()`DELETE FROM conversation_participants WHERE user_id = ANY(${ids})`,
    () => sql()`DELETE FROM messages WHERE body LIKE ${"%" + MARKER + "%"}`,
    () => sql()`DELETE FROM conversations WHERE id = ANY(${ids}) OR id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = ANY(${ids}))`,
    () => sql()`DELETE FROM subscriptions WHERE user_id = ANY(${ids}) OR email LIKE ${"%" + MARKER + "%"}`,
    () => sql()`DELETE FROM dog_profiles WHERE dog_name LIKE ${"%" + MARKER + "%"}`,
    () => sql()`DELETE FROM sessions WHERE user_id = ANY(${ids}) OR token_hash LIKE ${"%" + MARKER + "%"}`,
    () => sql()`DELETE FROM audit_log WHERE user_id = ANY(${ids})`,
    () => sql()`DELETE FROM users WHERE email LIKE ${"%" + MARKER + "%"}`,
  ];
  for (const step of steps) {
    try { await step(); } catch { /* best-effort */ }
  }
});

describe("Security Finding #13: deletion is subscription-safe on immutable user identity", () => {
  test("(a) user with mismatched subscriptions.email -> subscription gone, other user's subscription unharmed", async () => {
    // Sanity: userX has exactly one subscription, keyed by user_id, email differs from users.email.
    expect(await countSubs(userX.id)).toBe(1);
    expect((await sql()`SELECT email FROM subscriptions WHERE user_id = ${userX.id}`)[0].email).not.toBe(userX.email);
    // userOther's subscription exists and is untouched pre-delete.
    expect(await countSubs(userOther.id)).toBe(1);

    const res = await deleteUserAccount(sessionUser(userX));
    expect(res.ok).toBe(true);

    // userX's subscription row is fully gone (no orphan).
    expect(await countSubs(userX.id)).toBe(0);
    expect(await countSubsByEmail(userX.email)).toBe(0);
    // userOther's subscription survives intact.
    expect(await countSubs(userOther.id)).toBe(1);
    const [otherRow] = await sql()`SELECT user_id, email FROM subscriptions WHERE user_id = ${userOther.id}`;
    expect(Number(otherRow.user_id)).toBe(userOther.id);
    expect(String(otherRow.email)).toBe(userOther.email);
  });

  test("(b) legacy NULL user_id subscription matched by email -> cleaned", async () => {
    expect(await countSubsByEmail(userLegacy.email)).toBe(1);
    const res = await deleteUserAccount(sessionUser(userLegacy));
    expect(res.ok).toBe(true);
    expect(await countSubsByEmail(userLegacy.email)).toBe(0);
  });

  test("(c) delete with no subscription -> no error, still ok", async () => {
    expect(await countSubs(userNoSub.id)).toBe(0);
    const res = await deleteUserAccount(sessionUser(userNoSub));
    expect(res.ok).toBe(true);
    expect(await countSubs(userNoSub.id)).toBe(0);
  });

  test("(d) a second user sharing the same (case-variant) email is NOT affected", async () => {
    // userShared and userOtherShared have subscriptions whose lower(email) is identical.
    expect(await countSubsByEmail(userShared.email)).toBe(2); // both rows match lower(email)
    expect(await countSubs(userShared.id)).toBe(1);
    expect(await countSubs(userOtherShared.id)).toBe(1);

    const res = await deleteUserAccount(sessionUser(userShared));
    expect(res.ok).toBe(true);

    // userShared's own row is gone...
    expect(await countSubs(userShared.id)).toBe(0);
    // ...but userOtherShared's row (same lower email, different immutable owner) is untouched.
    expect(await countSubs(userOtherShared.id)).toBe(1);
    const [kept] = await sql()`SELECT user_id, email FROM subscriptions WHERE user_id = ${userOtherShared.id}`;
    expect(Number(kept.user_id)).toBe(userOtherShared.id);
    expect(String(kept.email).toLowerCase()).toBe(userShared.email);
    // The other user's dog is also untouched (deletion boundary).
    const [otherDog] = await sql()`SELECT id FROM dog_profiles WHERE id = ${dogOtherShared}`;
    expect(Number(otherDog.id)).toBe(dogOtherShared);
  });

  test("(e) bookings anonymized + retained for legal retention; subscription fully gone", async () => {
    const res = await deleteUserAccount(sessionUser(userBook));
    expect(res.ok).toBe(true);
    // Booking row RETAINED (payments records kept by law) but PII anonymized.
    const rows = await sql()`SELECT customer_name, customer_email, customer_user_id FROM bookings WHERE customer_email = 'deleted@example.invalid'`;
    const booking = rows.find((r: any) => String(r.customer_name) === "Deleted user");
    expect(booking).toBeTruthy();
    expect(String(booking.customer_email)).toBe("deleted@example.invalid");
    expect(booking.customer_user_id).toBeNull();
    // No subscription remains for the deleted user.
    expect(await countSubs(userBook.id)).toBe(0);
    expect(await countSubsByEmail(userBook.email)).toBe(0);
  });

  test("(f) transaction succeeds; no dangling rows (sessions/conversations/referrals cleaned)", async () => {
    const [sessionBefore] = await sql()`SELECT id FROM sessions WHERE user_id = ${userFull.id}`;
    expect(sessionBefore).toBeTruthy();
    const [convBefore] = await sql()`SELECT id FROM conversations WHERE id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = ${userFull.id})`;
    expect(convBefore).toBeTruthy();
    const [refBefore] = await sql()`SELECT COUNT(*)::int AS n FROM referrals WHERE lower(referrer_code) = lower(${userFull.email}) OR lower(referred_email) = lower(${userFull.email}) OR referred_profile_id = ${dogFull}`;
    expect(Number(refBefore.n)).toBeGreaterThan(0);

    const res = await deleteUserAccount(sessionUser(userFull));
    expect(res.ok).toBe(true);

    // sessions gone
    expect((await sql()`SELECT id FROM sessions WHERE user_id = ${userFull.id}`).length).toBe(0);
    // conversation + participant gone
    expect((await sql()`SELECT id FROM conversations WHERE id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = ${userFull.id})`).length).toBe(0);
    expect((await sql()`SELECT id FROM conversation_participants WHERE user_id = ${userFull.id}`).length).toBe(0);
    // referrals referencing the user or their dogs gone (no dangling rows)
    const [refAfter] = await sql()`SELECT COUNT(*)::int AS n FROM referrals WHERE lower(referrer_code) = lower(${userFull.email}) OR lower(referred_email) = lower(${userFull.email}) OR referred_profile_id = ${dogFull}`;
    expect(Number(refAfter.n)).toBe(0);
    // dog gone
    expect((await sql()`SELECT id FROM dog_profiles WHERE id = ${dogFull}`).length).toBe(0);
    // users row gone
    expect((await sql()`SELECT id FROM users WHERE id = ${userFull.id}`).length).toBe(0);
  });

  test("post-deletion: isDogProfilePlus / plusTrendingDogs never reference a deleted user's subscription", async () => {
    // userX had an ACTIVE subscription and a demo dog. After deletion neither the dog
    // nor the subscription exists, so the Plus views must not surface anything.
    expect(await countSubs(userX.id)).toBe(0);
    expect((await sql()`SELECT id FROM dog_profiles WHERE id = ${dogX}`).length).toBe(0);
    expect(await isDogProfilePlus(dogX)).toBe(false);
    const trending = await plusTrendingDogs();
    const idsList = trending.map((d: any) => Number(d.id));
    expect(idsList).not.toContain(dogX);
  });
});
