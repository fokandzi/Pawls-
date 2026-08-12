/**
 * Password hashing — modern scrypt (node:crypto), constant-time compare.
 *
 * Format stored in users.password_hash: `scrypt$N$r$p$salt$hash`
 *   N=16384, r=8, p=1, 16-byte random salt, 64-byte derived key.
 *
 * Legacy rows: pre-auth users were stored as unsalted SHA-256 hex (64 chars).
 * Those are verified via sha256 and transparently upgraded to scrypt on the
 * next successful login (see verifyAndUpgradePassword). Plaintext is never
 * stored anywhere.
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

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  if (isScryptHash(stored)) {
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
    const derived = await scrypt(password, salt, expected.length, { N: n, r, p });
    return timingSafeEqual(derived, expected);
  }
  if (isLegacySha256Hash(stored)) {
    // Legacy unsalted sha256 — verify, then the caller upgrades to scrypt.
    const digest = createHash("sha256").update(password).digest("hex");
    const a = Buffer.from(digest, "utf8");
    const b = Buffer.from(stored, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
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
