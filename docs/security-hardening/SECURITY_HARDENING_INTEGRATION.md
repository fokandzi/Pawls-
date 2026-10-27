# Security hardening — integration package

- **Branch:** `hardening/claude-parallel-security`, base `bfc1eef` (= `origin/main`, Phase 2B).
- **Location:** a local worktree at `~/gta6-social/Pawls-hardening`, on the owner's MacBook.
- **Not pushed:** the push URL of the local `origin` is set to
  `DISABLED_NO_PUSH_UNTIL_OWNER_APPROVES`, so there is no draft PR. Patches are
  in `docs/security-hardening/patches/` (`git format-patch`).
- **Nothing is merged or deployed.**

## Commits (cherry-pick in this order)

| # | Commit | Subject | Depends on |
|---|---|---|---|
| 1 | `6192045` | test: hermetic test harness (PGlite, no network, no .env) | — |
| 2 | `bd52064` | fix(abuse): register every rate-limited action; limit messaging and bookings | — |
| 3 | `e93cc35` | fix(auth): redact email-token links, atomic single-use tokens, wrap legacy SHA-256 passwords (+ migration 011, scripts/security) | 2 (`login-account` registration) |
| 4 | `9edf50d` | fix(privacy): account deletion clears provider contact data and stops mails to it | — |
| 5 | `f482693` | test(security): hermetic suite | 1–4 |
| 6 | docs commit (this folder) | docs | — |

`fix/breeder-subscription-cancellation` (`9325554`, `e353db6`, also unmerged)
adds the same PGlite devDependency lines and owns migration `010`. This branch
uses `011`, and the runner tracks migrations by filename. Either branch can land
first; if `bun.lock` conflicts, the conflict is only the same added lines.

## Prerequisites and order of operations

1. **CTO:** review the overlap list in `PARALLEL_CLAUDE_HANDOFF.md`, then cherry-pick 1 to 6 onto a branch off current `main`.
2. **CTO:** `bun test src/lib/auth/security-hardening.test.ts` (Bun) **and** `node scripts/hermetic-test/run.mjs`. Never plain `bun test`: it runs the legacy suites against the shared database.
3. **CTO, Neon branch:** create a branch of the production DB, then point a preview at it, with its own storage, email and payment test keys.
   1. `DATABASE_URL=<branch> bun run scripts/security/readonly-security-audit.ts` and record the counts (expect roughly 125 unredacted `mail_log` rows and 5 bare legacy hashes, if the report is right).
   2. `DATABASE_URL=<branch> bun run db:migrate` (applies `011`).
   3. Re-run the audit: unredacted `mail_log` should be 0, and currently-valid tokens should be 0.
   4. `DATABASE_URL=<branch> bun run scripts/security/wrap-legacy-password-hashes.ts` (dry run), then `--apply`. Re-audit: bare legacy should be 0, wrapped should equal the dry-run count.
   5. On the preview: exercise register, login, verify (if Resend test keys exist), reset, block ×11, send messages, book, and delete a provider account.
4. **Owner OK**, then production: deploy, migrate, wrap script, audit (same steps 1 to 4 against production).
5. **Optional, scheduled:** `scripts/security/purge-expired-email-tokens.ts` daily, for example from the n8n layer.

## Owner actions (Claude did none of these)

| # | Action | Verify by |
|---|---|---|
| O1 | **Remove the public artifacts (F1).** The pending production deploy of `bfc1eef` (or later) drops them from the new deployment. Then delete or protect older Vercel deployments, whose immutable `*.vercel.app` URLs still serve them. Treat the demo zip's contents (test emails, DB ids) as exposed. | `curl -sI https://pawls.club/pawls_demo_assets_COMPLETE.zip` returns 404; same for old deployment URLs |
| O2 | **Locate the reported live Stripe key (F9).** Ask the CTO team for the file path or setting name, not the value. Then roll it in Stripe (Developers → API keys → Roll), update only the env store (Vercel, marked Sensitive), and confirm the webhook secret. | Old key rejected; checkout and webhook succeed on preview |
| O3 | **Mark Vercel env vars Sensitive.** `DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `UPLOADTHING_TOKEN` and any `PAWLS_*` secret must be re-entered as Sensitive. "Non-sensitive" is a dashboard visibility setting, not proof of exposure, but anyone with project read access can read those values. | Dashboard shows Sensitive |
| O4 | **Revoke the account-wide `NEON_API_KEY`** given to the CTO lead once the preview sequence is done. Prefer a project-scoped key. | Neon console |
| O5 | **Resend (F10).** Verify the `pawls.club` sending domain (SPF/DKIM), then set `RESEND_API_KEY` and `RESEND_FROM` on the preview, then production. **This flips login to `block-unverified`: every existing account is unverified and will be refused until it re-verifies.** Plan the message or migration first. | Preview: register gives a real email, then the link, then a session |
| O6 | **Uploadthing:** set `UPLOADTHING_TOKEN` (v7 token) on the preview, then production. | Dog photo upload gives 200 rather than 503 |
| O7 | **Retention decisions (F12):** whether to keep safety reports after the reporter deletes their account, and email in `audit_log`. | Written decision |
| O8 | **Approve production steps 4–5** above. | — |

## Rollback

- **Code:** revert commits 2 to 4 individually; they are independent apart from 3 needing 2. Commits 1, 5 and 6 are test and docs only.
- **Migration `011`:**
  - **Redaction and token expiry are deliberately not reversible.** The values removed were credentials.
  - **Index:** `DROP INDEX IF EXISTS idx_email_tokens_expires_at`.
  - **Re-applying is a no-op.**
- **Wrapped password hashes have no inverse, by design.**
  - **Timing:** run `--apply` only after commit 3 is live in production.
  - **If commit 3 must be reverted later:** keep the `sha256-scrypt$` branch of `verifyPassword` in `hash.ts`, or those users cannot log in.
  - **Over time:** login upgrades wrapped rows to plain scrypt.
- **Rate limits:** to loosen one, edit `LIMITS` in `src/lib/auth/rate-limit.ts`; no data migration is needed.

## Remaining blockers before anyone may call Pawls launch-ready

1. **Production runs `cb6b232`.** Neither Phase 2B nor this branch is live. Verify on pawls.club itself after the deploy.
2. **F1:** artifacts still served (O1).
3. **F10:** no email delivery. Verification is impossible and login fails open; setting the key locks out existing users (O5).
4. **Uploadthing** is not configured (O6).
5. **F9:** the Stripe key's location is unknown; rotation is pending (O2, O3).
6. **Bun:** this branch is untested under Bun and on a real Neon branch (see the test-results doc).
7. **F11:** schema drift, so deletion fails on a migrations-only DB.
8. **F8:** least-privilege role blocked by runtime DDL.
9. **F12:** future bookings of a deleted provider are not cancelled.
10. **Legacy suites** can still be run with plain `bun test` against the shared DB.

Each item above blocks launch on its own; missing credentials are not the only blocker.
