# Security hardening — findings (parallel Claude, 2026-10-28)

Branch `hardening/claude-parallel-security`, based on `origin/main` = `bfc1eef`.
Evidence is redacted: no secret values, raw tokens, hashes, emails or ids.

**Access limits.** I had no access to the production database, the Vercel
dashboard (the local CLI token is expired), or the cto.new sandbox
(`/home/team/shared/site`, which holds `.env`). Counts below that need the
database are **UNVERIFIED**. Run `scripts/security/readonly-security-audit.ts`
against a Neon branch to get them; it prints counts only.

Status legend:
- **CONFIRMED**: proven by code or live HTTP evidence.
- **PARTIAL**: mechanism confirmed, number or scope unverified.
- **NOT CONFIRMED**: looked for and not found where I could look.

## Summary

| # | Finding | Status | Severity | Fixed on branch |
|---|---|---|---|---|
| F1 | Internal artifacts publicly served on pawls.club | CONFIRMED (live) | High | n/a: a deploy/owner action |
| F2 | Raw verify/reset links stored in `mail_log.body` and console logs | CONFIRMED (code), count PARTIAL | High | yes |
| F3 | Deleted provider keeps contact data; booking mail still sent to it | CONFIRMED (code) | High (GDPR) | yes |
| F4 | `bun test` writes to the shared dev/prod database | CONFIRMED (code) | High (ops) | hermetic runner added; legacy suites untouched |
| F5 | Rate-limit gaps; 5/h vs 10/h discrepancy | CONFIRMED (code) | Medium | yes |
| F6 | Login limit bypassable by rotating IPs | CONFIRMED (code) | Medium | yes |
| F7 | Legacy unsalted SHA-256 passwords | PARTIAL (format supported; count of 5 unverified) | Medium | yes (wrap + upgrade) |
| F8 | Single DB role, no RLS | PARTIAL (server-only architecture confirmed; role/ownership unverified) | Medium | assessment + proposal only |
| F9 | Live Stripe secret in the repository | NOT CONFIRMED in git | Unknown until located | n/a |
| F10 | Resend / Uploadthing not configured; login fails open | CONFIRMED (code + Phase 2B notes) | High (launch) | n/a: owner action |
| F11 | Schema drift: `dog_profiles.email` exists only via runtime DDL | CONFIRMED (hermetic DB) | Medium | yes (migration 012) |
| F13 | Raw verify/reset token stored in `rate_limits.key` (≤48 h) | CONFIRMED (code, found in self-review) | Medium | yes (`a70df02`) |
| F12 | Other deletion and retention gaps | CONFIRMED (code) | Medium | reported, not changed |

## Classification (2026-10-28 revision)

| Kind | Items |
|---|---|
| **Observed facts** | F1 (live HTTP 200s on 2026-10-27, HEAD only); F2/F13 mechanism (code); F3, F5, F6, F11 (code + hermetic tests); F4 (code); F8 architecture (code); F9 absence in git; F10 gate behaviour (code) |
| **Hypotheses (unverified)** | The "125" are `mail_log` rows; the "5" legacy rows exist; production runs `cb6b232` (consistent with `/health` 404, deployment id not read); the runtime DB role owns the tables (F8); Vercel request logs keep token query strings (review §3); the Stripe key sits in the sandbox `.env` or Vercel env (F9) |
| **Recommended hardening (not blockers)** | F8 least-privilege role + optional FORCEd RLS; `Referrer-Policy: no-referrer` on token pages; token exchange off the query string; resend-link form on the unverified-login page; provider `location` and `audit_log` email retention decisions |
| **Confirmed launch blockers** | Production not on the fixed code (nothing deployed); F1 artifacts still public (incl. old deployment URLs); F10 no email delivery, so login fails open, and enabling it locks out all existing users without a discovered resend path; Uploadthing not configured; F9 key location unknown, rotation pending; Vercel secrets not Sensitive (O3); this branch not validated under Bun or on a Neon branch; deleted provider's future bookings not cancelled (F12) |

---

## F1: internal artifacts publicly served (live)

These are HEAD requests to `https://pawls.club` on 2026-10-27. Nothing was downloaded.

| Path | Status | Size |
|---|---|---|
| `/pawls_demo_assets_COMPLETE.zip` | 200 `application/zip` | 4,910,473 B |
| `/pawls_v3a_REVIEW.mp4` | 200 | 1,399,170 B |
| `/pawls_v3a_REVIEW_contactsheet.jpg` | 200 | |
| `/demo_dog_sushi.jpg` (and siblings) | 200 | |
| `/health` | 404 | |

