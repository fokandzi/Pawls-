import { createServerFn } from "@tanstack/react-start";
import { sql } from "../db";
import { ensureDogProfilesSeeded } from "./dog-seed";

/**
 * Creates the booking marketplace tables (IF NOT EXISTS).
 * Safe to call multiple times — won't overwrite existing tables.
 */
export const createBookingTables = createServerFn({ method: "POST" }).handler(
  async () => {
    await sql()`
      CREATE TABLE IF NOT EXISTS providers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        location TEXT NOT NULL,
        image_url TEXT,
        rating NUMERIC(3,2) DEFAULT 4.5,
        review_count INTEGER DEFAULT 0,
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
        status TEXT NOT NULL DEFAULT 'confirmed',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    return { success: true };
  },
);

/**
 * Creates the match/swipe tables (IF NOT EXISTS).
 * Safe to call multiple times — won't overwrite existing tables.
 */
export const createMatchTables = createServerFn({ method: "POST" }).handler(
  async () => {
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

    await sql()`
      CREATE TABLE IF NOT EXISTS swipes (
        id SERIAL PRIMARY KEY,
        swiper_profile_id INTEGER REFERENCES dog_profiles(id),
        target_profile_id INTEGER REFERENCES dog_profiles(id),
        direction TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(swiper_profile_id, target_profile_id)
      )
    `;

    await sql()`
      CREATE TABLE IF NOT EXISTS matches (
        id SERIAL PRIMARY KEY,
        profile_id_1 INTEGER REFERENCES dog_profiles(id),
        profile_id_2 INTEGER REFERENCES dog_profiles(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(profile_id_1, profile_id_2)
      )
    `;

    return { success: true };
  },
);

/**
 * Ensures social media and email columns exist on dog_profiles.
 * Uses ALTER TABLE ADD COLUMN IF NOT EXISTS — safe to run multiple times.
 * Internal helper — use the exported createServerFn for public access.
 */
async function ensureSocialColumnsInternal() {
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS email TEXT`;
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS instagram TEXT`;
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS tiktok TEXT`;
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS twitter TEXT`;
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS youtube TEXT`;
}

/**
 * Public server function: ensures social media columns exist on dog_profiles.
 */
export const ensureSocialColumns = createServerFn({ method: "POST" }).handler(
  async () => {
    await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS instagram TEXT`;
    await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS tiktok TEXT`;
    await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS twitter TEXT`;
    await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS youtube TEXT`;
    return { success: true };
  },
);

/**
 * Updates social media links for a dog profile.
 */
export const updateDogSocialLinks = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null) throw new Error("Invalid data");
    const d = data as Record<string, unknown>;
    if (!d.profileId || typeof d.profileId !== "number") throw new Error("profileId required");
    return {
      profileId: d.profileId as number,
      instagram: (typeof d.instagram === "string" ? d.instagram : null) as string | null,
      tiktok: (typeof d.tiktok === "string" ? d.tiktok : null) as string | null,
      twitter: (typeof d.twitter === "string" ? d.twitter : null) as string | null,
      youtube: (typeof d.youtube === "string" ? d.youtube : null) as string | null,
    };
  })
  .handler(async ({ data }) => {
    await createMatchTables();
    await sql()`
      UPDATE dog_profiles
      SET instagram = ${data.instagram ?? null},
          tiktok = ${data.tiktok ?? null},
          twitter = ${data.twitter ?? null},
          youtube = ${data.youtube ?? null}
      WHERE id = ${data.profileId}
    `;
    return { success: true };
  });

/**
 * Account deletion — DISABLED (P0 security stopgap, phase P0-A).
 *
 * The previous implementation had NO authentication or ownership check: any
 * unauthenticated visitor could POST a forged numeric profile id and get
 * `{success:true}` while the handler deleted that profile's swipes, matches,
 * messages and the profile itself. Until the real auth phase lands (signed
 * identity cookie + ownership verification), the endpoint is hard-disabled:
 * every request gets a non-success response and NO database write happens.
 * The settings UI button is dead today anyway (hydration bug); the honest
 * "coming soon" copy will surface once hydration is fixed.
 */
