/**
 * Read-only security audit — aggregate COUNTS only, for verifying the
 * findings in docs/security-hardening/ against a real database before and
 * after migration 011. Never prints ids, emails, hashes, tokens or bodies.
 *
 *   DATABASE_URL=<explicit url> bun run scripts/security/readonly-security-audit.ts
 *
 * Does NOT load .env (the target database must be chosen on purpose) and runs
 * every query inside a READ ONLY transaction.
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url || !/^postgres(ql)?:\/\//.test(url)) {
  console.error("Refusing: set DATABASE_URL explicitly for the database you intend to audit.");
  process.exit(2);
}
const sql = neon(url);

const TOKEN_RE = `'[?&]token=[^&[:space:]"''<>\\[]'`;
const checks: [string, string][] = [
  ["users with bare legacy sha256 password_hash", `SELECT COUNT(*)::int AS n FROM users WHERE password_hash ~ '^[0-9a-fA-F]{64}$'`],
  ["users with scrypt-wrapped legacy hash", `SELECT COUNT(*)::int AS n FROM users WHERE password_hash LIKE 'sha256-scrypt$%'`],
  ["users with scrypt hash", `SELECT COUNT(*)::int AS n FROM users WHERE password_hash LIKE 'scrypt$%'`],
  ["mail_log rows holding an unredacted ?token=", `SELECT COUNT(*)::int AS n FROM mail_log WHERE body ~ ${TOKEN_RE}`],
  ["  ...of which mode='test'", `SELECT COUNT(*)::int AS n FROM mail_log WHERE mode = 'test' AND body ~ ${TOKEN_RE}`],
  ["  ...of which mode='prod'", `SELECT COUNT(*)::int AS n FROM mail_log WHERE mode = 'prod' AND body ~ ${TOKEN_RE}`],
  ["email_tokens currently valid (unused, unexpired)", `SELECT COUNT(*)::int AS n FROM email_tokens WHERE used_at IS NULL AND expires_at > NOW()`],
  ["email_tokens expired or used > 7 days ago (purgeable)", `SELECT COUNT(*)::int AS n FROM email_tokens WHERE expires_at < NOW() - interval '7 days' OR used_at < NOW() - interval '7 days'`],
  ["non-demo providers with NO owner but contact data", `SELECT COUNT(*)::int AS n FROM providers WHERE is_demo = false AND owner_user_id IS NULL AND (email IS NOT NULL OR phone IS NOT NULL OR website IS NOT NULL)`],
  ["  ...of which approval_status='approved'", `SELECT COUNT(*)::int AS n FROM providers WHERE is_demo = false AND owner_user_id IS NULL AND approval_status = 'approved' AND (email IS NOT NULL OR phone IS NOT NULL OR website IS NOT NULL)`],
  ["database roles that can log in", `SELECT COUNT(*)::int AS n FROM pg_roles WHERE rolcanlogin`],
  ["public tables", `SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname = 'public'`],
  ["  ...owned by the connecting role (RLS-exempt unless FORCEd)", `SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user`],
  ["connecting role is superuser or can create roles (0 = no)", `SELECT COUNT(*)::int AS n FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolcreaterole)`],
  ["public tables with row level security enabled", `SELECT COUNT(*)::int AS n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity`],
];

const results = await sql.transaction(
  checks.map(([, q]) => sql.query(q)),
  { readOnly: true },
);
checks.forEach(([label], i) => {
  const rows = results[i] as unknown as { n: number }[];
  console.log(`${String(rows?.[0]?.n ?? "?").padStart(6)}  ${label}`);
});
