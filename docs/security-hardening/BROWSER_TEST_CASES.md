# Browser test cases: rate-limit responses and the Resend verification transition

**Not executed.** These are prepared for the CTO team or owner to run on a
**preview** deployment of this branch.

**The preview must be isolated:**
- **Database:** a Neon branch.
- **Email:** a Resend test or sandbox key on a test sending domain.
- **Storage and payments:** Uploadthing and Stripe in test mode.
- **Nothing on pawls.club.**

**Test accounts:** synthetic only, e.g. `qa+<n>@<your test domain>`. Never real users.

**Resetting a limit between runs:** run this on the branch database, never production:
`DELETE FROM rate_limits WHERE key = 'u<id>'`, or wait out the window.

"Expected (code)" below means what the code on this branch should do. **UI
gaps** marks places where reading the client code shows the experience is weak.

## A. Rate-limit responses

| # | Steps | Expected (code) | UI gap to confirm |
|---|---|---|---|
| A1 | Two matched test users A and B. A sends 60 messages within 10 minutes (DevTools snippet POSTing to `/api/match/conversations/<id>/messages`, or by hand), then a 61st from the UI | 61st gets `429 {"error":"RATE_LIMITED"}` with a `Retry-After` header; message not stored | `match.conversations_.$id.tsx` only sets the generic "send failed" state: no "too many messages, wait N min" copy. Confirm the typed text is kept (expected: `setNewMsg` is not cleared) |
| A2 | Same as A1, but B sends after A is limited | B unaffected (per-user bucket) | — |
| A3 | A waits for the window (≤10 min) or the row is reset, then sends again | 200; conversation continues normally | — |
| A4 | A starts conversations with 21 distinct matches within an hour | 21st start gets 429 + `Retry-After` | Check how the matches screen reacts (silent failure?) |
| A5 | A blocks 10 test users within an hour, then an 11th, from the safety menu | 11th gets 429; UI shows `safety.tooMany` (`conversations_.$id.tsx:170`, `safety-ui.tsx:41`) | Check FR and EN copy |
| A6 | After A5, A unblocks one user | 200: separate `unblock` bucket (was shared with unmatch before) | — |
| A7 | A unmatches 11 users within an hour | 11th gets 429 with `safety.tooMany`; blocking still works (separate bucket) | — |
| A8 | Cross-site check: from another origin (e.g. a local HTML file) POST to `/api/safety/block` with A's cookie | 403 CSRF before any rate limit or database work | — |
| A9 | Customer creates 10 bookings within an hour from `/book/<providerId>` (JS form), then an 11th | 11th gets `429 {error:"RATE_LIMITED", messageFr:"Trop de demandes de réservation — réessayez plus tard."}`; no booking row | Confirm the booking page shows `messageFr`/`message` rather than a generic error |
| A10 | Same as A9 with JavaScript disabled (plain form POST, `Accept: text/html`) | 303 to `/book/my-bookings?error=RATE_LIMITED` | **Gap:** `RATE_LIMITED` is not in `NOTICE_CODES` (`book.my-bookings.tsx:168`), so **no notice is shown**. Add a notice key or confirm acceptable |
| A11 | Login: 5 wrong passwords for one account from one browser within 15 min | 6th gets the FR rate-limit page (429 + `Retry-After`) | — |
| A12 | Login: 20 wrong passwords for one account across ≥5 networks (phone hotspot, VPN) within 15 min; then the correct password from a fresh network | 21st attempt and the correct one get 429 until the window ends (per-account cap); other accounts unaffected | Lockout is bounded at 15 min; confirm support copy is acceptable |
| A13 | Report flow: 6 reports within an hour | 6th gets 429 with `safety.tooMany` (unchanged limit, now explicit) | — |

## B. Existing-user verification transition when Resend is enabled

**Context (F10):**
- **Today:** no email can be sent, so every existing account is unverified, and login is allowed with a "non vérifiée" banner (`allow-unverified`).
- **After the change:** setting `RESEND_API_KEY` flips the gate to `block-unverified` at request time, with no deploy needed.

| # | Steps | Expected (code) | Watch for |
|---|---|---|---|
| B1 | **Before the key**, on the preview: log in as an unverified test user U1 | 302 to `/match`; banner "adresse email non vérifiée" visible | — |
| B2 | Set `RESEND_API_KEY` + `RESEND_FROM` (test domain) on the **preview only**; redeploy or refresh env. U1, still holding an old session cookie, opens `/match` | Existing session keeps working; the gate runs only at login. **Decide whether that is acceptable** | Sessions created before the flip stay valid for their lifetime |
| B3 | U1 logs out and logs in again with the correct password | 403 FR page `auth.err.unverifiedLoginTitle` ("Vérifiez votre adresse email"), **no session cookie set**, links to `/verify-email` and `/login` | Confirm the page tells the user how to get a link (it points to `/verify-email`, but the link is re-issued from the **register** form) |
| B4 | U1 goes to `/register` and submits the same email (any name/password/DOB ≥16) | Duplicate path: a fresh verification email is sent (`auth.register.resentBody`); the `resend-verification` limit is 5/h per IP | **Usability gap:** existing users are unlikely to discover "re-register to get a link". Recommend a "renvoyer le lien" form on the 403 page or `/verify-email` |
| B5 | Open the email in the test inbox; click the link | `GET /verify-email?token=…` renders a confirm form; the POST verifies, signs in and redirects to `/match/create?verified=1` | Link expires after 24 h; email client link-scanners must **not** consume it (GET is safe) |
| B6 | Click the same link again | 404 "lien déjà utilisé" | — |
| B7 | U1 logs out and logs in again | 302 normal login; no unverified banner | — |
| B8 | U2 (unverified) requests the link twice (B4 twice), then uses the **first** email's link | Both links are valid until one is used; using either verifies, and the sibling then shows "invalid" | — |
| B9 | U3 with a **wrapped legacy password** (after the wrap script ran on the branch DB) logs in post-flip while unverified | 403 block, and the hash stays wrapped (not upgraded while blocked); after verification, login upgrades it to `scrypt$` (check the DB on the branch) | — |
| B10 | Password reset for verified U1: request, use the link, then try the older link | New password works; the older reset link shows "invalid"; all U1 sessions revoked | — |
| B11 | Check `mail_log` on the branch DB after B4–B10 | Bodies contain `token=[redacted]`; `status='sent'` with the provider id; no raw token in `rate_limits.key` | Run `scripts/security/readonly-security-audit.ts` (unredacted count must be 0) |
| B12 | Resend outage simulation: set an invalid `RESEND_API_KEY` on the preview, then try B4 | 503 "email indisponible"; **never** "email envoyé"; for a brand-new registration, the account is rolled back | — |

**Before enabling Resend in production (owner decision):**
- **Announce it.** Existing users are told they will need to verify their address.
- **Fix the discovery gap.** Either accept B4, or add a resend form to the 403 page first. The latter is CTO UI work, not on this branch.
- **Decide B2.** Choose whether pre-flip sessions should be revoked, e.g. `UPDATE sessions SET revoked_at = NOW()` for unverified users.
