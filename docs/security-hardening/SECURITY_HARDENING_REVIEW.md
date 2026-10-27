# Independent review of this branch's own changes (2026-10-28)

This review covers the code on `hardening/claude-parallel-security`.

**Evidence levels used below:**
- **Verified (hermetic):** shown by the PGlite suite under Node.
- **Reasoned:** follows from PostgreSQL semantics or from reading the code, but was not exercised.
- **Unvalidated:** needs Bun, a Neon branch or a browser, none of which were used.

**No native Bun run and no Neon run happened.**

## 1. Password wrapping (`hash.ts`, `legacy-passwords.ts`, login)

| Property | Status |
|---|---|
| Wrapped format `sha256-scrypt$N$r$p$salt$key` = `scrypt(lowercase sha256 hex of password)`. `verifyPassword` recomputes the same input, so the right password verifies and a wrong one fails | Verified (hermetic) |
| No password is needed and nothing is cracked: the stored digest itself is the scrypt input | Reasoned (code) |
| Compare-and-swap `UPDATE … WHERE password_hash = <old>` both in the wrap script and in the login upgrade, so a concurrent reset or login is never overwritten | Reasoned; CAS path not raced in tests |
| Modern `scrypt$` rows are untouched by the script and by login (`needsRehash` is false at current parameters) | Verified (hermetic) |
| Uppercase legacy hex: the wrap lowercases it, so a wrapped uppercase row now verifies. A *bare* uppercase row never verified before this branch either (existing behaviour) | Reasoned |
| Login with a correct password is not upgraded when the verification gate blocks (Resend configured, address unverified). The row stays wrapped, which is safe, and upgrades on the first allowed login | Reasoned |
| Unknown-email login skips scrypt, a timing signal for account enumeration. This exists at `bfc1eef` and was not changed | Not fixed: out of scope |

**Irreversible effect:** `--apply` replaces each bare digest. There is no inverse, by design.

**Rollback compatibility:**
- **Code reverted after `--apply`:** if `e93cc35` is reverted after the script runs, wrapped users cannot log in. `verifyPassword` at `bfc1eef` returns false for `sha256-scrypt$`, and the password-reset route out depends on email delivery, which does not exist yet.
- **Rule:** run `--apply` only after `e93cc35` is in production. If that code must be reverted later, keep the wrapped branch of `verifyPassword`.
- **Re-runs:** the script is idempotent.

## 2. Token consumption concurrency (`email-tokens.ts`)

| Property | Status |
|---|---|
| Consumption is one statement: `UPDATE … SET used_at = NOW() WHERE token_hash = $1 AND kind = $2 AND used_at IS NULL AND expires_at > NOW() RETURNING user_id`. Under PostgreSQL READ COMMITTED, a second concurrent UPDATE waits on the row lock, re-evaluates `used_at IS NULL` after the first commits, and matches 0 rows, so exactly one consumer wins | Reasoned (PostgreSQL semantics) |
| The "concurrent consumption succeeds exactly once" test uses `Promise.all`, but **PGlite runs one connection and serializes statements**. It proves the interleaved-sequential case, **not a real row-lock race**. The Neon HTTP driver auto-commits each statement, so the reasoning applies, but this is untested there | **Unvalidated on Neon** |
| Expiry is checked in the same statement against database time, with no check-then-act gap | Verified (hermetic) |
| Sibling expiry runs after the winning UPDATE as a separate statement. A *different* sibling link consumed in that window also succeeds. For `verify` this is harmless: same user, same outcome. For `reset`, two links used within milliseconds both set a password, the last one wins, and all sessions are revoked each time | Accepted residual |
| Issuance: "expire older reset links, then INSERT" is two statements. Two simultaneous reset requests can leave two valid links. `reset-request` is limited to 3 per hour per email | Accepted residual |
| Handlers consume the token **before** the follow-up write. If the user `UPDATE` or session creation fails afterwards, the link is spent and the user must request a new one. This fails closed | Reasoned |

**Irreversible effect:** consumed tokens are not restorable. That's intended.

## 3. Redaction coverage

