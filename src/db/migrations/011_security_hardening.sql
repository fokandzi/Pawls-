-- Pawls security hardening (parallel Claude branch hardening/claude-parallel-security)
--
-- 011 (not 010): 010 is taken by fix/breeder-subscription-cancellation, which
-- is not merged yet. scripts/migrate.ts tracks versions by FILENAME, so the
-- gap is harmless and either branch can land first.
--
-- 1. mail_log.body held the full outgoing email, including the raw
--    ?token=... of every verification and password-reset link. A verify link
--    signs its holder in. Redact every stored token value in place (the code on
--    this branch stores redacted bodies from now on). Already-redacted values
--    start with "[" and are not matched again.
-- 2. Every token whose raw value was ever stored above is treated as exposed:
--    all currently-valid, unused tokens are expired now. Impact: a user holding
--    a pending link (verify: 24 h, reset: 1 h) gets "link invalid" and requests
--    a new one. No account, password or session is changed.
-- 3. Index for the expired-token cleanup (purgeExpiredEmailTokens).
--
-- Idempotent: re-running redacts/expires nothing new.
-- Rollback: none for 1-2 (the removed values were credentials and must not be
-- restored). For 3: DROP INDEX IF EXISTS idx_email_tokens_expires_at
-- Runner note: statements are split on semicolons, so none appears in a literal.

UPDATE mail_log
SET body = regexp_replace(body, '([?&]token=)[^&[:space:]"''<>\[][^&[:space:]"''<>]*', '\1[redacted]', 'g')
WHERE body ~ '[?&]token=[^&[:space:]"''<>\[]';

UPDATE email_tokens SET expires_at = NOW()
WHERE used_at IS NULL AND expires_at > NOW();

CREATE INDEX IF NOT EXISTS idx_email_tokens_expires_at ON email_tokens(expires_at);
