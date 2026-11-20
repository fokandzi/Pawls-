/**
 * F3 — regression test for finding S1: unauthenticated server functions.
 *
 * TanStack `createServerFn` compiles every handler into the deployed server
 * bundle under a PUBLIC id that is also present in the client bundle, and the
 * only thing in front of it is the CSRF middleware — which trusts a
 * caller-written `Origin`/`Sec-Fetch-Site` header. So a server function is a
 * public HTTP endpoint, and any server function that is not guarded inside its
 * own handler is an unauthenticated endpoint.
 *
 * This suite is a STATIC scan (no DB, no network): it fails the build when a
 * new server function ships without a session/ownership/admin check inside the
 * handler, when a public-id endpoint is left behind with no caller, and when
 * DDL or fixture seeding becomes reachable over HTTP again.
 *
 * Run: `bun test src/lib/server-fn-auth.test.ts`
 *      (also part of `bun run test:hermetic`)
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const SRC = join(REPO, "src");

/**
 * Server functions that are PUBLIC BY DESIGN: read-only, no per-user data, no
 * writes. Every one of these is the loader of a page an anonymous visitor must
 * be able to open (the landing page, the Venues map, the Rescue listings, the
 * Book catalogue, the invite/viral share pages). They are listed explicitly so
 * that a NEW server function cannot join them by accident: anything not here
 * and not guarded fails the test.
 */
const PUBLIC_READ_ONLY = new Map<string, string>([
  ["getReferralCount", "public invite page — count of referrals for a shareable code"],
  ["getTrendingDogs", "public viral feed — demo-marked dog profiles only"],
  ["getBusinessName", "reads site.json, no database, no user data"],
  ["resolveRouteLang", "language resolution for SSR, no user data"],
  ["resolveRootLang", "language resolution for the root shell, no user data"],
  ["resolveMatchCreateLang", "language resolution for /match/create, no user data"],
  ["resolveAttribution", "resolves a referral code from the URL on the public join page"],
  ["loadProviders", "public Book catalogue"],
  ["getProviderDetail", "public Book provider page"],
  ["getRealProviderCount", "public Book registration page — count of approved providers"],
  ["getVenues", "public Venues map"],
  ["getRescueDogs", "public Rescue listings"],
  ["getDogDetail", "public Rescue dog page"],
  ["getBreeders", "public Breed listings"],
  ["getBreederDetail", "public Breed breeder page"],
  ["getBreederCount", "public Breed registration page — count of breeders"],
]);

/** Tokens that prove identity is established INSIDE the handler. */
const GUARD_TOKENS = ["requireUser(", "requireAdmin(", "getSessionUser(", "getAuthUser("];

/** Endpoints deleted by F3: none of these may come back as a server function. */
const DELETED_ENDPOINTS = [
  "getWaitlistEmails",
  "subscribeToWaitlist",
  "createWaitlistTable",
  "updateDogSocialLinks",
  "ensureSocialColumns",
  "createBookingTables",
  "createMatchTables",
  "createBreedTables",
  "createVenuesTable",
  "createRescueTables",
  "createReferralsTable",
  "ensureReferralsTable",
  "createConnectTables",
  "createMessagesTable",
  "processReferral",
  "recordReferral",
  "checkPlusStatus",
  "checkSwipeAllowance",
  "deleteAccount",
  "createCheckoutSession",
  "seedProviders",
  "seedDogProfiles",
  "seedBreedersFn",
  "seedRescueData",
  "ensureBreederEmailColumn",
  "ensureBreedTables",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Body of `[async] function name(...) { ... }` in this file, or null. */
function functionBody(src: string, name: string): string | null {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const m = re.exec(src);
  if (!m) return null;
  const open = src.indexOf("{", src.indexOf(")", m.index + m[0].length));
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return null;
}

/**
 * Blank out comments (length-preserving, so offsets still line up) — a mention
 * of `createServerFn` or of DDL in a doc comment is prose, not an endpoint.
 */
function blankComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:\w])\/\/[^\n]*/g, (m, pre) => pre + m.slice(pre.length).replace(/[^\n]/g, " "));
}

