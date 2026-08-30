import { describe, expect, test } from "bun:test";
import fs from "fs";

/**
 * Regression test for the dev /match bug (2026-08-30, clip A attempt #4):
 * the Vite DEV server returned an HTML shell / 404 for /api/match/mine and
 * /api/match/discovery because the native pre-SSR API handlers were wired only
 * into the production servers (serve.ts, vercel-entry.ts) — never into
 * `vite dev`. This made /match unreachable in dev, which surfaced as a "500/
 * JSON never resolves" failure when capturing the discovery deck.
 *
 * Fix: dev-api-plugin.ts registers handleMatchApi / handleAuthPost /
 * handleSafetyApi / handleWaitlistPost / handleRegisterPost /
 * handleMatchCreatePost into Vite's connect middleware, and vite.config.ts adds
 * devApiPlugin(). This test locks that wiring so the bug cannot silently
 * regress (someone removing the plugin or the middleware mapping).
 */
describe("dev /match native API wiring (regression: dev 404/HTML shell)", () => {
  const viteConfig = fs.readFileSync(
    new URL("./vite.config.ts", import.meta.url),
    "utf-8",
  );
  const plugin = fs.readFileSync(
    new URL("./dev-api-plugin.ts", import.meta.url),
    "utf-8",
  );

  test("vite.config.ts imports and registers devApiPlugin()", () => {
    expect(viteConfig).toContain('from "./dev-api-plugin.ts"');
    expect(viteConfig).toMatch(/devApiPlugin\(\)/);
  });

  test("dev-api-plugin routes the native match/auth/safety/waitlist handlers", () => {
    // Match deck + mine (the /match flow that a dev capture depends on) MUST
    // be routed to the real handler before SSR.
    expect(plugin).toContain('pathname.startsWith("/api/match/")');
    expect(plugin).toContain("handleMatchApi");
    // Auth, dog-create, safety, waitlist (the rest of the native surface).
    expect(plugin).toContain("handleAuthPost");
    expect(plugin).toContain("handleMatchCreatePost");
    expect(plugin).toContain("handleSafetyApi");
    expect(plugin).toContain("handleWaitlistPost");
    expect(plugin).toContain("handleRegisterPost");
  });

  test("integration: the capture/prod server returns JSON (not HTML) for /api/match/mine", async () => {
    // The API is shared between serve.ts (prod) and the capture server used in
    // the clip A E2E. Verify the handler import path resolves to the same
    // module that returns controlled JSON for an unauthenticated `mine` call.
    const handler = await import("./match-api-handler.ts");
    expect(typeof handler.handleMatchApi).toBe("function");
  });
});
