# Security hardening — test results (2026-10-28)

## Isolated environment (evidence)

| Item | Evidence |
|---|---|
| Database | In-process PGlite 0.5.8 (`src/test-support/pglite-db.ts`), built from `src/db/migrations/001–011` (all statements applied, 0 failures), plus one production-drift column (`dog_profiles.email`, see F11). |
| Network database | None. The runner deletes every `DATABASE*`/`PG*`/`NEON*` variable, sets `DATABASE_URL` to the sentinel `postgres://hermetic-sentinel.invalid:1/never`, and redirects `src/db.ts` to PGlite at module resolution. |
| `.env` | None exists in this worktree or in `Pawls-preview-fix`. The runner refuses any suite that reads `.env`/`DATABASE_URL`; verified for all four legacy suites (`deletion`, `payments`, `iap-core`, `webhook-core`: "HERMETIC: refusing"). |
| Email / payment / upload | `RESEND_*`, `STRIPE_*`, `UPLOADTHING_*`, `REVENUECAT_*` and `VERCEL_*` are removed, and `globalThis.fetch` throws. The mailer ran in test mode only. |
| Production | Not contacted, except read-only HEAD requests to `https://pawls.club` for finding F1. No accounts were created or deleted, and no writes were made. |
| Runtime | Node v24.18.0 with `scripts/hermetic-test/bun-test-shim.mjs`. Bun is not installed on this Mac (disk at its 10 GiB floor), so **the suites were not run under Bun**. |

**Command:** `node scripts/hermetic-test/run.mjs`

## Results

| Suite | Result |
|---|---|
| `src/lib/auth/security-hardening.test.ts` (new) | 20 / 20 pass |
| `src/lib/launch-fixes.test.ts` (Phase 2B) | pass |
| `src/lib/match-ui.test.ts` | pass |
| `src/lib/seo-titles.test.ts` | pass |
| **Total** | **75 pass, 0 fail, 0 skip** |

The baseline at `bfc1eef`, before my changes, was 55 / 55 for the three existing suites.

**Mutation check.** I temporarily reverted the five fixed source files to
`bfc1eef` and re-ran the new suite: **16 pass, 4 fail**. The four that failed:

| Test that failed on `bfc1eef` | Gap it exposed |
|---|---|
| mail_log never stores a raw verification link | F2 |
| login with a wrapped hash upgrades | F7 |
| login per-account cap across rotating IPs | F6 |
| provider contact data / listing / services gone | F3 |

The block-limit test passed on the old handler only because `rate-limit.ts`
(already fixed) registered `block`. Its registration test pins that.

**Typecheck.** `tsc --noEmit` reports no errors in any added or modified file.
The repo has 145 errors in total. The only one in a touched file (`match-api-handler.ts`
`authed` unused) exists unchanged at `bfc1eef`.

**Secret scan of the branch diff:** 0 matches.

## What the new suite covers

- **Tokens:**
  - **Storage:** only the hash is stored.
  - **Single use:** the second use reports `used`; four concurrent consumptions yield exactly one success.
  - **Invalid cases:** expired, unknown and wrong-kind tokens.
  - **Supersession:** a new reset link kills the old one, and consuming a link kills its siblings.
  - **Cleanup:** idempotent.
  - **Redaction:** `mail_log` is redacted, and migration 011 redacts idempotently and expires live tokens.
  - **Endpoint:** `POST /auth/verify-email` signs in once and refuses the replay (404).
- **Legacy passwords:**
  - **Wrapped verify:** right password true, wrong false.
  - **Wrap script:** dry run vs apply, idempotent re-run, modern account byte-identical.
  - **Login:** a wrong password gives 401 with the hash unchanged; the right one gives 302 and an upgrade to scrypt; a bare legacy hash also upgrades.
- **Rate limits:**
  - **Registration:** every action literal in five handlers is registered, which guards against the silent default.
  - **Limits:** 10 / hour per user, isolated between users and actions, recovered after the window; message flood stopped at 61.
  - **Endpoint:** `POST /api/safety/block` returns 200 ×10, then 429; a cross-site unblock gets 403 (CSRF) and a same-site one 200.
  - **Login:** 21 attempts from rotating IPs end in 429.
- **Deletion:**
  - **Provider row:** contact, photo and description cleared, suspended, gone from the public listing query, services inactive.
  - **Bookings and mail:** the owner's bookings as a customer are anonymised by `customer_user_id`; other customers' bookings are untouched; `mail_log` is anonymised.
  - **Cross-user:** another owner's listing is untouched.
  - **Repeat:** a second deletion is safe, and a deleted user's session gets 401.

## Not tested (and why)

| Case | Why not | Who / how |
|---|---|---|
| Bun runtime (`bun test`) | Bun not installed here | CTO: `bun test src/lib/auth/security-hardening.test.ts` (uses `mock.module`) |
| Real Neon HTTP driver semantics (`transaction`, conditional `UPDATE` under real concurrency) | No isolated Neon branch available | Run migration 011 + suite flows on a Neon branch preview |
| Migration 011 on real data (actual counts: the "125", the "5") | No DB access | `readonly-security-audit.ts` before/after on a Neon branch |
| `wrap-legacy-password-hashes.ts` on real rows | No DB access | Dry run, then `--apply` on a branch, then prod with owner OK |
| UI handling of the new 429s (messaging client, `/book/my-bookings?error=RATE_LIMITED` copy) | No browser run of the app | CTO: check the conversation UI and the booking error banner |
| Vercel `x-forwarded-for` behaviour behind the edge | Needs deployed preview | Preview check |
| Resend / Uploadthing real delivery | Not configured anywhere | After owner provisions keys |
| Live pawls.club behaviour of any fix | Nothing deployed (by design) | After CTO deploy; fixes are NOT live |
| Legacy network-DB suites | Unsafe: they target the shared prod DB | Only with a Neon-branch `DATABASE_URL` |
