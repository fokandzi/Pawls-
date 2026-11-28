# Weak-credential remediation — code half, deploy order

Status: code complete on `integration/claude-hardening`, **not deployed**. No production contact
was made while preparing it. Plan item 4 ("weak-credential remediation").

## What this closes

1. **Bare unsalted SHA-256 digests no longer authenticate.** Five legacy accounts
   (`users.id` 2, 3, 5, 8, 9 on the production copy) still held a 64-hex digest. Login now accepts
   only `scrypt$…` and `sha256-scrypt$…`; a bare digest is refused with the normal 401 and a
   server-side warning that names the account id only.
2. **No raw credentials in `mail_log`, logs or `rate_limits.key`.**
   - `mail_log.body` is written through `redactTokenLinks()`; migration 011 already redacted the
     stored history and expired every token that had ever been stored in the clear.
   - Rate-limit keys are now `sha256(email)` (login, login-account, reset-request,
     resend-verification-request) and `sha256(token)` (verify/reset), so the table holds no
     address and no token.
   - The only place a raw link can still be printed is a developer's own machine, behind
     `PAWLS_DEV_MAIL_LINKS=1` and refused when `NODE_ENV=production` or `VERCEL_ENV` is set.
3. **Retention is enforced, not just documented.**
   - `email_tokens`: expired or used tokens are deleted after **7 days**
     (`purgeExpiredEmailTokens`). Runs opportunistically at most once an hour from
     `issueEmailToken`, and on demand via `scripts/security/purge-expired-email-tokens.ts [days]`.
   - `mail_log`: delivery records are deleted after **30 days** (`purgeMailLog`,
     `MAIL_LOG_RETENTION_DAYS`). Runs opportunistically at most once an hour from `sendMail`, and
     on demand via `scripts/security/purge-mail-log.ts [days]`.
   - Both sweeps are idempotent and never fail the flow that triggered them.

## Files

- `src/lib/auth/hash.ts` — `verifyPassword` refuses a bare digest; wrapping + `needsRehash` unchanged.
- `src/auth-handler.ts` — hashed rate-limit keys; refusal warning (id only, no PII).
- `src/lib/auth/mailer.ts` — `MAIL_LOG_RETENTION_DAYS`, `purgeMailLog`, hourly sweep.
- `src/lib/auth/email-tokens.ts` — `EMAIL_TOKEN_RETENTION_DAYS`, hourly sweep on issue.
- `src/db/migrations/014_credential_retention.sql` — indexes `mail_log(created_at)` and
  `email_tokens(user_id, kind)`.
- `scripts/security/purge-mail-log.ts` — retention sweep entry point.
- `src/lib/auth/security-hardening.test.ts` — the bare-digest refusal, hashed keys and the
  mail_log retention are asserted hermetically (32 pass / 0 fail on the launch line).

## Deploy order — MIGRATION AND WRAP BEFORE CODE

The code refuses bare digests. Deploying it before the digests are wrapped locks those five
accounts out. Do these in order, on production, with the owner's approval:

1. **Snapshot.** Neon branch or point-in-time restore point of production (`br-patient-water-zalb0ktx`)
   before anything writes. Record its id.
2. **Migrations** `bun run db:migrate` (011 → 012 → 013 → 014). 011 is what redacts stored mail and
   expires tokens; 014 only adds indexes.
3. **Wrap the legacy digests** (no password needed, no account reset):
   ```
   DATABASE_URL=<production url> bun run scripts/security/wrap-legacy-password-hashes.ts
   DATABASE_URL=<production url> bun run scripts/security/wrap-legacy-password-hashes.ts --apply
   ```
   Expected on production: `{"legacyFound":5,"wrapped":5,"skippedConcurrent":0,"applied":true}`.
   The script reports counts only — never ids, emails or hash material.
4. **Verify zero bare digests** before touching the code:
   ```sql
   SELECT count(*) FROM users WHERE password_hash ~ '^[0-9a-fA-F]{64}$';  -- must be 0
   ```
   If it is not 0, STOP: the accounts it counts would be refused by step 5.
5. **Deploy the code** (this commit).
6. **Purge the leftovers** once:
   ```
   DATABASE_URL=<production url> bun run scripts/security/purge-expired-email-tokens.ts
   DATABASE_URL=<production url> bun run scripts/security/purge-mail-log.ts
   ```
7. **Post-deploy checks**: each of the five accounts logs in with its existing password; a login
   with the wrong password is 401; `SELECT key FROM rate_limits WHERE key LIKE '%@%'` returns no
   rows; `SELECT body FROM mail_log WHERE body ~ 'token=[A-Za-z0-9_-]'` returns no rows.

### Why this order is safe to reverse

Wrapping is backward compatible: the **old** code already accepts `sha256-scrypt$…`, so if the
deploy has to be rolled back after step 3, the previous build still logs all five accounts in.
Nothing about the wrap is undone by a rollback, and nothing needs to be: the wrapped form is
strictly stronger. Rolling back after step 5 re-opens the bare-digest path until the next deploy —
that is the one thing not to leave in place.

## Evidence (throwaway Neon branch, no production contact)

Branch `weakcred-proof2` (`br-delicate-sun-za5p0r4c`, copy of production), 29 checks / 0 fail:

- five legacy bare digests present (ids 2,3,5,8,9) → wrap script `legacyFound:6, wrapped:6`
  (the five plus one known-password fixture) → zero bare digests left, user count unchanged;
- for each of the five, the stored wrapped hash was recomputed independently as
  `scrypt(original 64-hex digest, stored salt, stored N/r/p)` and matched — i.e. exactly the check
  the login path performs — so the owners' existing passwords still match and **no account was
  reset** (no password rewritten to a new secret, no reset token issued);
- a legacy-shaped account with a **known** password logs in (302 → `/match`, session cookie) and is
  upgraded to plain scrypt; the same account stored **bare** is refused (401, no cookie, row
  unchanged), and logs in again the moment it is wrapped;
- `mail_log` stores `token=[redacted]`; rate-limit keys hold no address; token purge deleted the
  expired + used tokens and kept the live one, twice in a row (idempotent); a mail_log row past 30
  days was deleted.

The five accounts' own plaintext passwords are not held anywhere in this repository, so their login
is proven by digest equivalence (above) plus the end-to-end login of the known-password legacy
fixture, rather than by typing each owner's password.

## Not covered here

- Password reset as the fallback for a still-bare account is unproven end to end: `RESEND_API_KEY`
  is absent, so no reset email can leave the building (technical release blocker A).
- The five accounts' per-account lockout (`login-account`, 20 / 15 min) is unchanged by this work.
