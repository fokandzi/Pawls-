-- ============================================================================
-- Pawls migration 002 — P0 Schema Foundation (2026-08-12)
-- Additive + idempotent. Safe to run multiple times. Records into
-- schema_migrations (created by the runner in scripts/migrate.ts).
--
-- APPLY:   bun run db:migrate
-- TEST:    bun run db:migrate --scratch   (applies to a throwaway database)
--
-- SCOPE:
--   1. dog model     — dog_profiles discovery/location columns (nullable, additive)
--   2. ownership     — dog_profiles.user_id FK + index (multi-dog per user: no unique)
--   3. location      — users.region (completes country/city/region/timezone)
--   4. swipes fix    — drop UNIQUE(swiper,target) -> UNIQUE(swiper,target,direction)
--                      (a user may change their mind: like then pass on the same dog)
--   5. matches fix   — drop UNIQUE(profile_id_1,profile_id_2) -> same UNIQUE plus
--                      CHECK (profile_id_1 < profile_id_2) so (A,B) == (B,A);
--                      + state/unmatched_at/created_by_system columns
--   6. rate_limits   — NO CHANGE. Ground truth (pg_constraint on prod) shows the
--                      composite UNIQUE (action,key,window_start) ALREADY exists
--                      (rate_limits_action_key_window_start_key, created in 001).
--                      The "three single-column uniques" reading in the phase
--                      brief was an artifact of the introspection query, which
--                      lists each column of a composite constraint as a row.
--                      Touching this table would be pointless churn on a live
--                      auth hot-path — see docs/schema-migration-safety.md.
--   7. messaging     — conversations, conversation_participants, messages
--   8. providers     — owner_user_id, approval_status, market fields, is_demo;
--                      rating DEFAULT 4.5 DROPPED (no fabricated default).
--   9. bookings      — customer_user_id, dog_id, price/currency/payment/refund
--                      columns, updated_at; commission_configs table.
--  10. safety        — blocks, reports (+ indexes); audit_log (from 001) is the
--                      moderation audit trail.
--  11. demo markers  — is_demo on providers/breeders/shelters/venues;
--                      dog_profiles.source ('user'|'demo'|'seed').
--  12. subscriptions — plan DEFAULT 'pawnder-plus' -> 'none'; user_id column.
--
-- Every table that exists in production is also re-created here in full shape
-- (CREATE TABLE IF NOT EXISTS) so the --scratch database (which starts from
-- 001 only) ends up with the complete production-equivalent schema.
--
-- DOWN (documented for manual rollback; never auto-executed):
--   DROP TABLE IF EXISTS commission_configs, reports, blocks, messages,
--     conversation_participants, conversations;
--   ALTER TABLE users DROP COLUMN IF EXISTS region;
--   ALTER TABLE dog_profiles DROP COLUMN IF EXISTS updated_at;
--   ALTER TABLE dog_profiles DROP COLUMN IF EXISTS source;
--   ALTER TABLE dog_profiles DROP COLUMN IF EXISTS approx_lng;
--   ALTER TABLE dog_profiles DROP COLUMN IF EXISTS approx_lat;
--   ALTER TABLE dog_profiles DROP COLUMN IF EXISTS city;
--   ALTER TABLE dog_profiles DROP COLUMN IF EXISTS region;
--   ALTER TABLE dog_profiles DROP COLUMN IF EXISTS country;
--   ALTER TABLE dog_profiles DROP COLUMN IF EXISTS profile_visibility;
--   ALTER TABLE dog_profiles DROP COLUMN IF EXISTS additional_photo_urls;
--   ALTER TABLE dog_profiles DROP COLUMN IF EXISTS neutered_spayed;
--   ALTER TABLE dog_profiles DROP COLUMN IF EXISTS vaccination_status;
--   ALTER TABLE dog_profiles DROP COLUMN IF EXISTS child_friendly;
--   ALTER TABLE dog_profiles DROP COLUMN IF EXISTS dog_friendly;
--   ALTER TABLE dog_profiles DROP COLUMN IF EXISTS weight_kg;
--   ALTER TABLE dog_profiles DROP COLUMN IF EXISTS sex;
--   ALTER TABLE dog_profiles DROP COLUMN IF EXISTS date_of_birth;
--   ALTER TABLE swipes DROP CONSTRAINT IF EXISTS swipes_unique_swiper_target_direction;
--   ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_profile_order_check;
--   ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_profiles_unique;
--   ALTER TABLE matches DROP COLUMN IF EXISTS created_by_system;
--   ALTER TABLE matches DROP COLUMN IF EXISTS unmatched_at;
--   ALTER TABLE matches DROP COLUMN IF EXISTS state;
--   ALTER TABLE providers DROP COLUMN IF EXISTS is_demo;
--   ALTER TABLE providers DROP COLUMN IF EXISTS timezone;
--   ALTER TABLE providers DROP COLUMN IF EXISTS currency;
--   ALTER TABLE providers DROP COLUMN IF EXISTS city;
--   ALTER TABLE providers DROP COLUMN IF EXISTS country;
--   ALTER TABLE providers DROP COLUMN IF EXISTS approval_status;
--   ALTER TABLE providers DROP COLUMN IF EXISTS owner_user_id;
--   ALTER TABLE services DROP COLUMN IF EXISTS is_active;
--   ALTER TABLE services DROP COLUMN IF EXISTS currency;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS updated_at;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS refund_reference;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS refund_state;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS cancelled_at;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS cancellation_status;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS stripe_payment_intent_id;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS payment_status;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS platform_fee_rate;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS platform_fee_cents;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS currency;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS price_cents;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS end_time;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS dog_id;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS customer_user_id;
--   ALTER TABLE subscriptions DROP COLUMN IF EXISTS user_id;
--   ALTER TABLE subscriptions ALTER COLUMN plan SET DEFAULT 'pawnder-plus';
--   ALTER TABLE breeders DROP COLUMN IF EXISTS is_demo;
--   ALTER TABLE shelters DROP COLUMN IF EXISTS is_demo;
--   ALTER TABLE venues DROP COLUMN IF EXISTS is_demo;
--   -- NOTE: providers.rating / venues.rating keep their corrected no-default
--   -- state; restoring the fabricated DEFAULT 4.5 would violate the honesty
--   -- standard and is only offered here if a full schema rollback demands it:
--   ALTER TABLE providers ALTER COLUMN rating SET DEFAULT 4.5;
--   ALTER TABLE venues ALTER COLUMN rating SET DEFAULT 4.5;
-- ============================================================================

