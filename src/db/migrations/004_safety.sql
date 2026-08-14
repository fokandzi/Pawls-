-- ============================================================================
-- Pawls migration 004 — Safety/Admin (LAUNCH BLOCKER #8, 2026-08-14)
-- Additive + idempotent. Safe to run multiple times. Records into
-- schema_migrations (created by the runner in scripts/migrate.ts).
--
-- APPLY:   bun run db:migrate
-- TEST:    bun run db:migrate --scratch   (applies to a throwaway database)
--
-- NOTE ON NUMBERING: the delegation brief called this "003-safety", but
-- 003_match_unknown.sql already exists and is applied in production, so the
-- next free version is 004. This file is the Safety/Admin migration.
--
-- SCOPE (everything else the Safety phase needs already exists from 001/002):
--   - blocks, reports, audit_log, messages.moderation_state, matches.state —
--     created by migrations 001/002 and REUSED as-is (no duplication).
--   - users.role — created by 001 with DEFAULT 'user'; 'admin' is the admin
--     marker and is ONLY ever set server-side (migration/ops), never by a
--     client and never self-grantable. This migration marks the owner's real
--     account (id 4, wealthprosperity7@gmail.com — the ONLY non-test user) as
--     admin via an explicit, documented UPDATE guarded by email so it can
--     never accidentally promote a different row.
--   - users.suspended_at / suspended_reason — new columns backing the admin
--     "suspend user" action. Enforcement lives in auth (session gate + login
--     gate), added in this phase.
--   - Indexes: reports by reporter (queue joins), blocks by blocked user
--     (blockedBetween hot path), audit_log by created_at (admin audit view).
--
-- DOWN (documented for manual rollback; never auto-executed):
--   ALTER TABLE users DROP COLUMN IF EXISTS suspended_at;
--   ALTER TABLE users DROP COLUMN IF EXISTS suspended_reason;
--   -- (owner admin flag: UPDATE users SET role='user' WHERE id=4; is the
--   --    documented rollback of the admin bootstrap below)
--   DROP INDEX IF EXISTS idx_reports_reporter_user_id;
--   DROP INDEX IF EXISTS idx_blocks_blocked_user_id;
--   DROP INDEX IF EXISTS idx_audit_log_created_at;
-- ============================================================================

-- --- 1. user suspensions (admin "suspend user" action) ----------------------
-- NULL = not suspended. Suspension is enforced at the auth gates (login
-- rejects with an honest message; existing sessions go inert via
-- getSessionUser returning null) — so a suspended account can neither log in
-- nor keep using any session.
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

-- --- 2. admin bootstrap (owner's real account) ------------------------------
-- The owner (wealthprosperity7@gmail.com, user id 4) is the ONLY non-test
-- user and the sole legitimate moderator today. Marking role='admin' here is
-- an explicit, auditable server-side step — there is NO runtime self-grant
-- path anywhere in the app. The email guard makes this idempotent and safe.
UPDATE users
SET role = 'admin', updated_at = NOW()
WHERE id = 4 AND email = 'wealthprosperity7@gmail.com' AND role <> 'admin';

-- --- 3. indexes for the safety hot paths ------------------------------------
CREATE INDEX IF NOT EXISTS idx_reports_reporter_user_id ON reports(reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked_user_id ON blocks(blocked_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
