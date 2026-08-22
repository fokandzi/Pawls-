-- ============================================================================
-- Pawls migration 005 — Campaign attribution for /join (P2, 2026-08-21)
-- Additive + idempotent. Safe to run multiple times. Records into
-- schema_migrations (created by the runner in scripts/migrate.ts).
--
-- APPLY:   bun run db:migrate
-- TEST:    bun run db:migrate --scratch   (applies to a throwaway database)
--
-- SCOPE:
--   - acquisition_signups: one row per user capturing which campaign/source
--     brought them, persisted at registration time.
--   - The table is metadata only — it grants NO entitlement. It is written
--     server-side from a verified HMAC-signed token; forged values are dropped.
--   - A safety-net copy also lives in ensureAuthTables (CREATE TABLE IF NOT
--     EXISTS) so pre-SSR handlers can always write it; this migration is the
--     canonical, versioned definition.
-- ============================================================================

CREATE TABLE IF NOT EXISTS acquisition_signups (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign TEXT NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_acquisition_signups_user
  ON acquisition_signups(user_id);