export const deleteAccount = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    // Accept anything (or nothing) so every possible payload shape reaches the
    // disabled handler below and is answered with the same non-success result.
    return { profileId: null, email: null };
  })
  .handler(async () => {
    return {
      success: false,
      code: "ACCOUNT_DELETION_UNAVAILABLE",
      error: "Account deletion unavailable — coming soon",
    };
  });

export const checkSwipeAllowance = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ profileId: Number((data as any)?.profileId) }))
  .handler(async ({ data }) => {
    await createMatchTables();
    const [profile] = await sql()`SELECT email FROM dog_profiles WHERE id = ${data.profileId}`;
    if (profile?.email) { const plus = await sql()`SELECT id FROM subscriptions WHERE lower(email)=lower(${profile.email}) AND status IN ('active','trialing')`; if (plus.length) return { allowed: true, count: 0, isPlus: true }; }
    const rows = await sql()`SELECT COUNT(*)::int AS count FROM swipes WHERE swiper_profile_id=${data.profileId} AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;
    const count = Number((rows[0] as any)?.count ?? 0); return { allowed: count < 3, count, isPlus: false };
  });

export const ensureReferralsTable = createServerFn({ method: "POST" }).handler(async () => {
  await sql()`CREATE TABLE IF NOT EXISTS referrals (id SERIAL PRIMARY KEY, referrer_id TEXT NOT NULL, referred_email TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reward_granted BOOLEAN NOT NULL DEFAULT false, referral_code TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(referrer_id, referred_email))`;
  return { success: true };
});

export const processReferral = createServerFn({ method: "POST" })
  .validator((data: unknown) => { const d = data as any; if (!d?.referredEmail || !d?.referralCode) throw new Error("Referral details required"); return { referredEmail: String(d.referredEmail).trim().toLowerCase(), referralCode: String(d.referralCode).trim() }; })
  .handler(async ({ data }) => { await ensureReferralsTable(); const existing = await sql()`SELECT id FROM dog_profiles WHERE lower(email)=${data.referralCode.toLowerCase()}`; if (!existing.length) return { success: false, error: "Referral code not found" }; await sql()`INSERT INTO referrals(referrer_id,referred_email,referral_code,status,reward_granted) VALUES(${data.referralCode},${data.referredEmail},${data.referralCode},'qualified',true) ON CONFLICT DO NOTHING`; return { success: true, rewardGranted: true }; });

export const checkPlusStatus = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null || !("email" in data)) {
      throw new Error("email is required");
    }
    const email = (data as { email: string }).email?.trim()?.toLowerCase();
    if (!email) throw new Error("email is required");
    return { email };
  })
  .handler(async ({ data }) => {
    // Ensure the subscriptions table exists (created by webhook-handler too)
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
    const [row] = await sql()`
      SELECT id FROM subscriptions
      WHERE email = ${data.email} AND status = 'active'
    `;
    return { hasPlus: !!row };
  });

/**
 * Creates the breed/breeder tables (IF NOT EXISTS).
 * Safe to call multiple times — won't overwrite existing tables.
 */
export const createBreedTables = createServerFn({ method: "POST" }).handler(
  async () => {
    await sql()`
      CREATE TABLE IF NOT EXISTS breeders (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        location TEXT NOT NULL,
        description TEXT NOT NULL,
        breed_specialty TEXT NOT NULL,
        verification_status TEXT DEFAULT 'pending',
        membership_tier TEXT DEFAULT 'free',
        years_experience INTEGER DEFAULT 0,
        health_testing TEXT,
        image_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql()`
      CREATE TABLE IF NOT EXISTS litters (
        id SERIAL PRIMARY KEY,
        breeder_id INTEGER REFERENCES breeders(id),
        breed TEXT NOT NULL,
        birth_date DATE NOT NULL,
        available_count INTEGER NOT NULL DEFAULT 1,
        total_count INTEGER NOT NULL DEFAULT 1,
        price_cents INTEGER NOT NULL,
        health_tests TEXT,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    return { success: true };
  },
);

/**
 * Creates the connect tables (groups + events) (IF NOT EXISTS).
 * Safe to call multiple times — won't overwrite existing tables.
 */
export const createConnectTables = createServerFn({ method: "POST" }).handler(
  async () => {
    await sql()`
      CREATE TABLE IF NOT EXISTS connect_groups (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        location TEXT NOT NULL,
        category TEXT NOT NULL,
        member_count INTEGER NOT NULL DEFAULT 0,
        image_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql()`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        group_id INTEGER REFERENCES connect_groups(id),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        location TEXT NOT NULL,
        event_date DATE NOT NULL,
        start_time TIME NOT NULL,
        attendee_count INTEGER NOT NULL DEFAULT 0,
        image_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    return { success: true };
  },
);

/**
 * Creates the venues table (IF NOT EXISTS).
 * Safe to call multiple times — won't overwrite existing tables.
 */
export const createVenuesTable = createServerFn({ method: "POST" }).handler(
  async () => {
    await sql()`
      CREATE TABLE IF NOT EXISTS venues (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        lat NUMERIC(10,7) NOT NULL,
        lng NUMERIC(10,7) NOT NULL,
        description TEXT,
        dog_features TEXT[],
        rating NUMERIC(3,1) DEFAULT 4.5,
        image_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    return { success: true };
  },
);

/**
 * Creates the rescue tables (IF NOT EXISTS).
 * Safe to call multiple times — won't overwrite existing tables.
 */
export const createRescueTables = createServerFn({ method: "POST" }).handler(
  async () => {
    await sql()`
      CREATE TABLE IF NOT EXISTS shelters (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        location TEXT NOT NULL,
        description TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        website TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql()`
      CREATE TABLE IF NOT EXISTS rescue_dogs (
        id SERIAL PRIMARY KEY,
        shelter_id INTEGER REFERENCES shelters(id),
        name TEXT NOT NULL,
        breed TEXT NOT NULL,
        age INTEGER NOT NULL,
        size TEXT NOT NULL,
        gender TEXT NOT NULL,
        description TEXT NOT NULL,
        good_with_dogs BOOLEAN DEFAULT true,
        good_with_kids BOOLEAN DEFAULT true,
        good_with_cats BOOLEAN DEFAULT false,
        photo_url TEXT,
        urgent BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    return { success: true };
  },
);

/**
 * Creates the referrals table (IF NOT EXISTS).
 * Tracks who referred whom for the rewards system.
 */
export const createReferralsTable = createServerFn({ method: "POST" }).handler(
  async () => {
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
  },
);

/** Record a referral when a new user signs up with a referral code. */
export const recordReferral = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null) throw new Error("Invalid data");
    const d = data as Record<string, unknown>;
    if (!d.referrerCode || typeof d.referrerCode !== "string") throw new Error("referrerCode required");
    return {
      referrerCode: d.referrerCode,
      referredEmail: (typeof d.referredEmail === "string" ? d.referredEmail : null) as string | null,
      referredProfileId: (typeof d.referredProfileId === "number" ? d.referredProfileId : null) as number | null,
    };
  })
  .handler(async ({ data }) => {
    await createReferralsTable();
    // Avoid duplicates for the same referred info
    if (data.referredProfileId) {
      const [existing] = await sql()`
        SELECT id FROM referrals WHERE referred_profile_id = ${data.referredProfileId}
      `;
      if (existing) return { success: true, alreadyRecorded: true, count: 0 };
    }
    await sql()`
      INSERT INTO referrals (referrer_code, referred_email, referred_profile_id, status)
      VALUES (${data.referrerCode}, ${data.referredEmail ?? null}, ${data.referredProfileId ?? null}, 'completed')
    `;
    // Return count so the inviter can see it
    const [row] = await sql()`
      SELECT COUNT(*)::int AS count FROM referrals WHERE referrer_code = ${data.referrerCode}
    `;
    return { success: true, alreadyRecorded: false, count: Number(row.count) };
  });

/** Get referral count for a given code. */
export const getReferralCount = createServerFn({ method: "GET" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null || !("referrerCode" in data)) {
      throw new Error("referrerCode required");
    }
    return { referrerCode: (data as { referrerCode: string }).referrerCode };
  })
  .handler(async ({ data }) => {
    await createReferralsTable();
    const [row] = await sql()`
      SELECT COUNT(*)::int AS count FROM referrals WHERE referrer_code = ${data.referrerCode}
    `;
    return { count: Number(row.count) };
  });