-- --- 1/2/3. dog_profiles: dog model, ownership, discovery location ------------
-- Full production-equivalent shape (no-op where the table exists; makes the
-- scratch database complete). New columns are all nullable/backward-compatible:
-- legacy `age INT` is KEPT for existing rows; the app derives age from
-- date_of_birth going forward. bio stays the description field (no duplicated
-- `description` column — see safety doc). approx_lat/approx_lng are an
-- APPROXIMATE discovery location (e.g. city-centre grid), never a precise home
-- point, and are never exposed publicly.
CREATE TABLE IF NOT EXISTS dog_profiles (
  id                    SERIAL PRIMARY KEY,
  owner_name            TEXT NOT NULL,
  dog_name              TEXT NOT NULL,
  breed                 TEXT NOT NULL,
  age                   INTEGER NOT NULL,
  size                  TEXT NOT NULL,
  energy_level          TEXT NOT NULL,
  temperament           TEXT NOT NULL,
  bio                   TEXT,
  photo_url             TEXT,
  location              TEXT NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  temperament_tags      TEXT[] DEFAULT ARRAY[]::text[],
  distance_km           NUMERIC,
  email                 TEXT,
  instagram             TEXT,
  tiktok                TEXT,
  twitter               TEXT,
  youtube               TEXT,
  is_demo               BOOLEAN DEFAULT false,
  user_id               INTEGER REFERENCES users(id),
  date_of_birth         DATE,
  sex                   TEXT,
  weight_kg             NUMERIC,
  dog_friendly          BOOLEAN,
  child_friendly        BOOLEAN,
  vaccination_status    TEXT,
  neutered_spayed       BOOLEAN,
  additional_photo_urls TEXT[],
  profile_visibility    TEXT DEFAULT 'public' CHECK (profile_visibility IN ('public','hidden')),
  country               TEXT,
  region                TEXT,
  city                  TEXT,
  approx_lat            DOUBLE PRECISION,
  approx_lng            DOUBLE PRECISION,
  source                TEXT DEFAULT 'user' CHECK (source IN ('user','demo','seed')),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS sex TEXT;
ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS weight_kg NUMERIC;
ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS dog_friendly BOOLEAN;
ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS child_friendly BOOLEAN;
ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS vaccination_status TEXT;
ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS neutered_spayed BOOLEAN;
ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS additional_photo_urls TEXT[];
ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS profile_visibility TEXT DEFAULT 'public' CHECK (profile_visibility IN ('public','hidden'));
ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS approx_lat DOUBLE PRECISION;
ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS approx_lng DOUBLE PRECISION;
ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'user' CHECK (source IN ('user','demo','seed'));
ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
-- is_demo already exists in production (legacy app DDL); needed here for the
-- scratch database, whose dog_profiles starts as the 001 stub (id + user_id).
ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
-- Ownership: multi-dog per user (deliberately NO unique on user_id). The
-- user_id FK already exists in production (created in 001); index guard:
CREATE INDEX IF NOT EXISTS idx_dog_profiles_user_id ON dog_profiles(user_id);
-- Discovery hot path excludes demo rows:
CREATE INDEX IF NOT EXISTS idx_dog_profiles_is_demo ON dog_profiles(is_demo);

-- --- 3. users.region ---------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS region TEXT;

-- --- 4. swipes constraint correction -----------------------------------------
-- BEFORE: UNIQUE (swiper_profile_id, target_profile_id)  [swipes_swiper_profile_id_target_profile_id_key]
--         -> a profile could never swipe the same target twice, not even to
--            change its mind (like -> pass), and there was no per-direction rule.
-- AFTER : UNIQUE (swiper_profile_id, target_profile_id, direction)
--         -> one row per (swiper, target, direction): swiping the same dog again
--            in the SAME direction is an idempotent no-op; switching direction
--            is a valid mind-change. Direction semantics ('like'/'pass') are
--            enforced by the app in the matching phase.
CREATE TABLE IF NOT EXISTS swipes (
  id                 SERIAL PRIMARY KEY,
  swiper_profile_id  INTEGER REFERENCES dog_profiles(id),
  target_profile_id  INTEGER REFERENCES dog_profiles(id),
  direction          TEXT NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT swipes_unique_swiper_target_direction UNIQUE (swiper_profile_id, target_profile_id, direction)
);

ALTER TABLE swipes DROP CONSTRAINT IF EXISTS swipes_swiper_profile_id_target_profile_id_key;
ALTER TABLE swipes DROP CONSTRAINT IF EXISTS swipes_unique_swiper_target_direction;
ALTER TABLE swipes ADD CONSTRAINT swipes_unique_swiper_target_direction UNIQUE (swiper_profile_id, target_profile_id, direction);
-- Hot paths: "all swipes by X" (covered by the unique's leading column) and
-- "who swiped X" (discovery/mutual-match check):
CREATE INDEX IF NOT EXISTS idx_swipes_target_profile_id ON swipes(target_profile_id);
CREATE INDEX IF NOT EXISTS idx_swipes_swiper_profile_id ON swipes(swiper_profile_id);

-- --- 5. matches constraint correction ----------------------------------------
-- BEFORE: UNIQUE (profile_id_1, profile_id_2)  [matches_profile_id_1_profile_id_2_key]
--         -> (A,B) and (B,A) were DIFFERENT matches of the same pair.
-- AFTER : CHECK (profile_id_1 < profile_id_2) + UNIQUE (profile_id_1, profile_id_2)
--         -> every unordered pair has exactly one canonical row.
-- Matches are created ONLY from real mutual swipes by the app (matching phase);
-- created_by_system=false is the default and we never fabricate reciprocal
-- swipes. state/unmatched_at support the Safety phase (unmatch + block later
-- suppress/close matches — app logic).
CREATE TABLE IF NOT EXISTS matches (
  id                SERIAL PRIMARY KEY,
  profile_id_1      INTEGER REFERENCES dog_profiles(id),
  profile_id_2      INTEGER REFERENCES dog_profiles(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  state             TEXT DEFAULT 'active' CHECK (state IN ('active','unmatched')),
  unmatched_at      TIMESTAMPTZ,
  created_by_system BOOLEAN DEFAULT false,
  CONSTRAINT matches_profiles_unique UNIQUE (profile_id_1, profile_id_2),
  CONSTRAINT matches_profile_order_check CHECK (profile_id_1 < profile_id_2)
);

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_profile_id_1_profile_id_2_key;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_profiles_unique;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_profile_order_check;
ALTER TABLE matches ADD CONSTRAINT matches_profiles_unique UNIQUE (profile_id_1, profile_id_2);
ALTER TABLE matches ADD CONSTRAINT matches_profile_order_check CHECK (profile_id_1 < profile_id_2);
ALTER TABLE matches ADD COLUMN IF NOT EXISTS state TEXT DEFAULT 'active' CHECK (state IN ('active','unmatched'));
ALTER TABLE matches ADD COLUMN IF NOT EXISTS unmatched_at TIMESTAMPTZ;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS created_by_system BOOLEAN DEFAULT false;
-- Pair lookup is the unique constraint itself (matches_profiles_unique).

-- --- 6. rate_limits ----------------------------------------------------------
-- NO STATEMENTS — see header. The composite UNIQUE (action, key, window_start)
-- already exists in production; the phase brief's "three single-column uniques"
-- was a misreading of composite-constraint introspection output. The apply
-- session must still re-run the auth smoke to confirm 429 rate limiting.

-- --- 7. messaging ------------------------------------------------------------
-- Authorization is derivable from conversation_participants membership ONLY:
-- the app must never allow querying a conversation (or its messages) without
-- proving membership. sender_user_id CASCADE matches the documented account-
-- deletion policy (messages are deleted with the user). sender_profile_id is
-- optional dog-profile context and NULLs if the dog is deleted.
CREATE TABLE IF NOT EXISTS conversations (
  id              SERIAL PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  left_at         TIMESTAMPTZ,
  UNIQUE (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON conversation_participants(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id                SERIAL PRIMARY KEY,
  conversation_id   INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_profile_id INTEGER REFERENCES dog_profiles(id) ON DELETE SET NULL,
  body              TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  read_at           TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,
  moderation_state  TEXT DEFAULT 'visible' CHECK (moderation_state IN ('visible','hidden','removed'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at ON messages(conversation_id, created_at);

-- --- 8. providers / services -------------------------------------------------
-- rating DEFAULT 4.5 is DROPPED: no fabricated default. Existing seeded rows
-- keep their stored values; marking them is_demo happens in the DATA phase.
-- approval_status gates the Services marketplace ('approved' only). Market
-- fields (country/city/currency/timezone) support per-market configuration.
CREATE TABLE IF NOT EXISTS providers (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,
  description     TEXT NOT NULL,
  location        TEXT NOT NULL,
  image_url       TEXT,
  rating          NUMERIC,
  review_count    INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  owner_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected','suspended')),
  country         TEXT,
  city            TEXT,
  currency        TEXT,
  timezone        TEXT,
  is_demo         BOOLEAN DEFAULT false
);

ALTER TABLE providers ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected','suspended'));
ALTER TABLE providers ALTER COLUMN rating DROP DEFAULT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_providers_approval_status ON providers(approval_status);
CREATE INDEX IF NOT EXISTS idx_providers_city ON providers(city);

CREATE TABLE IF NOT EXISTS services (
  id               SERIAL PRIMARY KEY,
  provider_id      INTEGER REFERENCES providers(id),
  name             TEXT NOT NULL,
  price_cents      INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  currency         TEXT NOT NULL DEFAULT 'EUR',
  is_active        BOOLEAN DEFAULT true
);

ALTER TABLE services ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_services_provider_id ON services(provider_id);

-- --- 9. bookings + commission_configs ----------------------------------------
-- Monetary values are snapshotted AT BOOKING TIME (price_cents, currency,
-- platform_fee_rate) so historical reconciliation survives future config
-- changes; nothing is ever hard-coded (commission_configs holds rates).
-- customer_user_id is NULL until the booking phase backfills from
-- customer_email (documented in the safety doc). FKs on customer_user_id and
-- dog_id are ON DELETE SET NULL: bookings are retained business records and
-- must never block account/dog deletion.
CREATE TABLE IF NOT EXISTS bookings (
  id                      SERIAL PRIMARY KEY,
  provider_id             INTEGER REFERENCES providers(id),
  service_id              INTEGER REFERENCES services(id),
  customer_name           TEXT NOT NULL,
  customer_email          TEXT NOT NULL,
  booking_date            DATE NOT NULL,
  start_time              TIME NOT NULL,
  status                  TEXT DEFAULT 'confirmed',
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  customer_user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  dog_id                  INTEGER REFERENCES dog_profiles(id) ON DELETE SET NULL,
  end_time                TIME,
  price_cents             INTEGER,
  currency                TEXT NOT NULL DEFAULT 'EUR',
  platform_fee_cents      INTEGER,
  platform_fee_rate       NUMERIC,
  payment_status          TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','pending','paid','refunded','failed')),
  stripe_payment_intent_id TEXT,
  cancellation_status     TEXT DEFAULT 'none' CHECK (cancellation_status IN ('none','requested','cancelled_by_customer','cancelled_by_provider')),
  cancelled_at            TIMESTAMPTZ,
  refund_state            TEXT DEFAULT 'none' CHECK (refund_state IN ('none','pending','refunded','failed')),
  refund_reference        TEXT,
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dog_id INTEGER REFERENCES dog_profiles(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_cents INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS platform_fee_rate NUMERIC;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','pending','paid','refunded','failed'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_status TEXT DEFAULT 'none' CHECK (cancellation_status IN ('none','requested','cancelled_by_customer','cancelled_by_provider'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_state TEXT DEFAULT 'none' CHECK (refund_state IN ('none','pending','refunded','failed'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_reference TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_bookings_provider_id ON bookings(provider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_customer_user_id ON bookings(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

-- Commission configuration lives here (market-scoped, versioned by active_from);
-- rate is a decimal fraction (0.12 = 12%).
CREATE TABLE IF NOT EXISTS commission_configs (
  id          SERIAL PRIMARY KEY,
  market      TEXT NOT NULL,
  category    TEXT,
  rate        NUMERIC NOT NULL CHECK (rate >= 0 AND rate <= 1),
  active_from DATE NOT NULL,
  active_to   DATE
);

-- --- 10. safety / moderation -------------------------------------------------
-- blocks: one-way user-to-user suppression; the Safety phase also uses blocks
-- to suppress/close matches between the parties (schema note — logic there).
-- reports: moderation queue; audit_log (from 001) records every admin action.
CREATE TABLE IF NOT EXISTS blocks (
  id              SERIAL PRIMARY KEY,
  blocker_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (blocker_user_id, blocked_user_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id               SERIAL PRIMARY KEY,
  reporter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type      TEXT NOT NULL CHECK (target_type IN ('user','dog','message','provider','booking')),
  target_id        INTEGER NOT NULL,
  category         TEXT NOT NULL,
  details          TEXT,
  status           TEXT DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  admin_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  admin_action     TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_target_type_target_id ON reports(target_type, target_id);

-- --- 11. demo data markers ---------------------------------------------------
-- Every demo-seeded entity carries an explicit is_demo marker. App logic must
-- NEVER create real swipes/matches/messages/bookings FROM demo entities
-- (owner requirement — enforced in the matching/messaging/bookings phases).
-- providers.is_demo was added in section 8. Existing seeded rows get
-- is_demo=true in the DATA phase, not here.
-- Full production-equivalent shapes (no-op where the tables exist; keeps the
-- scratch database complete):
CREATE TABLE IF NOT EXISTS breeders (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  location            TEXT NOT NULL,
  description         TEXT NOT NULL,
  breed_specialty     TEXT NOT NULL,
  verification_status TEXT DEFAULT 'pending',
  membership_tier     TEXT DEFAULT 'free',
  years_experience    INTEGER DEFAULT 0,
  health_testing      TEXT,
  image_url           TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  is_demo             BOOLEAN DEFAULT false
);
CREATE TABLE IF NOT EXISTS shelters (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  location    TEXT NOT NULL,
  description TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  website     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  is_demo     BOOLEAN DEFAULT false
);
CREATE TABLE IF NOT EXISTS venues (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  address     TEXT NOT NULL,
  city        TEXT NOT NULL,
  lat         NUMERIC NOT NULL,
  lng         NUMERIC NOT NULL,
  description TEXT,
  dog_features TEXT[],
  rating      NUMERIC,
  image_url   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  is_demo     BOOLEAN DEFAULT false
);
ALTER TABLE breeders ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
ALTER TABLE shelters ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
-- Same honesty fix as providers.rating: drop the fabricated rating default.
ALTER TABLE venues ALTER COLUMN rating DROP DEFAULT;

-- --- 12. subscriptions hygiene -----------------------------------------------
-- plan DEFAULT 'pawnder-plus' -> 'none': no Plus product is sold; the column
-- must never claim a subscription. user_id is NULL until the Plus phase
-- backfills it from email.
CREATE TABLE IF NOT EXISTS subscriptions (
  id                SERIAL PRIMARY KEY,
  email             TEXT UNIQUE NOT NULL,
  plan              TEXT NOT NULL DEFAULT 'none',
  status            TEXT NOT NULL DEFAULT 'active',
  stripe_session_id TEXT,
  user_id           INTEGER REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscriptions ALTER COLUMN plan SET DEFAULT 'none';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
