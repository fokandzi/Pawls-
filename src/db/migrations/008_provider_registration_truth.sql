-- ============================================================================
-- Pawls migration 008 — Provider registration truth + minimum approval workflow
-- (P1 batch C, 2026-09-28 audit remediation). Additive + idempotent. Safe to
-- run multiple times. Recorded in schema_migrations by scripts/migrate.ts.
--
-- APPLY:   bun run db:migrate
-- TEST:    bun run db:migrate --scratch   (applies to a throwaway database)
--
-- SCOPE:
--   1. Formalize the provider contact columns. /book/register used to add
--      email/phone/website with ad-hoc runtime DDL on every request; this
--      migration makes them the canonical, versioned schema. No data rewritten.
--   2. Approval audit columns approved_at / approved_by — set ONLY by the
--      admin-only approve/reject endpoint (src/lib/provider-core.ts). Unowned
--      legacy rows (owner_user_id IS NULL) can never be approved and never get
--      these set (the workflow refuses them; this migration adds no approval).
--   3. Schema hygiene: no fabricated review data on a fresh environment. The
--      legacy safety-net runtime DDL (src/db/schema.ts) could re-introduce
--      `rating NUMERIC(3,2) DEFAULT 4.5` / `review_count INTEGER DEFAULT 0`;
--      the runtime DDL is fixed in code by this batch, and this migration
--      drops the remaining fabricated defaults on existing databases. Columns
--      stay NULLABLE and the shipped display already hides zero/NULL reviews.
--
-- Down (manual, never auto-executed):
--   ALTER TABLE providers DROP COLUMN IF EXISTS approved_by;
--   ALTER TABLE providers DROP COLUMN IF EXISTS approved_at;
--   ALTER TABLE providers DROP COLUMN IF EXISTS website;
--   ALTER TABLE providers DROP COLUMN IF EXISTS phone;
--   ALTER TABLE providers DROP COLUMN IF EXISTS email;
--   ALTER TABLE providers ALTER COLUMN review_count SET DEFAULT 0;
--   ALTER TABLE providers ALTER COLUMN rating SET DEFAULT 4.5;  -- NOT wanted
-- ============================================================================

-- --- 1. provider contact columns (canonical, not runtime-added) -------------
ALTER TABLE providers ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE providers ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE providers ADD COLUMN IF NOT EXISTS website TEXT;

-- --- 2. approval decision audit columns -------------------------------------
-- approved_at / approved_by record the admin decision on an owner-bound row.
-- They stay NULL for pending, rejected and unowned rows.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE providers ADD COLUMN IF NOT EXISTS approved_by INTEGER;

-- --- 3. no fabricated review data on a fresh environment --------------------
-- A provider has a rating/review_count ONLY when real reviews exist. Nothing
-- may invent one at INSERT time. Runtime DDL in src/db/schema.ts is fixed too.
ALTER TABLE providers ALTER COLUMN rating DROP DEFAULT;

ALTER TABLE providers ALTER COLUMN review_count DROP DEFAULT;