| Path | Status after this branch |
|---|---|
| `email_tokens` | Hash only (unchanged from `bfc1eef`) |
| `mail_log.body` (test and prod mode) | `token=` values redacted; migration `011` redacts existing rows |
| Console, test mode | Redacted. Raw values only with `PAWLS_DEV_MAIL_LINKS=1`, and never on Vercel or with `NODE_ENV=production` |
| Console, prod mode | Metadata only (unchanged) |
| `rate_limits.key` for verify/reset | **Was the raw token** at `bfc1eef` and earlier on this branch; fixed in `a70df02` (hashed). Old rows hold tokens already expired by `011` and age out after 48 h |
| Redaction pattern `[?&]token=<value>` | Covers both link builders, the only `token=` producers (`mailer.ts` `verificationEmail` and `passwordResetEmail`, token first after `?`). It would **not** match an HTML-escaped `&amp;token=` or another parameter name; no template produces either today |
| Resend (provider side) | **Not covered.** The provider retains sent message content, links included, according to its own retention settings. Owner: check Resend log retention |
| Vercel request logs | **Hypothesis, unverified:** a click on the email link is a `GET /verify-email?token=…` or `/reset-password?token=…`, and request logs typically record the query string. Mitigation options: exchange the token for a short-lived opaque value server-side, or move it to the URL fragment. That's CTO-owned UI work |
| Browser history | Contains the link URL until it is consumed or expires (single use limits the impact) |
| `Referer` to third parties | Every page loads `unpkg.com` (Leaflet) from `__root.tsx`, and no `Referrer-Policy` header is set. The browser default `strict-origin-when-cross-origin` sends only the origin cross-site, so **not expected to leak**, but not observed. Recommendation: `Referrer-Policy: no-referrer` on `/verify-email` and `/reset-password` |
| Link scanners in mail clients | A GET only renders a form; consumption needs a same-site POST, so scanners cannot burn or use the token |
| PostHog | Loaded only by `/invite`, `/register` and `/join` (`capture_pageview: false`); not imported by the token pages |

**Irreversible effect:** migration `011` overwrites token values in `mail_log` and expires every live token. Nothing in the app reads `mail_log.body` (searched), so redaction is rollback-compatible: old code keeps working with redacted rows.

## 4. Deletion and anonymisation scope (`deletion.ts`)

| Data | After deletion | Status |
|---|---|---|
| Users, sessions, email tokens, acquisition rows | Deleted (FK cascade / explicit) | Verified (hermetic) |
| Dogs owned via `user_id` or legacy email match, plus their swipes, matches and legacy messages | Deleted; legacy email match needs migration `012` on migrations-only databases | Verified (hermetic, `de14d60`) |
| Conversations the user took part in | Deleted **including the other participant's messages** (existing policy) | Not changed, flagged |
| Owned provider listing | email, phone, website, photo and description cleared; `suspended`; services inactive; name kept | Verified (hermetic) |
| Provider `location` (free text, NOT NULL) | **Kept.** It can be a street address for a home-based sole trader | Gap: owner decision |
| Provider `name` | Kept for counterparties' booking history. For a sole trader this may be a personal name | Retention decision: owner/legal |
| Bookings as customer | Name and email anonymised by `customer_user_id` **or** email | Verified (hermetic) |
| Other customers' bookings at the deleted provider | Kept intact (their data); **future bookings are not cancelled or notified** | Gap: CTO (booking state machine) |
| `mail_log` to the account email **and** to the listing address | Anonymised (`ea17020` added listing-address rows; an address that is another account's login is left alone) | Verified (hermetic) |
| `audit_log` | Three rows with the email (`account_deleted`, `_confirmed`, `_done`), kept forever | Retention decision: owner/legal |
| Safety reports filed by the user | Deleted by FK cascade (moderation evidence lost) | Retention decision: owner/legal |
| Uploadthing photo files | Not deleted | Gap: CTO |
| `rate_limits` keys containing the email | Kept for ≤48 h | Accepted |
| Repeat deletion | No-op success; a deleted user's session gets 401 | Verified (hermetic) |

**Irreversible effects:**
- **Account deletion:** by design.
- **Provider listing contact wipe:** reverting the code does not restore cleared fields.
- **Rows already `suspended` stay suspended.**

## 5. Rollback compatibility summary

| Change | Revert code safely? | Data effect survives revert? |
|---|---|---|
| Rate limits (`bd52064`) | Yes | `rate_limits` rows with new action names are inert |
| Token lifecycle + redaction (`e93cc35`, `a70df02`) | Yes. Old code reads the same `email_tokens` table and hashes | Redacted `mail_log` and expired tokens stay (intended) |
| Wrapped passwords (`e93cc35` + script) | **Only before `--apply`, or by keeping wrapped verification** | Wrapped rows stay |
| Deletion (`9edf50d`, `ea17020`) | Yes | Wiped listings and anonymised mail stay |
| Migration `011` | n/a | Index droppable; redaction and expiry are permanent |
| Migration `012` | n/a | No-op on production; droppable on a migrations-only DB |
| Harness (`6192045`, `a89d4d6`) | Yes | None |
