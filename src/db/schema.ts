import { createServerFn } from "@tanstack/react-start";
import { sql } from "../db";

/**
 * Creates the booking marketplace tables (IF NOT EXISTS).
 * Safe to call multiple times — won't overwrite existing tables.
 */
/**
 * Plain (non-server-fn) DDL for the booking marketplace tables — used by the
 * server function below AND by core booking/checkout logic so it can run in
 * tests without the Start AsyncLocalStorage context.
 */
export async function ensureBookingTablesSql(): Promise<{ success: true }> {
    await sql()`
      CREATE TABLE IF NOT EXISTS providers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        location TEXT NOT NULL,
        image_url TEXT,
        -- NO fabricated review data: rating/review_count are set only by a real
        -- review. Migration 002/008 also DROP any inherited DEFAULT, so a fresh
        -- environment can never invent a 4.5 rating for a provider.
        rating NUMERIC(3,2),
        review_count INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql()`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        provider_id INTEGER REFERENCES providers(id),
        name TEXT NOT NULL,
        price_cents INTEGER NOT NULL,
        duration_minutes INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql()`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        provider_id INTEGER REFERENCES providers(id),
        service_id INTEGER REFERENCES services(id),
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        booking_date DATE NOT NULL,
        start_time TIME NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment','paid','completed','cancelled','refunded','failed')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        customer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        price_cents INTEGER,
        currency TEXT NOT NULL DEFAULT 'EUR',
        payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','pending','paid','refunded','failed')),
        cancellation_status TEXT DEFAULT 'none' CHECK (cancellation_status IN ('none','requested','cancelled_by_customer','cancelled_by_provider')),
        stripe_session_id TEXT,
        stripe_payment_intent_id TEXT,
        paid_at TIMESTAMPTZ,
        platform_fee_cents INTEGER NOT NULL DEFAULT 0,
        platform_fee_bps INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Safety net: bring older bookings tables up to the canonical migration 006
    // shape (additive, idempotent — the migration file remains the source of truth).
    await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`;
    await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_cents INTEGER`;
    await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR'`;
    await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','pending','paid','refunded','failed'))`;
    await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_status TEXT DEFAULT 'none' CHECK (cancellation_status IN ('none','requested','cancelled_by_customer','cancelled_by_provider'))`;
    await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_session_id TEXT`;
    await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT`;
    await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`;
    await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER NOT NULL DEFAULT 0`;
    await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS platform_fee_bps INTEGER NOT NULL DEFAULT 0`;
    await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`;

    // Safety net: bring older bookings tables up to the canonical migration 009
    // shape (Book MVP core: dog, lifecycle timestamps, availability, slot guard).
    // Additive, idempotent — migration 009 remains the source of truth.
    await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dog_id INTEGER`;
    await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`;
    await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`;
    await sql()`
      CREATE TABLE IF NOT EXISTS provider_availability (
        id SERIAL PRIMARY KEY,
        provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CHECK (end_time > start_time)
      )
    `;
    try {
      await sql()`CREATE UNIQUE INDEX IF NOT EXISTS provider_availability_window_key ON provider_availability (provider_id, day_of_week, start_time)`;
      await sql()`
        CREATE UNIQUE INDEX IF NOT EXISTS bookings_provider_slot_live_key
          ON bookings (provider_id, booking_date, start_time)
          WHERE status IN ('pending_payment', 'paid', 'completed')
      `;
    } catch (err) {
      // A pre-migration database holding live duplicate slots cannot carry the
      // unique index. Never take the booking tables down for it: booking-core
      // still pre-checks the slot and logs the collision honestly.
      console.warn("[schema] booking slot unique index not created", err);
    }

    return { success: true };
}

/**
 * Creates the match/swipe tables (IF NOT EXISTS).
 * Safe to call multiple times — won't overwrite existing tables.
 */
export async function ensureMatchTables(): Promise<{ success: true }> {
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

    // Add optional columns that may have been added via migration
    await ensureSocialColumnsInternal();
    await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS temperament_tags TEXT[] DEFAULT ARRAY[]::TEXT[]`;
    await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS distance_km NUMERIC(5,1)`;
    // P0-A: demo flag — only seed-marked profiles may appear in public demo feeds
    // (e.g. /viral). Real/test/staff profiles must never leak into public discovery.
    await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false`;
    // Security Finding #8: immutable owner linkage (users.id). Legacy demo/test
    // rows keep user_id NULL; Plus entitlement resolves via this column, never
    // via dog_profiles.email = subscriptions.email. Migration 001 also adds it;
    // this runtime ALTER keeps fresh/other DBs consistent (additive, idempotent).
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
      CREATE TABLE IF NOT EXISTS matches (
        id SERIAL PRIMARY KEY,
        profile_id_1 INTEGER REFERENCES dog_profiles(id),
        profile_id_2 INTEGER REFERENCES dog_profiles(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        state TEXT DEFAULT 'active' CHECK (state IN ('active','unmatched')),
        unmatched_at TIMESTAMPTZ,
        created_by_system BOOLEAN DEFAULT false,
        CONSTRAINT matches_profiles_unique UNIQUE (profile_id_1, profile_id_2),
        CONSTRAINT matches_profile_order_check CHECK (profile_id_1 < profile_id_2)
      )
    `;

    return { success: true };
}

