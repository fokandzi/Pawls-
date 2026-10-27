#!/usr/bin/env node
// Hermetic test runner — runs bun:test-style suites under Node with NO network
// database, NO outbound fetch and NO provider credentials.
//
//   node scripts/hermetic-test/run.mjs [suite.test.ts ...]
//
// Fail-closed guarantees (checked before any suite is imported):
//   - every DB / Stripe / Resend / Uploadthing / Neon / Vercel variable is
//     removed from the environment, and DATABASE_URL is replaced by an
//     unroutable sentinel, so a stray neon() call cannot reach a real database;
//   - src/db.ts is redirected to src/test-support/pglite-db.ts (in-process);
//   - globalThis.fetch throws, so no email/payment/upload provider is called;
//   - a suite that reads .env (the legacy network-DB suites) is refused.
import { createRequire, registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");

const DEFAULT_SUITES = [
  "src/lib/auth/security-hardening.test.ts",
  "src/lib/launch-fixes.test.ts",
  "src/lib/match-ui.test.ts",
  "src/lib/seo-titles.test.ts",
];

const SENSITIVE = /DATABASE|^PG|NEON|STRIPE|RESEND|UPLOADTHING|REVENUECAT|POSTHOG|VERCEL|MAIL_FROM|ATTRIBUTION/i;
for (const key of Object.keys(process.env)) if (SENSITIVE.test(key)) delete process.env[key];
process.env.DATABASE_URL = "postgres://hermetic-sentinel.invalid:1/never";
process.env.NODE_ENV = "test";

// Bun allows require() inside ES modules (src/lib/auth/session.ts uses it for
// node:crypto); Node does not, so provide the same global.
globalThis.require = createRequire(import.meta.url);

globalThis.fetch = async (input) => {
  throw new Error(`HERMETIC: outbound fetch blocked (${String(input).split("?")[0]})`);
};

const shimUrl = pathToFileURL(join(here, "bun-test-shim.mjs")).href;
const dbUrl = pathToFileURL(join(repo, "src", "db.ts")).href;
const testDbUrl = pathToFileURL(join(repo, "src", "test-support", "pglite-db.ts")).href;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "bun:test") return { url: shimUrl, shortCircuit: true };
    const candidates = [specifier];
    if ((specifier.startsWith(".") || specifier.startsWith("/")) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      candidates.push(`${specifier}.ts`, `${specifier}/index.ts`);
    }
    let lastErr;
    for (const c of candidates) {
      try {
        const r = next(c, context);
        if (r.url === dbUrl) return { url: testDbUrl, shortCircuit: true };
        return r;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  },
  // Bun exposes `import.meta.dir`; Node calls it `import.meta.dirname`.
  load(url, context, next) {
    const r = next(url, context);
    if (url.startsWith("file:") && /\.tsx?$/.test(url) && r.source) {
      const text = typeof r.source === "string" ? r.source : Buffer.from(r.source).toString("utf8");
      if (/import\.meta\.dir\b/.test(text)) return { ...r, source: text.replace(/import\.meta\.dir\b/g, "import.meta.dirname") };
    }
    return r;
  },
});

const suites = (process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_SUITES).map((s) => resolve(repo, s));
for (const file of suites) {
  if (!existsSync(file)) throw new Error(`HERMETIC: no such suite ${file}`);
  if (/["'`]\.env|DATABASE_URL/.test(readFileSync(file, "utf8"))) {
    throw new Error(`HERMETIC: refusing ${file} — it reads .env / DATABASE_URL (network database suite)`);
  }
}

const shim = await import(shimUrl);
for (const file of suites) await import(pathToFileURL(file).href);
const results = await shim.runAll();

let failed = 0;
let skipped = 0;
for (const r of results) {
  if (r.skipped) {
    skipped++;
    console.log(`  skip  ${r.name}`);
  } else if (r.ok) console.log(`  pass  ${r.name}`);
  else {
    failed++;
    console.log(`  FAIL  ${r.name}\n        ${String(r.error?.stack ?? r.error).split("\n").slice(0, 4).join("\n        ")}`);
  }
}
const passed = results.length - failed - skipped;
console.log(`\n${passed} pass, ${failed} fail, ${skipped} skip (${suites.length} files, hermetic: PGlite, no network)`);
process.exit(failed ? 1 : 0);
