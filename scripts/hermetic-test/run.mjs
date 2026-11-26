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
//   - outbound sockets are refused below fetch too: net.Socket#connect (which
//     carries http/https/tls/undici and therefore the Stripe SDK and the
//     WebSocket-based Neon Pool), dns lookups, the global WebSocket, and
//     child_process spawn/exec (e.g. curl). A self-check proves each guard
//     fires before any suite is imported;
//   - a suite that reads .env (the legacy network-DB suites) is refused.
//
// These are JavaScript-level guards inside this Node process, NOT OS-level
// isolation: native addons, raw process.binding() handles, or code that ran
// before the guards could still open sockets. For a hard guarantee, run the
// runner inside a network-less sandbox (e.g. `docker run --network none`).
import { createRequire, registerHooks, syncBuiltinESMExports } from "node:module";
import net from "node:net";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import childProcess from "node:child_process";
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
  "src/lib/server-fn-auth.test.ts",
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

const blocked = (what) => () => {
  throw new Error(`HERMETIC: ${what} blocked`);
};
net.Socket.prototype.connect = blocked("socket connect (net/tls/http/https/undici)");
dns.lookup = blocked("dns.lookup");
dns.resolve = blocked("dns.resolve");
dns.promises.lookup = async () => blocked("dns.promises.lookup")();
dns.promises.resolve = async () => blocked("dns.promises.resolve")();
globalThis.WebSocket = class {
  constructor() {
    throw new Error("HERMETIC: WebSocket blocked");
  }
};
for (const fn of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) {
  childProcess[fn] = blocked(`child_process.${fn}`);
}
// Make `import { spawn } from "node:child_process"` (named ESM imports) see
// the patched functions too, not only default-object access.
syncBuiltinESMExports();

// Self-check: every guarded path must refuse, or the run aborts.
const probes = {
  fetch: () => fetch("https://example.com"),
  "net.connect": () => net.connect(443, "example.com"),
  "https.request": () => https.request("https://example.com").end(),
  "http.request": () => http.request("http://example.com").end(),
  "dns.promises.lookup": () => dns.promises.lookup("example.com"),
  WebSocket: () => new WebSocket("wss://example.com"),
  "child_process.spawn": () => childProcess.spawn("curl", ["https://example.com"]),
  "named-import spawn": async () => (await import("node:child_process")).spawn("curl", ["https://example.com"]),
  "named-import dns.lookup": async () => (await import("node:dns")).lookup("example.com", () => {}),
};
for (const [name, probe] of Object.entries(probes)) {
  let refused = false;
  try {
    await probe();
  } catch (e) {
    refused = String(e?.message ?? e).includes("HERMETIC");
  }
  if (!refused) throw new Error(`HERMETIC self-check failed: ${name} was not blocked`);
}
console.log(`network guard self-check: ${Object.keys(probes).length}/${Object.keys(probes).length} paths refused (${Object.keys(probes).join(", ")})`);

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