/**
 * Returns the top trending dogs — Plus subscribers' dogs ranked by
 * right-swipe count in the last 7 days. Falls back to newest Plus
 * dogs if no recent swipes exist.
 */
export const getTrendingDogs = createServerFn({ method: "GET" }).handler(
  async () => {
    await createMatchTables();
    // Seed discoverable dogs on first visit so Viral Paws is never blank.
    await ensureDogProfilesSeeded();

    // Ensure subscriptions table exists
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

    // Count right-swipes per Plus dog in the last 7 days.
    // Public demo feed: ONLY seed-marked (is_demo) profiles may appear — real
    // profiles (including test/staff) must never leak into public discovery.
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
      INNER JOIN subscriptions sub ON dp.email = sub.email
      LEFT JOIN swipes s ON s.target_profile_id = dp.id
        AND s.direction = 'right'
        AND s.created_at >= NOW() - INTERVAL '7 days'
      WHERE sub.status = 'active'
        AND dp.is_demo = true
      GROUP BY dp.id, dp.dog_name, dp.breed, dp.photo_url, dp.location, dp.owner_name, dp.instagram, dp.tiktok, dp.twitter, dp.youtube
      ORDER BY swipe_count DESC, dp.created_at DESC
      LIMIT 20
    `;

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

/**
 * Creates the messages table (IF NOT EXISTS).
 * Safe to call multiple times — won't overwrite existing tables.
 */
export const createMessagesTable = createServerFn({ method: "POST" }).handler(
  async () => {
    await sql()`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        match_id INTEGER REFERENCES matches(id),
        sender_profile_id INTEGER REFERENCES dog_profiles(id),
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    return { success: true };
  },
);

