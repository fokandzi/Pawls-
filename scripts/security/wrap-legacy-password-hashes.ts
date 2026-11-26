/**
 * Wrap legacy unsalted SHA-256 password rows in scrypt (no password needed).
 * Dry run by default; --apply writes. Prints counts only.
 *
 *   DATABASE_URL=<explicit url> bun run scripts/security/wrap-legacy-password-hashes.ts [--apply]
 *
 * Does NOT load .env. Logic + tests: src/lib/auth/legacy-passwords.ts.
 */
import { wrapLegacyPasswordHashes } from "../../src/lib/auth/legacy-passwords";

if (!process.env.DATABASE_URL || !/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL)) {
  console.error("Refusing: set DATABASE_URL explicitly for the database you intend to change.");
  process.exit(2);
}
const report = await wrapLegacyPasswordHashes(process.argv.includes("--apply"));
console.log(JSON.stringify(report));
