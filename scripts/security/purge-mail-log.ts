/**
 * mail_log retention sweep: delete delivery records older than N days
 * (default 30 — MAIL_LOG_RETENTION_DAYS in src/lib/auth/mailer.ts).
 * Idempotent; prints the deleted count only. Safe to schedule.
 *
 *   DATABASE_URL=<explicit url> bun run scripts/security/purge-mail-log.ts [days]
 *
 * Does NOT load .env. Logic + tests: src/lib/auth/mailer.ts (purgeMailLog).
 */
import { purgeMailLog } from "../../src/lib/auth/mailer";

if (!process.env.DATABASE_URL || !/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL)) {
  console.error("Refusing: set DATABASE_URL explicitly for the database you intend to change.");
  process.exit(2);
}
const days = Number(process.argv[2] ?? 30);
console.log(JSON.stringify({ deleted: await purgeMailLog(Number.isFinite(days) ? days : 30) }));