- **Live code is pre-Phase-2B.** `/health` returning 404 is consistent with production still running `cb6b232`.
- **The files were never in git.** They were untracked sandbox files bundled by `go-live`. The `.gitignore` in `bfc1eef` says the zip contains "test emails + DB ids".
- **Redeploying is not the whole fix.** It removes the files from the new production deployment only. Older immutable Vercel deployment URLs (`*.vercel.app`) keep serving them until those deployments are deleted or protected. That is an owner/CTO action (see the integration doc).

## F2: email-token links stored in plaintext

- **`email_tokens` is already safe.** It stores only `sha256(token)` (`001_auth_foundation.sql:80`, `auth-handler.ts` at `bfc1eef` lines 128 and 633).
- **The plaintext copy is in `mail_log`.** `sendMail()` writes the whole message, link included, into `mail_log.body` in both test and prod mode. In test mode it also `console.log`s the body (`mailer.ts` at `bfc1eef`). Test mode is every environment today: there is no `RESEND_API_KEY`.
- **This is consistent with the "125 plaintext records".** They are most likely `mail_log` rows, not `email_tokens` rows. The count is UNVERIFIED; the audit script reports it, split by test/prod.
- **Impact:**
  - **Reset link:** password takeover within 1 h.
  - **Verify link:** signs the holder in (`handleVerifyEmail` creates a session) within 24 h.
  - **Exposure:** anyone with DB read access, or with Vercel log access in test mode.
- **Flows:**
  - **`verify`:** used by register, duplicate-register and resend.
  - **`reset`:** used by forgot-password.
  - **No passwordless or magic-link login exists.** The verify link is the closest equivalent, because it logs the user in.
- **Fix:**
  - **Redaction:** bodies are stored redacted, and the console is redacted too, except on a developer machine with `PAWLS_DEV_MAIL_LINKS=1`, never on Vercel.
  - **Atomic use:** token consumption is one conditional `UPDATE` covering hash, kind, unused and unexpired.
  - **Link invalidation:** issuing a new reset link expires older ones, and using any token expires its siblings.
  - **Cleanup:** `purgeExpiredEmailTokens()` plus a script, both idempotent.
  - **Migration 011:** redacts stored links in place, and expires every live token, since their raw values were exposed. Users with a pending link must request a new one; no account, password or session changes.

## F3: account deletion leaves provider PII

- **Public pages are not the leak on `main`.** `/book` and `/book/$providerId` require a live, non-test owner and never select email or phone. A deleted owner's listing therefore disappears from them, because `owner_user_id` is `ON DELETE SET NULL`. The CTO's real-supply gating did that work.
- **What was still wrong at `bfc1eef`:**
  - **Contact data kept:** the provider row kept `email`, `phone`, `website`, `image_url` and the free-text `description`.
  - **Mail still sent:** `providerContact()` in `booking-emails.ts` kept mailing booking notifications to the retained `providers.email` of an ownerless listing.
  - **Booking anonymisation incomplete:** it matched only on `customer_email`, not `customer_user_id`.
  - **`mail_log` kept the user's address and bodies.**
  - **Production is older still.** It runs `cb6b232`, which predates the batch C/D gating; the public surface there was not re-verified.
- **Fix:** see `src/lib/auth/deletion.ts`. The listing name is retained for counterparties' booking history, and everything else that reaches the person is cleared. The listing is set to `suspended` and its services are deactivated. Ownerless listings are never mailed. Responses are already `Cache-Control: no-store` (`vercel-entry.ts:251`), so there is no cached copy.
- **Legitimate retention, unchanged:**
  - **Bookings:** kept, anonymised.
  - **Payments:** kept.
  - **`audit_log`:** kept.
  - **Provider name:** kept on the retained listing.

## F4: tests write to the production database

`src/db/{deletion,payments,iap-core,webhook-core}.test.ts` force-load `.env`
(override) and run against the "real dev Neon database". SITE.md says
"One database serves both the preview and the live site."
- **Also on the same server:** `scripts/migrate.ts --scratch` runs `CREATE DATABASE` on whatever server `DATABASE_URL` points at, which in the sandbox is production.
- **Added:**
  - **Runner:** `scripts/hermetic-test/run.mjs` scrubs env, blocks fetch, redirects `src/db.ts` to PGlite, and refuses `.env` suites.
  - **Hermetic database:** `src/test-support/pglite-db.ts`.
- **Left alone:** the legacy suites are CTO-owned. They should only ever run with a Neon-branch URL.

