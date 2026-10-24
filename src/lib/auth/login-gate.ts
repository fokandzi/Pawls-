/**
 * Unverified-login gate (P0, Phase 2B — audit §B).
 *
 * WHY THIS EXISTS
 * Before this module, `handleLogin()` gated only on `suspended_at`: a registered
 * but never-verified account received a full session and was redirected to
 * /match. That is a security gap (an address nobody proved they own could use
 * the product) and an honesty gap (the UI never said the address was unverified).
 *
 * WHY THE GATE IS CONDITIONAL
 * Verification is only possible when outbound email actually works. Today
 * `RESEND_API_KEY` is absent in every environment, so no verification email can
 * ever leave the building — blocking unverified logins then would lock EVERY
 * user out of the product permanently. The gate therefore has three outcomes:
 *
 *   verified          → normal login (no change).
 *   block-unverified  → mail delivery IS configured and the address is not
 *                       verified: refuse the session (403 + FR copy) and point
 *                       the visitor at the verification flow.
 *   allow-unverified  → mail delivery is NOT configured: allow the login (the
 *                       only way anyone can use the product today) and say so
 *                       truthfully — the signed-in UI shows a persistent
 *                       "adresse email non vérifiée" banner fed by
 *                       /api/match/mine, so the state is explicit, not silent.
 *
 * The behaviour flips automatically the day the Resend key lands: no code
 * change, no deploy of new logic — `mailConfigured` is read from the
 * environment at request time.
 *
 * This module is deliberately PURE (no DB, no mailer import) so both branches
 * are unit-testable without a database or an email provider.
 */

export type VerificationGate = "verified" | "block-unverified" | "allow-unverified";

export interface VerificationGateInput {
  /** `users.email_verified_at` — a timestamp string, or null/undefined. */
  emailVerifiedAt: unknown;
  /** True when outbound email is really configured (RESEND_API_KEY present). */
  mailConfigured: boolean;
}

/** Decide what login does for one account. Pure — see the tests. */
export function verificationGate(input: VerificationGateInput): VerificationGate {
  if (input.emailVerifiedAt) return "verified";
  return input.mailConfigured ? "block-unverified" : "allow-unverified";
}
