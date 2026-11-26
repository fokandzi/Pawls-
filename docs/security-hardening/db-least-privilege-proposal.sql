-- PROPOSAL ONLY — NOT a migration, NOT executed anywhere. Do not place in
-- src/db/migrations/. Validate on a Neon branch first.
--
-- Goal: the web app connects as a DML-only role; schema changes run as a
-- separate migration role. RLS is NOT proposed: every query is server-side as
-- one role, and per-user isolation is enforced in application code.
--
-- PREREQUISITE (blocking): the app issues ~81 runtime DDL statements
-- (CREATE TABLE/INDEX IF NOT EXISTS, ALTER TABLE ADD COLUMN) from ensure.ts,
-- schema.ts, webhook-core.ts, iap-core.ts, provider-core.ts, booking-core.ts,
-- dog-profile-handler.ts. Under pawls_app these fail with "permission denied"
-- or "must be owner". Move them into migrations (or make them tolerate that
-- error) BEFORE switching DATABASE_URL to pawls_app.
--
-- Order:
--   1. On a Neon branch: run this file as the current owner role.
--   2. Point a preview at pawls_app; run the full journey; watch logs for
--      permission errors.
--   3. Production: same file, then swap Vercel DATABASE_URL to pawls_app
--      (keep the owner URL only for `bun run db:migrate`).
-- Rollback: swap DATABASE_URL back to the owner role; then
--   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM pawls_app
--   REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM pawls_app
--   DROP ROLE pawls_app
--
-- Neon: create the role with a password in the console/API (roles created in
-- SQL need a password set there to log in).

CREATE ROLE pawls_app LOGIN;
GRANT USAGE ON SCHEMA public TO pawls_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pawls_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pawls_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pawls_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO pawls_app;

-- Append-only audit trail: the app may write but never rewrite history.
REVOKE UPDATE, DELETE ON audit_log FROM pawls_app;