## F5: abuse controls

- **Unregistered actions fall back to 5/hour.** `rateLimit()` silently applies 5/hour to any action not listed in `WINDOWS`/`LIMITS`.
- **That causes the discrepancy.** `block` and `unmatch` were unlisted, and `unblock` shared the `unmatch` bucket, so all three ran at 5/hour while `safety-api-handler.ts` documented 10/hour. Intended behaviour (10/hour, per user, per action) is now registered and tested.
- **Message send, conversation start and booking create had no limit.** New limits:

  | Action | Limit |
  |---|---|
  | `message-send` | 60 per 10 min per user |
  | `conversation-start` | 20 per hour |
  | `booking-create` | 10 per hour |

- **Topology:** limits are DB-backed (`rate_limits`), so they work across Vercel instances. CSRF and authorization still run first.
- **Residual risks:**
  - **Fails open:** the limiter allows requests when the DB errors (existing design).
  - **Trusted IP header:** `clientIp()` trusts the first `x-forwarded-for` value. Vercel sets it, but the self-hosted `serve.ts` path would accept a spoofed one.

## F6: login guessing across IPs

- **Gap:** the `login` key is `email|IP`, so each new IP got a fresh 5 attempts.
- **Added:** `login-account`, 20 per 15 min per email.
- **Trade-off:** a flood can make that account wait out the window. That's a lockout, but a bounded one.

## F7: legacy SHA-256 passwords

- **Supported and upgraded on login.** `hash.ts` supports bare unsalted SHA-256 hex, and the login handler upgrades it to scrypt on a successful sign-in.
- **The gap is dormant accounts.** They keep a fast, unsalted digest indefinitely.
- **The count of five is UNVERIFIED.** The audit script reports it.
- **Fix: wrap now, upgrade on login.**
  - **Format:** `sha256-scrypt$…` = `scrypt(sha256hex(password))`.
  - **Offline wrap:** `scripts/security/wrap-legacy-password-hashes.ts` (dry run first, compare-and-swap, counts only) converts each digest without the password and without cracking anything.
  - **On login:** any legacy, wrapped or weak-parameter hash is re-hashed with scrypt, also compare-and-swap. Modern rows are untouched.
  - **Password reset still works** and always writes a fresh scrypt hash.

## F8: database isolation (architecture-specific assessment)

**Observed facts (repository; nothing measured on the database):**
- Every query is server-side through `src/db.ts`: the Neon HTTP driver with a single `DATABASE_URL`. The only other `neon(` callers are `src/db/production-seed.ts` and `scripts/` (CLI only).
- No client-side database path exists. There is no Supabase client, PostgREST or Neon Data API, no `VITE_`-exposed connection string, and no browser import of `src/db.ts`.
- The repository contains no `CREATE ROLE`, `GRANT`, `ENABLE ROW LEVEL SECURITY` or `CREATE POLICY`.
- Per-user isolation lives in application code: session lookup (`requireUser`, `getSessionUser`) plus `WHERE owner_user_id / user_id = <session id>` predicates, and ownership checks in `*-core.ts`.
- The app runs about 81 DDL statements at request time across 7 files (`ensure.ts` 26, `schema.ts` 31, `webhook-core.ts` 8, `provider-core.ts` 5, `dog-profile-handler.ts` 5, `booking-core.ts` 3, `iap-core.ts` 3). The runtime role therefore must be able to create and alter tables.

**Hypotheses (unverified; need the read-only audit on a Neon branch):**
- The single login role is the Neon project owner role (`neondb_owner` or similar) and owns the tables. The audit script counts login roles and RLS-enabled tables; it does not yet report table ownership.
- If that holds: Postgres exempts table owners from RLS unless `FORCE ROW LEVEL SECURITY` is set. Enabling RLS without FORCE would have **no effect** on the app's queries. With FORCE, every query would need a per-request user context (e.g. `SET app.user_id`), which the stateless Neon HTTP driver only supports inside an explicit transaction per request.

**What RLS would and would not add here:**
- **It would add:** defence-in-depth against a missed ownership predicate (an IDOR bug in app code). That needs FORCEd RLS plus per-request `SET LOCAL app.user_id` inside a transaction, plus policies for every user-scoped table (`dog_profiles`, `bookings`, `conversations`, `messages`, `conversation_participants`, `blocks`, `reports`, `subscriptions`, `providers`, `services`). That's a substantial refactor of every query path.
- **It would not add:** protection against a leaked `DATABASE_URL`. An attacker using the owner credential bypasses RLS, or can disable it. With no client database API, there is no "anon key" exposure for RLS to contain.
- **Assessment:** valuable later as a second layer for IDOR, but costly and not the first control. A least-privilege runtime role reduces the impact of a leaked credential (no DDL, no `DROP`, no `audit_log` rewrite) and is cheaper. Neither is proven by enabling a flag; each must be validated by queries that are expected to fail.

