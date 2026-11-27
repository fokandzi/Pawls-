-- Schema drift fix: breeders.email / breeders.phone
--
-- Both columns are written and read by the app:
--   registerBreeder (src/routes/breed.register.tsx) inserts into
--     `breeders (name, email, …, phone)` and de-duplicates on `WHERE email = …`;
--   createMembershipCheckout (src/db/payments.ts) proves ownership with
--     `WHERE id = … AND lower(email) = lower(…)`.
-- No migration created either column (002_schema_foundation.sql's CREATE TABLE
-- breeders stops at is_demo) and no runtime DDL adds them, so on a database
-- built from migrations alone — a fresh Neon branch, the hermetic PGlite DB —
-- both server functions failed with `column "email" does not exist`.
--
-- Nullable TEXT with no default and no unique index, matching the columns
-- production already carries (the duplicate-email rule is enforced in the
-- handler, so a unique index here would change behaviour, not just schema).
-- A no-op on any database that already has them.
-- Idempotent. Rollback: ALTER TABLE breeders DROP COLUMN IF EXISTS email;
--                                     ALTER TABLE breeders DROP COLUMN IF EXISTS phone;

ALTER TABLE breeders ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE breeders ADD COLUMN IF NOT EXISTS phone TEXT;
