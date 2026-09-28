-- 007 — mail_log delivery status (honest delivery accounting)
--
-- Context: the launch audit found that mail_log recorded only `mode`
-- ('test' | 'prod') and that the PROD path recorded nothing at all. A mail row
-- could therefore not answer "was this actually delivered?".
--
-- After this migration every outbound attempt carries an explicit status:
--   'test'   → test mode, never sent (dev / no RESEND_API_KEY)
--   'sent'   → the provider (Resend) accepted the message; provider_id is set
--   'failed' → the attempt FAILED; `error` holds the provider detail
--
-- Additive and idempotent — no data is rewritten or deleted. Mirrored in
-- src/lib/auth/ensure.ts so the pre-SSR auth handlers work before migrations.
--
-- Down (manual, never auto-executed):
--   ALTER TABLE mail_log DROP COLUMN IF EXISTS status;
--   ALTER TABLE mail_log DROP COLUMN IF EXISTS error;
--   ALTER TABLE mail_log DROP COLUMN IF EXISTS provider_id;

ALTER TABLE mail_log ADD COLUMN IF NOT EXISTS status TEXT;

ALTER TABLE mail_log ADD COLUMN IF NOT EXISTS error TEXT;

ALTER TABLE mail_log ADD COLUMN IF NOT EXISTS provider_id TEXT;