**Recommended hardening (ordered; none executed):**
1. Run `readonly-security-audit.ts` on a Neon branch, and add a table-ownership query (`pg_tables.tableowner`) to confirm the hypotheses above.
2. Move runtime DDL into migrations (prerequisite for 3).
3. Least-privilege runtime role: `docs/security-hardening/db-least-privilege-proposal.sql` (proposal only), validated on a preview by checking that DDL and `UPDATE audit_log` are refused.
4. Optionally, FORCEd RLS with per-request context on the user-scoped tables, as IDOR defence-in-depth, with a negative test per table (another user's id returns 0 rows).
5. Keep `DATABASE_URL` Sensitive in Vercel (owner action O3); revoke the account-wide `NEON_API_KEY` (O4).

**Confirmed launch blockers from this area:** none on their own. The
isolation that matters at launch, application-level ownership checks, exists
and was exercised for deletion and safety by the hermetic suite. The
credential-handling items (O3, O4) are blockers, and are listed under F9/F10.

## F9: "live Stripe secret in the repository"

- **Searched:**
  - **Git:** tracked files at `bfc1eef` and all fetched history (`git log --all -G`) for `sk_live_`, `rk_live_`, `whsec_`, `sk_test_`, Neon `npg_` passwords and credentialed `postgres://` URLs. **0 hits** (the two pattern hits were a field name and a shell variable).
  - **Elsewhere:** also clean in the BrandStudio repo and `~/Downloads`.
- **Most likely location:** the untracked sandbox `.env`, or Vercel env settings, both outside my reach.
- **Next step:** the CTO team must give the exact path or setting name (not the value). Wherever it is, a live key that sat in a shared workspace should be rolled.
- **Branch status:** no secret literals in tracked code, so nothing to remove.

## F10: unavailable services and fail-open login

- **Missing configuration:** Phase 2B notes, and the code, say no `RESEND_API_KEY` exists in any environment. Photo upload returns an honest 503 when Uploadthing is not configured (`dog-photo.ts`, covered by `launch-fixes.test.ts`, which passes).
- **Exact consequence of the fail-open login:**
  - **Login works without verification.** `verificationGate` returns `allow-unverified`, so anyone can register with any email address, including someone else's, and get a full session immediately.
  - **The real owner is shut out.** Re-registering hits the duplicate-account path, and password reset sends nothing, so the real owner cannot reclaim the address until Resend is configured.
  - **Everyone is unverified.** No verification email has ever been deliverable, so every existing account is unverified.
  - **The Resend key flips this, and locks everyone out.** On the day the key is set, the gate switches to `block-unverified` and every existing user is refused at login. They must request a fresh link through the register form's duplicate path. Plan that communication before setting the key.
- **Honest reporting holds.** Verification emails are not claimed as sent when delivery fails or in test mode (the code paths return 503 or "no email sent"), and uploads report 503 when unavailable.

## F11: schema drift (found while testing)

- **Mismatch:** `dog_profiles.email` exists in production only because of runtime DDL in `src/db/schema.ts`; no migration creates it.
- **Effect:** `deleteUserAccount()` reads that column, so on a migrations-only database (for example a fresh Neon preview branch) account deletion fails with a 500.
- **Fixed in `de14d60`:** migration `012_dog_profiles_email_drift.sql` adds the column with the runtime definition (nullable TEXT), so it is a no-op on production. The harness no longer patches the column in, and a test proves `001–011` alone lack it while the full set supports deletion. No CTO commit or branch claimed this fix (`origin` checked 2026-10-28). The cto.new workspace could not be checked, so overlap remains possible.

## F12: other deletion and retention gaps (not changed)

| Gap | Owner |
|---|---|
| `reports.reporter_user_id ON DELETE CASCADE` deletes a user's safety reports with their account, which loses moderation evidence | owner/legal |
| `audit_log` keeps the account email forever (`account_deleted` details) | owner/legal |
| Dog photos in Uploadthing storage are not deleted with the account | CTO |
| Future bookings of a deleted provider are not cancelled or notified (booking state machine) | CTO |
| `rate_limits` keys include emails for up to 48 h (`login`, `reset-request`, `login-account`) | accepted, short-lived |
