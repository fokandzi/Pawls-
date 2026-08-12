/**
 * Idempotent DDL mirror of src/db/migrations/001_auth_foundation.sql.
 *
 * The pre-SSR handlers (auth-handler.ts, register flow) run before the
 * TanStack SSR layer and must not depend on migrations having been run — so
 * they call ensureAuthTables() once per request, exactly like the existing
 * register-handler/dog-profile-handler pattern (CREATE TABLE IF NOT EXISTS).
 * Migrations remain the canonical, versioned definition; this is a safety net.
 */
import { sql } from "../../db";

let ensured = false;

export async function ensureAuthTables(): Promise<void> {
  if (ensured) return;
  await sql()`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT,
    email_verified_at TIMESTAMPTZ,
    date_of_birth DATE,
    preferred_language TEXT DEFAULT 'fr',
    country TEXT,
    city TEXT,
    timezone TEXT,
    approx_lat DOUBLE PRECISION,
    approx_lng DOUBLE PRECISION,
    is_test BOOLEAN DEFAULT false,
    role TEXT DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ`;
  await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE`;
  await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'fr'`;
  await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT`;
  await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT`;
  await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT`;
  await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS approx_lat DOUBLE PRECISION`;
  await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS approx_lng DOUBLE PRECISION`;
  await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false`;
  await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'`;
  await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`;
  await sql()`CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ,
    ip TEXT,
    user_agent TEXT,
    revoked_at TIMESTAMPTZ
  )`;
  await sql()`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`;
  await sql()`CREATE TABLE IF NOT EXISTS email_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('verify', 'reset')),
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql()`CREATE INDEX IF NOT EXISTS idx_email_tokens_user_id ON email_tokens(user_id)`;
  await sql()`CREATE TABLE IF NOT EXISTS rate_limits (
    id SERIAL PRIMARY KEY,
    action TEXT NOT NULL,
    key TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count INT NOT NULL DEFAULT 1,
    UNIQUE (action, key, window_start)
  )`;
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`;
  await sql()`CREATE INDEX IF NOT EXISTS idx_dog_profiles_user_id ON dog_profiles(user_id)`;
  await sql()`CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    action TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql()`CREATE TABLE IF NOT EXISTS mail_log (
    id SERIAL PRIMARY KEY,
    "to" TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'test',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  ensured = true;
}

export function writeAudit(userId: number | null, action: string, details: Record<string, unknown>): void {
  sql()`
    INSERT INTO audit_log (user_id, action, details)
    VALUES (${userId}, ${action}, ${JSON.stringify(details)}::jsonb)
  `.catch((err) => {
    console.error(`[auth] audit log write failed (action=${action})`, err);
  });
}
