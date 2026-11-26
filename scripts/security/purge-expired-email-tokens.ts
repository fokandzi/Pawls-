/**
 * Delete email tokens that expired or were used more than N days ago
 * (default 7). Idempotent; prints the deleted count only. Safe to schedule.
 *
 *   DATABASE_URL=<explicit url> bun run scripts/security/purge-expired-email-tokens.ts [days]
 *
 * Does NOT load .env. Logic + tests: src/lib/auth/email-tokens.ts.
 */
import { purgeExpiredEmailTokens } from "../../src/lib/auth/email-tokens";

if (!process.env.DATABASE_URL || !/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL)) {
  console.error("Refusing: set DATABASE_URL explicitly for the database you intend to change.");
  process.exit(2);
}
const days = Number(process.argv[2] ?? 7);
console.log(JSON.stringify({ deleted: await purgeExpiredEmailTokens(Number.isFinite(days) ? days : 7) }));
