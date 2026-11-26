# Security hardening — test results (2026-10-28)

## Isolated environment (evidence)

| Item | Evidence |
|---|---|
| Database | In-process PGlite 0.5.8 (`src/test-support/pglite-db.ts`), built from `src/db/migrations/001–012` only (all statements applied, 0 failures). Since `de14d60` the harness adds no columns of its own. |
| Network database | None. The runner deletes every `DATABASE*`/`PG*`/`NEON*` variable, sets `DATABASE_URL` to the sentinel `postgres://hermetic-sentinel.invalid:1/never`, and redirects `src/db.ts` to PGlite at module resolution. |
| `.env` | None exists in this worktree or in `Pawls-preview-fix`. The runner refuses any suite that reads `.env`/`DATABASE_URL`; verified for all four legacy suites (`deletion`, `payments`, `iap-core`, `webhook-core`: "HERMETIC: refusing"). |
| Email / payment / upload | `RESEND_*`, `STRIPE_*`, `UPLOADTHING_*`, `REVENUECAT_*` and `VERCEL_*` are removed. The mailer ran in test mode only. Network guards are listed in the next section. |
| Production | Not contacted, except read-only HEAD requests to `https://pawls.club` for finding F1. No accounts were created or deleted, and no writes were made. |
| Runtime | Node v24.18.0 with `scripts/hermetic-test/bun-test-shim.mjs`. Bun is not installed on this Mac (disk at its 10 GiB floor), so **the suites were not run under Bun**. |

**Command:** `node scripts/hermetic-test/run.mjs`

## What the harness prevents, and what it does not

The earlier version of this document relied on `fetch` being blocked. That alone
does not stop network access: `node:http`/`https` (the Stripe SDK's
transport), raw `net`/`tls`, undici, WebSocket (Neon's `Pool`), DNS and child
processes such as `curl` bypass it. Since `a89d4d6` the runner installs these
guards **before importing any suite**:

| Path | Guard | Proven by self-check |
|---|---|---|
| `globalThis.fetch` | throws | yes |
| `net.Socket.prototype.connect` (carries `net.connect`, `tls.connect`, `http`/`https` requests, undici, WebSocket-over-TCP) | throws | `net.connect`, `https.request`, `http.request` |
| `dns.lookup`, `dns.resolve`, `dns.promises.*` | throw | `dns.promises.lookup`, named-import `dns.lookup` |
| `globalThis.WebSocket` | constructor throws | yes |
| `child_process.spawn/spawnSync/exec/execSync/execFile/execFileSync/fork` | throw; `syncBuiltinESMExports()` so named imports see it too | `spawn`, named-import `spawn` |
| Database | `src/db.ts` resolved to in-process PGlite; `DATABASE_URL` is an unroutable sentinel | (module redirection; all DB tests pass on PGlite) |
| `.env` / network-DB suites | refused before import | the four legacy suites refused |

The run aborts unless every probe is refused. Current output:
`network guard self-check: 9/9 paths refused`.

**Not prevented (these are in-process JavaScript guards, not OS isolation):**
- native addons that open sockets themselves;
- `process.binding('tcp_wrap')`-style internals;
- `worker_threads` workers, which get fresh builtins (no suite uses them);
- anything executed before the guards, i.e. the runner's own imports (Node builtins only);
- filesystem writes (PGlite is in memory; suites write nothing to disk).

For an OS-level guarantee, run it inside a network-less sandbox, e.g.
`docker run --network none … node scripts/hermetic-test/run.mjs`. That has not been done.

**Not claimed:** no suite was run under native Bun, and nothing was run against
Neon (real or branch). PGlite is single-connection, so "concurrent" tests
exercise serialized interleavings, not real row-lock races (see
`SECURITY_HARDENING_REVIEW.md` §2).

## Results

| Suite | Result |
|---|---|
| `src/lib/auth/security-hardening.test.ts` (new) | 21 / 21 pass (adds: fresh-migration deletion via `012`, listing-address `mail_log` anonymisation, no raw token in `rate_limits`) |
| `src/lib/launch-fixes.test.ts` (Phase 2B) | pass |
| `src/lib/match-ui.test.ts` | pass |
| `src/lib/seo-titles.test.ts` | pass |
| **Total** | **76 pass, 0 fail, 0 skip** (2026-10-28, after `a70df02`) |

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