/**
 * Creates the waitlist table (IF NOT EXISTS).
 * Safe to call multiple times — won't overwrite existing tables.
 */
export const createWaitlistTable = createServerFn({ method: "POST" }).handler(
  async () => {
    await sql()`
      CREATE TABLE IF NOT EXISTS waitlist (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    return { success: true };
  },
);

/**
 * Subscribe an email to the waitlist.
 * Returns { success, alreadySubscribed } — alreadySubscribed is true if
 * the email was already on the list (idempotent, no error thrown).
 */
export const subscribeToWaitlist = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null || !("email" in data)) {
      throw new Error("email is required");
    }
    const email = (data as { email: string }).email?.trim()?.toLowerCase();
    if (!email) throw new Error("email is required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Please enter a valid email address.");
    }
    return { email };
  })
  .handler(async ({ data }) => {
    // Ensure table exists
    await sql()`
      CREATE TABLE IF NOT EXISTS waitlist (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Check if already subscribed
    const [existing] = await sql()`SELECT id FROM waitlist WHERE email = ${data.email}`;
    if (existing) {
      return { success: true, alreadySubscribed: true };
    }

    await sql()`INSERT INTO waitlist (email) VALUES (${data.email})`;
    return { success: true, alreadySubscribed: false };
  });

/**
 * Returns all emails currently on the waitlist, newest first.
 */
export const getWaitlistEmails = createServerFn({ method: "GET" }).handler(
  async () => {
    await sql()`
      CREATE TABLE IF NOT EXISTS waitlist (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    const rows = await sql()`SELECT id, email, created_at FROM waitlist ORDER BY created_at DESC`;
    return rows.map((r: any) => ({
      id: Number(r.id),
      email: String(r.email),
      created_at: String(r.created_at),
    }));
  },
);
