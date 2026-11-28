/**
 * Password hashing — modern scrypt (node:crypto), constant-time compare.
 *
 * Format stored in users.password_hash: `scrypt$N$r$p$salt$hash`
 *   N=16384, r=8, p=1, 16-byte random salt, 64-byte derived key.
 *
 * Legacy rows: pre-auth users were stored as unsalted SHA-256 hex (64 chars).
 * Those digests are NO LONGER accepted at login (see verifyPassword): they must
 * be wrapped first. wrapLegacySha256Hash() converts a bare SHA-256 row WITHOUT
 * knowing the password, so the unsalted digests stop sitting in the database
 * while their owners have not logged in yet
 * (scripts/security/wrap-legacy-password-hashes.ts).
 * The owner's existing password keeps working; the next login re-hashes it as
 * plain scrypt.
 *
 * Wrapped legacy rows: `sha256-scrypt$N$r$p$salt$hash` = scrypt(sha256hex(pw)).
 * This is the ONLY form a legacy row authenticates in.
 */
import { scrypt as scryptCb, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

export const SCRYPT_N = 16384;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_KEYLEN = 64;
export const SCRYPT_SALT_BYTES = 16;

export function isScryptHash(hash: string | null | undefined): boolean {
  return !!hash && hash.startsWith("scrypt$");
}

/** Legacy pre-auth storage was unsalted SHA-256 hex. */
export function isLegacySha256Hash(hash: string | null | undefined): boolean {
  return !!hash && /^[0-9a-f]{64}$/i.test(hash);
}

const WRAPPED_PREFIX = "sha256-scrypt$";

/** A legacy SHA-256 digest wrapped in scrypt (see wrapLegacySha256Hash). */
export function isWrappedLegacyHash(hash: string | null | undefined): boolean {
  return !!hash && hash.startsWith(WRAPPED_PREFIX);
}

async function scryptEncode(prefix: string, input: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derived = await scrypt(input, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return [
    prefix,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

async function scryptMatches(input: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, "base64url");
    expected = Buffer.from(hashB64, "base64url");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  const derived = await scrypt(input, salt, expected.length, { N: n, r, p });
  return timingSafeEqual(derived, expected);
}

export async function hashPassword(password: string): Promise<string> {
  return scryptEncode("scrypt", password);
}

/**
 * scrypt-wrap a bare legacy SHA-256 hex digest. Needs no password: the input
 * is the stored digest itself, which verifyPassword recomputes from the
 * password at login. Throws on anything that is not a legacy digest.
 */
export async function wrapLegacySha256Hash(legacyHex: string): Promise<string> {
  if (!isLegacySha256Hash(legacyHex)) throw new Error("not a legacy sha256 digest");
  return scryptEncode(WRAPPED_PREFIX.slice(0, -1), legacyHex.toLowerCase());
}

/** True when a successful login should replace the stored hash with hashPassword(). */
export function needsRehash(stored: string | null | undefined): boolean {
  if (isLegacySha256Hash(stored) || isWrappedLegacyHash(stored)) return true;
  if (!isScryptHash(stored)) return false;
  const [, n, r, p] = String(stored).split("$");
  return Number(n) < SCRYPT_N || Number(r) < SCRYPT_R || Number(p) < SCRYPT_P;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  if (isScryptHash(stored)) return scryptMatches(password, stored);
  if (isWrappedLegacyHash(stored)) return scryptMatches(legacySha256(password), stored);
  if (isLegacySha256Hash(stored)) {
    // REFUSED (2026-11-27). A bare unsalted SHA-256 digest is no longer a login
    // credential: it is fast to brute-force and its presence in the table is the
    // finding this change closes. Only the scrypt-wrapped form authenticates.
    // Deploy order: run scripts/security/wrap-legacy-password-hashes.ts --apply
    // BEFORE this code ships (docs/WEAK-CREDENTIAL-REMEDIATION.md). A refused
    // account is not reset and its password still works once wrapped; if it is
    // somehow still bare, the user recovers with the normal password-reset flow.
    return false;
  }
  return false;
}

export function legacySha256(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

/** Constant-time compare for two plain strings (e.g. delete-account email confirmation). */
export function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
