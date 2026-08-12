-- ============================================================================
-- Pawls migration 001 — P0 Auth Foundation (2026-08-12)
-- Additive + idempotent. Safe to run multiple times. Records into
-- schema_migrations (created by the runner in scripts/migrate.ts).
--
-- APPLY:   bun run db:migrate
-- TEST:    bun run db:migrate --scratch   (applies to a throwaway database)
--
-- DOWN (documented for manual rollback; never auto-executed):
--   ALTER TABLE dog_profiles DROP COLUMN IF EXISTS user_id;
--   DROP TABLE IF EXISTS mail_log, audit_log, rate_limits, email_tokens, sessions;
--   ALTER TABLE users DROP COLUMN IF EXISTS updated_at;
--   ALTER TABLE users DROP COLUMN IF EXISTS role;
--   ALTER TABLE users DROP COLUMN IF EXISTS is_test;
--   ALTER TABLE users DROP COLUMN IF EXISTS approx_lng;
--   ALTER TABLE users DROP COLUMN IF EXISTS approx_lat;
--   ALTER TABLE users DROP COLUMN IF EXISTS timezone;
--   ALTER TABLE users DROP COLUMN IF EXISTS city;
--   ALTER TABLE users DROP COLUMN IF EXISTS country;
--   ALTER TABLE users DROP COLUMN IF EXISTS preferred_language;
--   ALTER TABLE users DROP COLUMN IF EXISTS date_of_birth;
--   ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;
-- ============================================================================

-- --- users -------------------------------------------------------------------
-- Baseline full shape (no-op on existing prod table, which was created inline
-- with id/email/name/password_hash/created_at). password_hash is kept for
-- legacy rows; legacy sha256 hashes are transparently upgraded to scrypt on
-- next successful login. approx_lat/approx_lng are NEVER returned publicly.
CREATE TABLE IF NOT EXISTS users (
  id                 SERIAL PRIMARY KEY,
  email              TEXT UNIQUE NOT NULL,
  name               TEXT NOT NULL,
  password_hash      TEXT,
  email_verified_at  TIMESTAMPTZ,
  date_of_birth      DATE,
  preferred_language TEXT DEFAULT 'fr',
  country            TEXT,
  city               TEXT,
  timezone           TEXT,
  approx_lat         DOUBLE PRECISION,
  approx_lng         DOUBLE PRECISION,
  is_test            BOOLEAN DEFAULT false,
  role               TEXT DEFAULT 'user',
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'fr';
ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approx_lat DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approx_lng DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
-- Backfill updated_at for legacy rows (created_at already populated).
UPDATE users SET updated_at = created_at WHERE updated_at IS NULL AND created_at IS NOT NULL;

-- --- sessions ----------------------------------------------------------------
-- Opaque 32-byte tokens; only SHA-256(token) is stored (token_hash). Lookup is
-- ALWAYS from the cookie → DB; never from body/query params.
CREATE TABLE IF NOT EXISTS sessions (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT UNIQUE NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  ip           TEXT,
  user_agent   TEXT,
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- --- email_tokens ------------------------------------------------------------
-- Single-use verification/reset tokens. Only SHA-256(token) is stored.
CREATE TABLE IF NOT EXISTS email_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('verify', 'reset')),
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user_id ON email_tokens(user_id);

-- --- rate_limits -------------------------------------------------------------
-- DB-backed rate limiting (works across serverless instances).
CREATE TABLE IF NOT EXISTS rate_limits (
  id           SERIAL PRIMARY KEY,
  action       TEXT NOT NULL,
  key          TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INT NOT NULL DEFAULT 1,
  UNIQUE (action, key, window_start)
);

-- --- dog_profiles.user_id -----------------------------------------------------
-- Additive: legacy demo/test rows keep user_id NULL (never shown publicly).
ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_dog_profiles_user_id ON dog_profiles(user_id);

-- --- audit_log ----------------------------------------------------------------
-- Server-side audit trail for security-relevant actions (account deletion etc.).
CREATE TABLE IF NOT EXISTS audit_log (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER,
  action     TEXT NOT NULL,
  details    JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- --- mail_log -----------------------------------------------------------------
-- Records every email produced in TEST/DEV mode (never sent). mode='test'
-- entries are visibly distinguishable from real production sends.
CREATE TABLE IF NOT EXISTS mail_log (
  id         SERIAL PRIMARY KEY,
  to         TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  mode       TEXT NOT NULL DEFAULT 'test',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
