/**
 * Hermetic test database — an in-process PGlite Postgres built from the real
 * src/db/migrations, behind the same surface as neon(): a tagged template that
 * resolves to rows, `.query(text, params)`, and the function form of
 * `.transaction(tx => [...])` that src/lib/* uses.
 *
 * It NEVER reads DATABASE_URL and opens no network connection, so a suite built
 * on it cannot reach the production Neon database (the four legacy suites in
 * src/db/*.test.ts do: they load .env and write to the shared dev/prod DB).
 *
 * Wiring:
 *   - node scripts/hermetic-test/run.mjs redirects every import of src/db.ts to
 *     this module at resolve time;
 *   - under `bun test`, the suite calls mock.module("../../db", ...) itself.
 */
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Row = Record<string, any>;
interface PendingQuery {
  text: string;
  values: unknown[];
}

export const pg = new PGlite();

function build(strings: TemplateStringsArray, values: unknown[]): PendingQuery {
  let text = "";
  strings.forEach((s, i) => {
    text += s;
    if (i < values.length) text += `$${i + 1}`;
  });
  return { text, values };
}

function txTag(strings: TemplateStringsArray, ...values: unknown[]): PendingQuery {
  return build(strings, values);
}

function tag(strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]> {
  const q = build(strings, values);
  return pg.query(q.text, q.values as any[]).then((r) => r.rows as Row[]);
}
tag.query = (text: string, params: unknown[] = []): Promise<Row[]> =>
  pg.query(text, params as any[]).then((r) => r.rows as Row[]);
tag.transaction = async (fn: (tx: typeof txTag) => PendingQuery[]): Promise<Row[][]> => {
  const items = fn(txTag);
  return pg.transaction(async (tx) => {
    const out: Row[][] = [];
    for (const q of items) out.push((await tx.query(q.text, q.values as any[])).rows as Row[]);
    return out;
  });
};

/** Drop-in for `sql` from src/db.ts. */
export const sql = () => tag;
export const pgSql = tag;

let migrated: Promise<void> | null = null;

/** Apply every migration once, split exactly like scripts/migrate.ts does. */
export function migrate(): Promise<void> {
  if (!migrated) {
    migrated = (async () => {
      const dir = join(import.meta.dirname, "..", "db", "migrations");
      for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
        const text = readFileSync(join(dir, file), "utf8")
          .split("\n")
          .filter((line) => !/^\s*--/.test(line))
          .join("\n");
        for (const stmt of text.split(";").map((s) => s.trim()).filter(Boolean)) {
          await pg.query(stmt);
        }
      }
    })();
  }
  return migrated;
}

/** A synthetic user row; returns its id. */
export async function insertUser(
  email: string,
  opts: { passwordHash?: string | null; verified?: boolean; isTest?: boolean; name?: string } = {},
): Promise<number> {
  const [row] = await tag`
    INSERT INTO users (email, name, password_hash, email_verified_at, is_test, role)
    VALUES (${email}, ${opts.name ?? "Hermetic User"}, ${opts.passwordHash ?? null},
            ${opts.verified ? new Date().toISOString() : null}, ${opts.isTest ?? false}, 'user')
    RETURNING id
  `;
  return Number(row.id);
}
