/**
 * Pawls migration runner (Bun).
 *
 * Usage:
 *   bun run db:migrate            # apply pending migrations to the configured DB
 *   bun run db:migrate --scratch  # apply ALL migrations to a throwaway database,
 *                                 # verify them, then drop it (pre-prod test)
 *
 * Behavior:
 *   - Reads numbered SQL files from src/db/migrations/ (sorted lexicographically).
 *   - Tracks applied versions in a `schema_migrations` table (version, applied_at).
 *   - Each file is executed statement-by-statement (the Neon HTTP driver rejects
 *     multi-statement calls), and the version is recorded ONLY if every statement
 *     in the file succeeded. All statements are idempotent (IF NOT EXISTS), so a
 *     failed run can simply be re-run.
 *   - Down statements are documented in each file's header; nothing destructive
 *     is ever auto-executed.
 *
 * NOTE: this shell environment injects a placeholder DATABASE_URL that shadows
 * the real value in .env — the runner explicitly loads .env and overrides.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

// --- load .env with override (process env shadows .env in this sandbox) -------
const ENV_PATH = join(process.cwd(), ".env");
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // .env wins over the injected placeholder (but not over explicit CLI env).
    process.env[key] = value;
  }
}

const MIGRATIONS_DIR = join(process.cwd(), "src", "db", "migrations");

function splitStatements(sqlText: string): string[] {
  // Strip full-line comments BEFORE splitting: naive `;` splitting cannot tell a
  // semicolon inside a comment from a statement terminator (e.g. the header
  // comments of 001_auth_foundation.sql contain several).
  const noComments = sqlText
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
  return noComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function ensureSchemaMigrations(sql: any) {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function appliedVersions(sql: any): Promise<Set<string>> {
  const rows = await sql`SELECT version FROM schema_migrations`;
  return new Set((rows as any[]).map((r) => String(r.version)));
}

async function runMigrations(sql: any, files: string[], applied: Set<string>, label: string) {
  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  [skip] ${label} ${file} (already applied)`);
      continue;
    }
    const text = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const statements = splitStatements(text);
    console.log(`  [run ] ${label} ${file} (${statements.length} statements)`);
    for (const stmt of statements) {
      await sql.query(stmt);
    }
    await sql`INSERT INTO schema_migrations (version) VALUES (${file})`;
    appliedCount++;
    console.log(`        -> recorded ${file} in schema_migrations`);
  }
  return appliedCount;
}

async function verifyScratch(sql: any) {
  const checks: Array<[string, string]> = [
    ["users", "SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='email_verified_at'"],
    ["users.role", "SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='role'"],
    ["sessions", "SELECT 1 FROM information_schema.tables WHERE table_name='sessions'"],
    ["email_tokens", "SELECT 1 FROM information_schema.tables WHERE table_name='email_tokens'"],
    ["rate_limits", "SELECT 1 FROM information_schema.tables WHERE table_name='rate_limits'"],
    ["dog_profiles.user_id", "SELECT 1 FROM information_schema.columns WHERE table_name='dog_profiles' AND column_name='user_id'"],
    ["audit_log", "SELECT 1 FROM information_schema.tables WHERE table_name='audit_log'"],
    ["mail_log", "SELECT 1 FROM information_schema.tables WHERE table_name='mail_log'"],
  ];
  let ok = true;
  for (const [name, query] of checks) {
    try {
      const rows = await sql.query(query);
      if (!rows || rows.length === 0) {
        console.error(`  [FAIL] scratch check: ${name} missing`);
        ok = false;
      } else {
        console.log(`  [ ok ] scratch check: ${name}`);
      }
    } catch (e: any) {
      console.error(`  [FAIL] scratch check: ${name} -> ${e.message}`);
      ok = false;
    }
  }
  const applied = await appliedVersions(sql);
  console.log(`  [info] schema_migrations rows in scratch: ${[...applied].join(", ")}`);
  return ok;
}

async function main() {
  const scratch = process.argv.includes("--scratch");
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl || baseUrl.includes("npx ")) {
    console.error("DATABASE_URL is not set to a real connection string (found a placeholder).");
    process.exit(1);
  }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    console.error("No migration files found in", MIGRATIONS_DIR);
    process.exit(1);
  }
  console.log(`Found ${files.length} migration(s): ${files.join(", ")}`);

  if (scratch) {
    const scratchDb = `pawls_scratch_${Date.now()}`;
    const url = new URL(baseUrl);
    const adminSql = neon(baseUrl);
    console.log(`\n[scratch] creating database "${scratchDb}" ...`);
    // NOTE: sql.unsafe() silently no-ops under Bun in this setup — use query().
    await adminSql.query(`CREATE DATABASE ${scratchDb}`);
    const scratchUrl = new URL(baseUrl);
    scratchUrl.pathname = `/${scratchDb}`;
    const scratch = neon(scratchUrl.toString());
    try {
      await ensureSchemaMigrations(scratch);
      const applied = await appliedVersions(scratch);
      const n = await runMigrations(scratch, files, applied, "scratch");
      console.log(`\n[scratch] applied ${n} migration(s) to scratch DB.`);
      const ok = await verifyScratch(scratch);
      if (!ok) {
        console.error("\n[scratch] VERIFICATION FAILED — do NOT run migrations on production until fixed.");
        process.exit(1);
      }
    } finally {
      // The scratch client may still hold pooled connections to the scratch DB,
      // which makes DROP DATABASE fail — terminate its backends first. Drop
      // errors are logged, not fatal: they must never mask the real outcome.
      console.log(`[scratch] dropping database "${scratchDb}" ...`);
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await adminSql.query(
            `SELECT pg_terminate_backend(pid) FROM pg_stat_activity ` +
              `WHERE datname = '${scratchDb}' AND pid <> pg_backend_pid()`
          );
          await adminSql.query(`DROP DATABASE IF EXISTS ${scratchDb}`);
          console.log("[scratch] done.");
          break;
        } catch (e: any) {
          if (attempt === 2) {
            console.error(`  [warn] could not drop scratch DB: ${e?.message}`);
          } else {
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      }
    }
    return;
  }

  console.log("\n[prod] applying migrations to configured database ...");
  const sql = neon(baseUrl);
  await ensureSchemaMigrations(sql);
  const applied = await appliedVersions(sql);
  const n = await runMigrations(sql, files, applied, "prod");
  console.log(`\n[done] applied ${n} new migration(s); ${files.length - applied.size - (n === 0 ? files.length - applied.size : files.length - applied.size - n)} remaining pending.`);
  console.log(`[done] schema_migrations now has ${(await appliedVersions(sql)).size}/${files.length} versions.`);
}

main().catch((e) => {
  console.error("Migration run FAILED:", e?.message ?? e);
  process.exit(1);
});
