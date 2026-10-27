# Parallel Claude handoff — Pawls security hardening

## Baseline (verified 2026-10-27/28, not assumed)

| Claim in the CTO report | Verified |
|---|---|
| Phase 2B merged to main at `bfc1eef` | **Yes**: `git fetch` moved `origin/main` from `97ac63b` to `bfc1eef` ("Phase 2B: P0 launch fixes … (#15)", cto-new[bot], 2026-10-24). |
| Production still runs `cb6b232` | **Consistent**: pawls.club returns 404 for `/health` (added in `bfc1eef`) and still serves the files Phase 2B removed. The deployment id was not read (Vercel token expired). |
| CTO owns deploy, credentials, launch | Respected: nothing deployed, merged, rotated or provisioned. |

- **Repository:** GitHub `fokandzi/Pawls-`.
- **Local checkout:** `~/gta6-social/Pawls-preview-fix` on `fix/breeder-subscription-cancellation`, which is clean, with the push URL disabled.
- **This work:** worktree `~/gta6-social/Pawls-hardening`, branch `hardening/claude-parallel-security`.
- **Records that do not exist:**
  - **No `AGENTS.md`** in the repo, and no audit reports, deployment notes or work records committed. The repo has only `SITE.md` and `docs/{auth-deletion-policy,schema-migration-safety}.md`.
  - **The CTO team's live records** are in the cto.new workspace (`/home/team/shared/site`), which I cannot read. Ownership was inferred from git history and commit messages only.

## Proposed ownership (this branch)

| Area | Files |
|---|---|
| Hermetic tests | `scripts/hermetic-test/*`, `src/test-support/pglite-db.ts`, `src/lib/auth/security-hardening.test.ts`, `package.json` (devDep + script), `bun.lock` |
| Rate limits | `src/lib/auth/rate-limit.ts`, `safety-api-handler.ts` (1 line), `match-api-handler.ts` (2 limits + helper), `booking-api-handler.ts` (1 limit) |
| Email tokens / passwords | `src/lib/auth/{hash,email-tokens,legacy-passwords,mailer}.ts`, `src/auth-handler.ts`, `src/db/migrations/011_security_hardening.sql`, `scripts/security/*` |
| Deletion | `src/lib/auth/deletion.ts`, `src/lib/booking-emails.ts` (`providerContact` guard) |

## Overlap risks

| File | CTO work touching it | Risk |
|---|---|---|
| `src/auth-handler.ts` | Phase 2B login gate (`bfc1eef`), any Resend wiring in progress | **High**: merge carefully; my edits are in `sendVerificationFor`, `handleLogin` (limit + rehash), `handleVerifyEmail`, `handlePasswordResetRequest`, `handlePasswordReset` |
| `src/lib/auth/mailer.ts` | Resend provisioning | Medium: only the body redaction changed |
| `booking-api-handler.ts`, `src/lib/booking-emails.ts` | Batch D1/D2 booking work | Medium |
| `src/lib/auth/deletion.ts` | Security finding #13 (`f52e039`) | Medium: additions only |
| `match-api-handler.ts` | Messaging | Low |
| Migration numbering | `010` is used by my unmerged billing branch; this branch adds `011` and `012` | Low (filename-tracked) |
| `src/db/migrations/012_dog_profiles_email_drift.sql` | Schema ownership (runtime DDL in `src/db/schema.ts`) | Low: no CTO commit or branch claims it (checked `origin` 2026-10-28); cto.new workspace not visible |
| `package.json` / `bun.lock` | Any dependency change | Low |

**Not touched, CTO-owned:**
- Phase 2B gate logic
- production deploy
- secret provisioning
- the four legacy network-DB suites
- `scripts/migrate.ts`
- `src/db/schema.ts` runtime DDL (F11)
- booking state machine (F12)

## Message to relay to the CTO lead

No shared coordination channel was available to me, so this message has **not** been sent.

> Parallel security branch `hardening/claude-parallel-security` (local, based on bfc1eef, not pushed; patches available). It doesn't touch Phase 2B gate logic, deploys, secrets, the legacy `src/db/*.test.ts` suites, or `scripts/migrate.ts`. Files it changes: `src/auth-handler.ts` (token consume/issue, login per-account limit, rehash), `src/lib/auth/{hash,mailer,rate-limit,deletion}.ts`, the new `src/lib/auth/{email-tokens,legacy-passwords}.ts`, `safety/match/booking-api-handler.ts` (rate limits), `src/lib/booking-emails.ts` (`providerContact`), and the new migration `011_security_hardening.sql`. If you're editing any of these, please tell me before integrating.
>
> Findings you need now:
> 1. pawls.club still serves `pawls_demo_assets_COMPLETE.zip` and the review mp4. Old Vercel deployments will keep serving them after your deploy unless you delete or protect them.
> 2. `mail_log.body` stores raw verify/reset links (likely the "125"). A verify link signs its holder in.
> 3. block/unmatch actually run at 5/h, because they aren't registered in `rate-limit.ts`.
> 4. `dog_profiles.email` exists only through runtime DDL, so deletion 500s on a migrations-only Neon branch.
> 5. I found no Stripe live key in git (tracked files or history). Where exactly is it? Path or setting name only, please.
>
> Run tests with `node scripts/hermetic-test/run.mjs`, or `bun test src/lib/auth/security-hardening.test.ts`. Please don't run plain `bun test` on the shared database.

## Integration order

See `SECURITY_HARDENING_INTEGRATION.md`. In short:
1. `6192045` (harness)
2. `bd52064` (rate limits)
3. `e93cc35` (auth + migration 011)
4. `9edf50d` (deletion)
5. `f482693` (tests)
6. `2a66c85` (docs)
7. `de14d60` (migration 012)
8. `ea17020` (deletion: listing-address mail)
9. `a89d4d6` (harness network guards)
10. `a70df02` (token-hash rate-limit keys)
11. Final docs commit.
12. Neon branch: audit → migrate → wrap → re-audit → `BROWSER_TEST_CASES.md`.
13. Owner OK, then production.

The relay message above was the first version; the current short version is
in `RELAY_MESSAGE.txt` in the archive.
