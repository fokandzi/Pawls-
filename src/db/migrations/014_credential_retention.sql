-- 014 credential retention (2026-11-27) — weak-credential remediation, code half.
--
-- Indexes only. The data changes that go with this release are NOT SQL:
--   1. legacy bare SHA-256 digests are wrapped by
--      scripts/security/wrap-legacy-password-hashes.ts --apply (scrypt needs the
--      application, not the database);
--   2. raw token values already stored in mail_log were redacted and live
--      tokens expired by migration 011.
-- This migration just makes the two retention sweeps cheap:
--   mail_log(created_at)   — purgeMailLog(), 30-day retention
--   email_tokens(expires_at) already indexed by 011
--
-- Deploy order: this migration runs BEFORE the code that refuses bare digests
-- (docs/WEAK-CREDENTIAL-REMEDIATION.md).
--
-- Idempotent. Rollback: DROP INDEX IF EXISTS idx_mail_log_created_at;
-- Runner note: statements are split on semicolons, so none appears in a literal.

CREATE INDEX IF NOT EXISTS idx_mail_log_created_at ON mail_log(created_at);

CREATE INDEX IF NOT EXISTS idx_email_tokens_user_kind ON email_tokens(user_id, kind);