/** Strip comments so a mention of DDL/seeding in prose is not a finding. */
function stripComments(text: string): string {
  return blankComments(text);
}

/** The full `const NAME = createServerFn(...)...;` statement text. */
function statementAt(src: string, from: number): string {
  let depth = 0;
  let inTemplate = false;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (inTemplate) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === "`") inTemplate = false;
      continue;
    }
    if (c === "`") {
      inTemplate = true;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === ";" && depth === 0) return src.slice(from, i + 1);
  }
  return src.slice(from);
}

type ServerFn = { file: string; name: string; text: string; src: string };

function serverFunctions(): ServerFn[] {
  const found: ServerFn[] = [];
  for (const file of walk(SRC)) {
    const src = blankComments(readFileSync(file, "utf8"));
    const re = /(?:export\s+)?const\s+(\w+)\s*=\s*createServerFn\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      found.push({
        file: relative(REPO, file),
        name: m[1],
        text: statementAt(src, m.index),
        src,
      });
    }
  }
  return found;
}

const FUNCTIONS = serverFunctions();

describe("F3 — no server function is an unauthenticated endpoint", () => {
  test("the scan actually sees the server functions (guards against a silent no-op)", () => {
    expect(FUNCTIONS.length).toBeGreaterThan(10);
    expect(FUNCTIONS.map((f) => f.name)).toContain("createBooking");
    expect(FUNCTIONS.map((f) => f.name)).not.toContain("getWaitlistEmails");
  });

  test("every server function is guarded inside its handler or listed as public read-only", () => {
    const unguarded: string[] = [];
    for (const fn of FUNCTIONS) {
      if (GUARD_TOKENS.some((t) => fn.text.includes(t))) continue;
      // A handler may delegate to a core function in the same file; the guard
      // must then be inside THAT function (bookings.ts / booking-success.tsx).
      const called = new Set([...fn.text.matchAll(/(\w+)\s*\(/g)].map((x) => x[1]));
      const delegatedGuard = [...called].some((name) => {
        const body = functionBody(fn.src, name);
        return body !== null && GUARD_TOKENS.some((t) => body.includes(t));
      });
      if (delegatedGuard) continue;
      if (PUBLIC_READ_ONLY.has(fn.name)) continue;
      unguarded.push(`${fn.file}: ${fn.name}`);
    }
    expect(unguarded).toEqual([]);
  });

  test("the public read-only allowlist has no stale entries", () => {
    const names = new Set(FUNCTIONS.map((f) => f.name));
    const stale = [...PUBLIC_READ_ONLY.keys()].filter((n) => !names.has(n));
    expect(stale).toEqual([]);
  });

  test("no server function runs DDL", () => {
    const ddl = FUNCTIONS.filter((fn) =>
      /CREATE\s+(TABLE|INDEX|UNIQUE\s+INDEX)|ALTER\s+TABLE|DROP\s+(TABLE|COLUMN)/i.test(
        stripComments(fn.text),
      ),
    ).map((fn) => `${fn.file}: ${fn.name}`);
    expect(ddl).toEqual([]);
  });

  test("no server function seeds fixtures or inserts providers/dogs/shelters", () => {
    const seeding = FUNCTIONS.filter((fn) =>
      /assertNotProductionSeeding\s*\(|INSERT\s+INTO\s+(providers|dog_profiles|shelters|rescue_dogs|venues)\b/.test(
        stripComments(fn.text),
      ),
    ).map((fn) => `${fn.file}: ${fn.name}`);
    expect(seeding).toEqual([]);
  });

  test("the deleted endpoints are gone for good", () => {
    const names = FUNCTIONS.map((f) => f.name);
    const resurrected = DELETED_ENDPOINTS.filter((n) => names.includes(n));
    expect(resurrected).toEqual([]);
  });

  test("the DDL/seed hand-run script stays outside src (never bundled)", () => {
    const script = readFileSync(join(REPO, "scripts/db-maintenance.ts"), "utf8");
    expect(/createServerFn\s*\(/.test(script)).toBe(false);
    expect(script).toContain("assertNotProductionSeeding");
  });
});
