/**
 * Security hardening (branch hardening/claude-parallel-security) — HERMETIC.
 *
 * Runs on the in-process PGlite database from src/test-support/pglite-db.ts,
 * built from the real src/db/migrations (including 011). No network database,
 * no outbound email (RESEND key absent => mailer test mode), no Stripe.
 *
 *   node scripts/hermetic-test/run.mjs          (no Bun needed)
 *   bun test src/lib/auth/security-hardening.test.ts
 *
 * Covers: email-token storage/expiry/single use/cleanup and mail_log
 * redaction; legacy SHA-256 password wrapping + login upgrade; rate-limit
 * registration, per-user isolation and window recovery; account deletion of a
 * provider owner (public listing, contact data, cross-user, repeat deletion).
 */
import { describe, expect, test, beforeAll, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { migrate, pgSql as q, insertUser } from "../../test-support/pglite-db";

mock.module("../../db", () => ({ sql: () => q }));

type Hash = typeof import("./hash");
type Tokens = typeof import("./email-tokens");
type Legacy = typeof import("./legacy-passwords");
type RL = typeof import("./rate-limit");
type Deletion = typeof import("./deletion");
type Session = typeof import("./session");
type Auth = typeof import("../../auth-handler");
type Mailer = typeof import("./mailer");
type Safety = typeof import("../../../safety-api-handler");

let hash: Hash, tokens: Tokens, legacy: Legacy, rl: RL, deletion: Deletion, session: Session, auth: Auth, mailer: Mailer, safety: Safety;
let seq = 0;
const email = (tag: string) => `${tag}-${++seq}@hermetic.example`;

const SITE = "https://pawls.club";
function post(path: string, fields: Record<string, string>, cookie?: string): Request {
  const headers: Record<string, string> = { Origin: SITE, "x-forwarded-for": "203.0.113.7" };
  if (cookie) headers.Cookie = cookie;
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request(`${SITE}${path}`, { method: "POST", headers, body });
}
function jsonPost(path: string, data: unknown, cookie: string): Request {
  return new Request(`${SITE}${path}`, {
    method: "POST",
    headers: { Origin: SITE, "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(data),
  });
}
async function cookieFor(userId: number): Promise<string> {
  const s = await session.createSession(new Request(`${SITE}/`), userId);
  return s.cookieHeader.split(";")[0];
}
async function passwordHashOf(id: number): Promise<string> {
  const [row] = await q`SELECT password_hash FROM users WHERE id = ${id}`;
  return String(row.password_hash);
}

beforeAll(async () => {
  await migrate();
  hash = await import("./hash");
  tokens = await import("./email-tokens");
  legacy = await import("./legacy-passwords");
  rl = await import("./rate-limit");
  deletion = await import("./deletion");
  session = await import("./session");
  auth = await import("../../auth-handler");
  mailer = await import("./mailer");
  safety = await import("../../../safety-api-handler");
});

// ── 1. Email tokens ─────────────────────────────────────────────────────────
describe("email tokens", () => {
  test("only the SHA-256 of a token is stored", async () => {
    const uid = await insertUser(email("tok"));
    const raw = await tokens.issueEmailToken(uid, "verify");
    const rows = await q`SELECT * FROM email_tokens WHERE user_id = ${uid}`;
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(raw);
    expect(rows[0].token_hash).toBe(session.sha256Hex(raw));
  });

  test("single use: second consumption reports 'used'", async () => {
    const uid = await insertUser(email("tok"));
    const raw = await tokens.issueEmailToken(uid, "reset");
    expect(await tokens.consumeEmailToken(raw, "reset")).toEqual({ ok: true, userId: uid });
    expect(await tokens.consumeEmailToken(raw, "reset")).toEqual({ ok: false, reason: "used" });
  });

  test("expired, unknown and wrong-kind tokens are invalid", async () => {
    const uid = await insertUser(email("tok"));
    const raw = await tokens.issueEmailToken(uid, "verify");
    expect(await tokens.consumeEmailToken(raw, "reset")).toEqual({ ok: false, reason: "invalid" });
    await q`UPDATE email_tokens SET expires_at = NOW() - interval '1 second' WHERE user_id = ${uid}`;
    expect(await tokens.consumeEmailToken(raw, "verify")).toEqual({ ok: false, reason: "invalid" });
    expect(await tokens.consumeEmailToken("not-a-real-token", "verify")).toEqual({ ok: false, reason: "invalid" });
  });

  test("concurrent consumption succeeds exactly once", async () => {
    const uid = await insertUser(email("tok"));
    const raw = await tokens.issueEmailToken(uid, "verify");
    const results = await Promise.all([1, 2, 3, 4].map(() => tokens.consumeEmailToken(raw, "verify")));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  test("a new reset link expires the older one; consuming expires siblings", async () => {
    const uid = await insertUser(email("tok"));
    const first = await tokens.issueEmailToken(uid, "reset");
    const second = await tokens.issueEmailToken(uid, "reset");
    expect((await tokens.consumeEmailToken(first, "reset")).ok).toBe(false);
    const v1 = await tokens.issueEmailToken(uid, "verify");
    const v2 = await tokens.issueEmailToken(uid, "verify");
    expect((await tokens.consumeEmailToken(v2, "verify")).ok).toBe(true);
    expect((await tokens.consumeEmailToken(v1, "verify")).ok).toBe(false);
    expect((await tokens.consumeEmailToken(second, "reset")).ok).toBe(true);
  });

  test("cleanup deletes only old expired/used tokens and is idempotent", async () => {
    const uid = await insertUser(email("tok"));
    await tokens.issueEmailToken(uid, "verify");
    const old = await tokens.issueEmailToken(uid, "reset");
    await q`UPDATE email_tokens SET expires_at = NOW() - interval '8 days' WHERE token_hash = ${session.sha256Hex(old)}`;
    const deleted = await tokens.purgeExpiredEmailTokens(7);
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await tokens.purgeExpiredEmailTokens(7)).toBe(0);
    const left = await q`SELECT kind FROM email_tokens WHERE user_id = ${uid}`;
    expect(left.map((r) => r.kind)).toEqual(["verify"]);
  });

  test("mail_log never stores a raw verification link", async () => {
    const to = email("mail");
    const raw = "RAWTOKENvalue_123-abc";
    const res = await mailer.sendMail(mailer.verificationEmail(to, raw));
    expect(res).toEqual({ ok: true, mode: "test" });
    const [row] = await q`SELECT body FROM mail_log WHERE "to" = ${to}`;
    expect(String(row.body)).not.toContain(raw);
    expect(String(row.body)).toContain("token=[redacted]");
  });

  test("migration 011 redacts stored links idempotently and expires live tokens", async () => {
    const to = email("legacy-mail");
    await q`INSERT INTO mail_log ("to", subject, body, mode) VALUES
      (${to}, 's', ${"link https://pawls.club/verify-email?token=AbC_123-x&lang=fr and <a href=\"https://pawls.club/reset-password?token=ZZZ\">"}, 'test')`;
    const uid = await insertUser(email("tok"));
    const raw = await tokens.issueEmailToken(uid, "verify");
    const stmts = readFileSync(join(import.meta.dirname, "..", "..", "db", "migrations", "011_security_hardening.sql"), "utf8")
      .split("\n").filter((l) => !/^\s*--/.test(l)).join("\n").split(";").map((s) => s.trim()).filter(Boolean);
    for (let pass = 0; pass < 2; pass++) for (const s of stmts) await q.query(s);
    const [row] = await q`SELECT body FROM mail_log WHERE "to" = ${to}`;
    expect(String(row.body)).toBe(
      'link https://pawls.club/verify-email?token=[redacted]&lang=fr and <a href="https://pawls.club/reset-password?token=[redacted]">',
    );
    expect((await tokens.consumeEmailToken(raw, "verify")).ok).toBe(false);
  });

  test("POST /auth/verify-email: valid link signs in once, replay is refused", async () => {
    const uid = await insertUser(email("verify"));
    const raw = await tokens.issueEmailToken(uid, "verify");
    const ok = await auth.handleAuthPost(post("/auth/verify-email", { token: raw }));
    expect(ok.status).toBe(302);
    expect(ok.headers.get("set-cookie") ?? "").toContain("=");
    const [u] = await q`SELECT email_verified_at FROM users WHERE id = ${uid}`;
    expect(u.email_verified_at).toBeTruthy();
    const replay = await auth.handleAuthPost(post("/auth/verify-email", { token: raw }));
    expect(replay.status).toBe(404);
  });
});

// ── 2. Legacy passwords ─────────────────────────────────────────────────────
describe("legacy SHA-256 passwords", () => {
  test("a wrapped digest verifies the original password and nothing else", async () => {
    const wrapped = await hash.wrapLegacySha256Hash(hash.legacySha256("correct horse"));
    expect(wrapped.startsWith("sha256-scrypt$")).toBe(true);
    expect(await hash.verifyPassword("correct horse", wrapped)).toBe(true);
    expect(await hash.verifyPassword("wrong horse", wrapped)).toBe(false);
    expect(hash.needsRehash(wrapped)).toBe(true);
    expect(hash.needsRehash(await hash.hashPassword("x".repeat(12)))).toBe(false);
  });

  test("wrapping: dry run counts, apply wraps, re-run is a no-op, modern rows untouched", async () => {
    const modernId = await insertUser(email("modern"), { passwordHash: await hash.hashPassword("modern-password-1") });
    const modernBefore = await passwordHashOf(modernId);
    const legacyId = await insertUser(email("legacy"), { passwordHash: hash.legacySha256("old-password-1") });
    const dry = await legacy.wrapLegacyPasswordHashes(false);
    expect(dry.legacyFound).toBeGreaterThanOrEqual(1);
    expect(await passwordHashOf(legacyId)).toBe(hash.legacySha256("old-password-1"));
    const applied = await legacy.wrapLegacyPasswordHashes(true);
    expect(applied.wrapped).toBe(dry.legacyFound);
    expect((await legacy.wrapLegacyPasswordHashes(true)).legacyFound).toBe(0);
    expect((await passwordHashOf(legacyId)).startsWith("sha256-scrypt$")).toBe(true);
    expect(await passwordHashOf(modernId)).toBe(modernBefore);
  });

  test("login with a wrapped hash: wrong password 401 + unchanged, right password upgrades to scrypt", async () => {
    const addr = email("login-wrapped");
    const uid = await insertUser(addr, { verified: true, passwordHash: await hash.wrapLegacySha256Hash(hash.legacySha256("pw-legacy-123")) });
    const before = await passwordHashOf(uid);
    const bad = await auth.handleAuthPost(post("/auth/login", { email: addr, password: "nope-nope-nope" }));
    expect(bad.status).toBe(401);
    expect(await passwordHashOf(uid)).toBe(before);
    const good = await auth.handleAuthPost(post("/auth/login", { email: addr, password: "pw-legacy-123" }));
    expect(good.status).toBe(302);
    const after = await passwordHashOf(uid);
    expect(after.startsWith("scrypt$")).toBe(true);
    expect(await hash.verifyPassword("pw-legacy-123", after)).toBe(true);
  });

  test("login with a bare legacy hash also upgrades", async () => {
    const addr = email("login-bare");
    const uid = await insertUser(addr, { verified: true, passwordHash: hash.legacySha256("bare-legacy-pw") });
    expect((await auth.handleAuthPost(post("/auth/login", { email: addr, password: "bare-legacy-pw" }))).status).toBe(302);
    expect((await passwordHashOf(uid)).startsWith("scrypt$")).toBe(true);
  });
});

// ── 3. Rate limits ──────────────────────────────────────────────────────────
describe("rate limits", () => {
  test("every action passed to rateLimit() is registered (no silent 5/hour default)", () => {
    const repo = join(import.meta.dirname, "..", "..", "..");
    const files = ["src/auth-handler.ts", "safety-api-handler.ts", "match-api-handler.ts", "booking-api-handler.ts", "provider-api-handler.ts"];
    const used = new Set<string>(["block", "unblock", "unmatch", "resend-verification"]);
    for (const f of files) {
      for (const m of readFileSync(join(repo, f), "utf8").matchAll(/rateLimit\(\s*"([a-z-]+)"/g)) used.add(m[1]);
    }
    for (const action of used) {
      expect(rl.LIMITS[action]).toBeDefined();
      expect(rl.WINDOWS[action]).toBeDefined();
    }
    expect(rl.LIMITS.block).toBe(10);
    expect(rl.LIMITS.unmatch).toBe(10);
  });

  test("limit per user, isolated between users and actions, recovers after the window", async () => {
    for (let i = 0; i < 10; i++) expect((await rl.rateLimit("block", "u9001")).limited).toBe(false);
    const over = await rl.rateLimit("block", "u9001");
    expect(over.limited).toBe(true);
    expect(over.retryAfterSeconds).toBeGreaterThan(0);
    expect((await rl.rateLimit("block", "u9002")).limited).toBe(false);
    expect((await rl.rateLimit("unblock", "u9001")).limited).toBe(false);
    await q`UPDATE rate_limits SET window_start = window_start - interval '2 hours' WHERE action = 'block' AND key = 'u9001'`;
    expect((await rl.rateLimit("block", "u9001")).limited).toBe(false);
  });

  test("message sending allows normal conversation and stops a flood", async () => {
    for (let i = 0; i < 60; i++) expect((await rl.rateLimit("message-send", "u9100")).limited).toBe(false);
    expect((await rl.rateLimit("message-send", "u9100")).limited).toBe(true);
  });

  test("POST /api/safety/block: 10/hour per user, CSRF still enforced", async () => {
    const me = await insertUser(email("blocker"), { verified: true });
    const cookie = await cookieFor(me);
    const targets: number[] = [];
    for (let i = 0; i < 11; i++) targets.push(await insertUser(email("target"), { verified: true }));
    const statuses: number[] = [];
    for (const t of targets) statuses.push((await safety.handleSafetyApi(jsonPost("/api/safety/block", { userId: t }, cookie))).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    const crossSite = new Request(`${SITE}/api/safety/unblock`, {
      method: "POST",
      headers: { Origin: "https://evil.example", "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ userId: targets[0] }),
    });
    expect((await safety.handleSafetyApi(crossSite)).status).toBe(403);
    expect((await safety.handleSafetyApi(jsonPost("/api/safety/unblock", { userId: targets[0] }, cookie))).status).toBe(200);
  });

  test("login: per-account cap holds across rotating IPs", async () => {
    const addr = email("spray");
    await insertUser(addr, { verified: true, passwordHash: await hash.hashPassword("real-password-9") });
    let last = 0;
    for (let i = 0; i < 21; i++) {
      const req = post("/auth/login", { email: addr, password: `guess-${i}-xxxx` });
      req.headers.set("x-forwarded-for", `198.51.100.${i + 1}`);
      last = (await auth.handleAuthPost(req)).status;
    }
    expect(last).toBe(429);
  });
});

// ── 4. Account deletion of a provider owner ─────────────────────────────────
describe("account deletion", () => {
  const PUBLIC_LISTING = `
    SELECT p.id FROM providers p JOIN users u ON u.id = p.owner_user_id
    WHERE p.is_demo = false AND p.approval_status = 'approved' AND p.owner_user_id IS NOT NULL AND u.is_test = false`;

  async function provider(ownerId: number, contact: string): Promise<number> {
    const [p] = await q`
      INSERT INTO providers (name, category, description, location, email, phone, website, image_url, owner_user_id, approval_status, is_demo)
      VALUES ('Biz', 'walker', ${"Call me at " + contact}, 'Paris', ${contact + "@biz.example"}, '+33 6 00 00 00 00',
              'https://biz.example', 'https://img.example/p.jpg', ${ownerId}, 'approved', false)
      RETURNING id`;
    await q`INSERT INTO services (provider_id, name, price_cents, duration_minutes) VALUES (${p.id}, 'Walk', 2000, 60)`;
    return Number(p.id);
  }

  test("provider contact data, listing and services are gone; other users untouched; repeat is safe", async () => {
    const ownerEmail = email("owner");
    const owner = await insertUser(ownerEmail, { verified: true });
    const other = await insertUser(email("other-owner"), { verified: true });
    const pid = await provider(owner, "victim");
    const otherPid = await provider(other, "bystander");
    const customer = await insertUser(email("customer"), { verified: true });
    await q`INSERT INTO bookings (provider_id, customer_name, customer_email, customer_user_id, booking_date, start_time, status)
            VALUES (${otherPid}, 'Owner As Customer', 'changed-address@hermetic.example', ${owner}, CURRENT_DATE, '10:00', 'pending_payment')`;
    await q`INSERT INTO bookings (provider_id, customer_name, customer_email, customer_user_id, booking_date, start_time, status)
            VALUES (${pid}, 'Someone Else', 'someone@hermetic.example', ${customer}, CURRENT_DATE, '11:00', 'pending_payment')`;
    await mailer.sendMail({ to: ownerEmail, subject: "hello", html: "<p>x</p>", text: "x" });

    const listedBefore = (await q.query(PUBLIC_LISTING)).map((r) => Number(r.id));
    expect(listedBefore).toContain(pid);

    const res = await deletion.deleteUserAccount({ id: owner, email: ownerEmail } as any);
    expect(res.ok).toBe(true);

    const [p] = await q`SELECT * FROM providers WHERE id = ${pid}`;
    expect([p.email, p.phone, p.website, p.image_url, p.owner_user_id]).toEqual([null, null, null, null, null]);
    expect(p.description).toBe("");
    expect(p.approval_status).toBe("suspended");
    expect((await q.query(PUBLIC_LISTING)).map((r) => Number(r.id))).not.toContain(pid);
    const services = await q`SELECT is_active FROM services WHERE provider_id = ${pid}`;
    expect(services.every((s) => s.is_active === false)).toBe(true);

    const [asCustomer] = await q`SELECT customer_name, customer_email FROM bookings WHERE provider_id = ${otherPid}`;
    expect(asCustomer).toEqual({ customer_name: "Deleted user", customer_email: "deleted@example.invalid" });
    const [theirs] = await q`SELECT customer_name FROM bookings WHERE provider_id = ${pid}`;
    expect(theirs.customer_name).toBe("Someone Else");

    expect(await q`SELECT 1 FROM mail_log WHERE lower("to") = lower(${ownerEmail})`).toHaveLength(0);

    const [o] = await q`SELECT email, phone, approval_status FROM providers WHERE id = ${otherPid}`;
    expect(o).toEqual({ email: "bystander@biz.example", phone: "+33 6 00 00 00 00", approval_status: "approved" });
    expect((await q.query(PUBLIC_LISTING)).map((r) => Number(r.id))).toContain(otherPid);

    expect((await deletion.deleteUserAccount({ id: owner, email: ownerEmail } as any)).ok).toBe(true);
    const [o2] = await q`SELECT email FROM providers WHERE id = ${otherPid}`;
    expect(o2.email).toBe("bystander@biz.example");
  });

  test("a deleted user's session cannot delete again (401)", async () => {
    const addr = email("twice");
    const uid = await insertUser(addr, { verified: true });
    const cookie = await cookieFor(uid);
    const first = await auth.handleAuthPost(post("/auth/delete-account", { confirmEmail: addr, confirm: "1" }, cookie));
    expect(first.status).toBe(302);
    const again = await auth.handleAuthPost(post("/auth/delete-account", { confirmEmail: addr, confirm: "1" }, cookie));
    expect(again.status).toBe(401);
  });
});
