/**
 * Password policy — the SINGLE source of truth for client and server.
 *
 * The register form once carried both `minLength={8}` and `minLength={6}` on
 * the same input (a contradiction that let a 6-character password reach a
 * server that requires 8, then dropped the user on a bare error page). Both
 * sides now import these constants: the HTML input attribute, the browser
 * `minLength`, and the server-side length check all read the same numbers.
 *
 * Server rules (auth-handler.ts): length BETWEEN min and max inclusive.
 * Hardening (uppercase/digits/breach lists) is intentionally NOT implied here —
 * the product only ever promises a length rule.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordLengthProblem = "too_short" | "too_long" | null;

export function passwordLengthProblem(password: string): PasswordLengthProblem {
  if (password.length < PASSWORD_MIN_LENGTH) return "too_short";
  if (password.length > PASSWORD_MAX_LENGTH) return "too_long";
  return null;
}