/**
 * Ensures social media and email columns exist on dog_profiles.
 * Uses ALTER TABLE ADD COLUMN IF NOT EXISTS — safe to run multiple times.
 * Internal helper — plain, never reachable over HTTP.
 */
async function ensureSocialColumnsInternal() {
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS email TEXT`;
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS instagram TEXT`;
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS tiktok TEXT`;
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS twitter TEXT`;
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS youtube TEXT`;
}

/**
 * Security Finding #8 — Plus entitlement resolves via the dog's IMMUTABLE owner
 * (dog_profiles.user_id -> subscriptions.user_id), never via email. Plain
 * (non-server-fn) so tests can call it without the Start context.
 */
export async function isDogProfilePlus(profileId: number): Promise<boolean> {
  const [profile] = await sql()`SELECT user_id FROM dog_profiles WHERE id = ${profileId}`;
  if (!profile?.user_id) return false; // legacy/unlinked profile -> not Plus
  const plus = await sql()`
    SELECT id FROM subscriptions
    WHERE user_id = ${Number(profile.user_id)} AND status IN ('active','trialing')
    LIMIT 1
  `;
  return plus.length > 0;
}

/**
 * Creates the referrals table (IF NOT EXISTS).
 * Tracks who referred whom for the rewards system.
 */
export async function ensureReferralsTable(): Promise<{ success: true }> {
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
    // Index for fast lookup by referrer code
    await sql()`
      CREATE INDEX IF NOT EXISTS idx_referrals_referrer_code ON referrals(referrer_code)
    `;
    return { success: true };
}

/** Get referral count for a given code. */
export const getReferralCount = createServerFn({ method: "GET" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null || !("referrerCode" in data)) {
      throw new Error("referrerCode required");
    }
    return { referrerCode: (data as { referrerCode: string }).referrerCode };
  })
  .handler(async ({ data }) => {
    await ensureReferralsTable();
    const [row] = await sql()`
      SELECT COUNT(*)::int AS count FROM referrals WHERE referrer_code = ${data.referrerCode}
    `;
    return { count: Number(row.count) };
  });

/**
 * Security Finding #8 — the Plus-dog trending query joins through IMMUTABLE
 * identity (dog_profiles.user_id -> subscriptions.user_id), never
 * dp.email = sub.email. Plain (non-server-fn) so tests can call it directly.
 * Only seed-marked (is_demo) profiles may appear in public discovery.
 */
export async function plusTrendingDogs(): Promise<Record<string, any>[]> {
  const trending = await sql()`
    SELECT
      dp.id,
      dp.dog_name,
      dp.breed,
      dp.photo_url,
      dp.location,
      dp.owner_name,
      dp.instagram,
      dp.tiktok,
      dp.twitter,
      dp.youtube,
      COUNT(s.id)::int AS swipe_count
    FROM dog_profiles dp
    INNER JOIN subscriptions sub ON dp.user_id = sub.user_id
    LEFT JOIN swipes s ON s.target_profile_id = dp.id
      AND s.direction = 'right'
      AND s.created_at >= NOW() - INTERVAL '7 days'
    WHERE sub.status = 'active'
      AND dp.is_demo = true
    GROUP BY dp.id, dp.dog_name, dp.breed, dp.photo_url, dp.location, dp.owner_name, dp.instagram, dp.tiktok, dp.twitter, dp.youtube
    ORDER BY swipe_count DESC, dp.created_at DESC
    LIMIT 20
  `;
  return trending.map((d: any) => ({ ...d, swipe_count: Number(d.swipe_count) }));
}

/**
 * Returns the top trending dogs — Plus subscribers' dogs ranked by
 * right-swipe count in the last 7 days. Falls back to newest Plus
 * dogs if no recent swipes exist.
 */
export const getTrendingDogs = createServerFn({ method: "GET" }).handler(
  async () => {
    await ensureMatchTables();
    // P0 Data: no seeding from public page views - demo dog profiles already
    // exist and are marked is_demo=true. Fixture writes are guarded against
    // production (see assertNotProductionSeeding in dog-seed.ts).
    // Security Finding #8: join on immutable owner identity (dp.user_id =
    // sub.user_id), never email.
    const trending = await plusTrendingDogs();
    // If we got results with swipes, return them
    if (trending.length > 0) {
      return trending.map((d: any) => ({
        ...d,
        swipe_count: Number(d.swipe_count),
      }));
    }

    // Fallback: keep Viral Paws useful before the first Plus subscriber exists.
    // Profiles are public discovery content; Plus remains the feature/boost entitlement.
    // Restricted to seed-marked demo profiles only (see comment above) so real
    // test/staff profiles never appear in the public feed.
    const fallback = await sql()`
      SELECT
        dp.id,
        dp.dog_name,
        dp.breed,
        dp.photo_url,
        dp.location,
        dp.owner_name,
        dp.instagram,
        dp.tiktok,
        dp.twitter,
        dp.youtube,
        0 AS swipe_count
      FROM dog_profiles dp
      WHERE dp.is_demo = true
      ORDER BY dp.created_at DESC
      LIMIT 20
    `;

    return fallback.map((d: any) => ({
      ...d,
      swipe_count: 0,
    }));
  },
);
