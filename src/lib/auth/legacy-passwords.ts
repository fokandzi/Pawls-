/**
 * Offline protection for legacy unsalted SHA-256 password rows.
 *
 * Login already upgrades a legacy row to scrypt once its owner signs in, but
 * dormant accounts keep a fast, unsalted digest in the database indefinitely.
 * wrapLegacyPasswordHashes() replaces each one with scrypt(sha256hex) — no
 * password needed, no cracking, the owner's password keeps working — using a
 * compare-and-swap UPDATE so a concurrent login upgrade is never overwritten.
 *
 * Reports counts only: never ids, emails or hash material.
 */
import { sql } from "../../db";
import { isLegacySha256Hash, wrapLegacySha256Hash } from "./hash";

export interface WrapReport {
  legacyFound: number;
  wrapped: number;
  skippedConcurrent: number;
  applied: boolean;
}

export async function wrapLegacyPasswordHashes(apply: boolean): Promise<WrapReport> {
  const rows = (await sql()`
    SELECT id, password_hash FROM users WHERE password_hash ~ '^[0-9a-fA-F]{64}$'
  `) as unknown as { id: number; password_hash: string }[];
  const legacy = rows.filter((r) => isLegacySha256Hash(r.password_hash));
  const report: WrapReport = { legacyFound: legacy.length, wrapped: 0, skippedConcurrent: 0, applied: apply };
  if (!apply) return report;
  for (const row of legacy) {
    const wrapped = await wrapLegacySha256Hash(row.password_hash);
    const updated = (await sql()`
      UPDATE users SET password_hash = ${wrapped}, updated_at = NOW()
      WHERE id = ${row.id} AND password_hash = ${row.password_hash}
      RETURNING id
    `) as unknown as unknown[];
    if (updated.length) report.wrapped++;
    else report.skippedConcurrent++;
  }
  return report;
}
