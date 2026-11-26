-- Schema drift fix: dog_profiles.email
--
-- Production has dog_profiles.email only because the app creates it at runtime
-- (src/db/schema.ts, ensure*: ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS
-- email TEXT). No migration created it, so a database built from migrations
-- alone (a fresh Neon preview branch, the hermetic test DB) lacked it, and
-- deleteUserAccount() failed: it matches legacy dogs with
-- `user_id IS NULL AND lower(email) = lower(<account email>)`.
--
-- Identical definition to the runtime DDL (nullable TEXT, no default, no
-- index): a no-op on production, where the column already exists.
-- Idempotent. Rollback: none needed on production (no-op there); on a
-- migrations-only database: ALTER TABLE dog_profiles DROP COLUMN IF EXISTS email

ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS email TEXT;
