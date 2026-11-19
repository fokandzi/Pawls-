/**
 * Unit tests for the Phase 2B launch fixes (audit §A, §B).
 *
 * Run: `bun test src/lib/launch-fixes.test.ts`
 *
 * These cover the PURE decision points — no DB, no network, no Uploadthing call:
 *   - the unverified-login gate (both branches, incl. the flip when mail lands);
 *   - the v7 token shape check (missing / malformed / v6 alias / valid);
 *   - the INVALID_SERVER_CONFIG → 503 mapping (no more "retry in a moment").
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { t } from "./i18n";
import { verificationGate } from "./auth/login-gate";
import {
  decodeUploadthingToken,
  dogPhotoTokenState,
  isDogPhotoUploadConfigured,
  mapUploadthingError,
} from "./dog-photo";

// ── 1. Unverified-login gate (P0) ────────────────────────────────────────────
describe("verificationGate", () => {
  test("verified account always logs in", () => {
    expect(verificationGate({ emailVerifiedAt: "2026-10-01T10:00:00Z", mailConfigured: true })).toBe(
      "verified",
    );
    expect(verificationGate({ emailVerifiedAt: "2026-10-01T10:00:00Z", mailConfigured: false })).toBe(
      "verified",
    );
  });

  test("mail configured + unverified → login blocked (403 branch, no session)", () => {
    expect(verificationGate({ emailVerifiedAt: null, mailConfigured: true })).toBe("block-unverified");
    expect(verificationGate({ emailVerifiedAt: undefined, mailConfigured: true })).toBe(
      "block-unverified",
    );
  });

  test("mail NOT configured + unverified → login allowed (today's reality)", () => {
    // Without RESEND_API_KEY nobody could ever verify, so blocking would lock
    // every user out. The signed-in UI shows the truthful unverified banner.
    expect(verificationGate({ emailVerifiedAt: null, mailConfigured: false })).toBe("allow-unverified");
  });
});

// ── 2. Uploadthing v7 token shape (P0-adjacent) ──────────────────────────────
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64");

describe("decodeUploadthingToken", () => {
  test("a real v7 shape is accepted", () => {
    const state = decodeUploadthingToken(b64({ apiKey: "api_abc", appId: "app_abc", regions: ["eu"] }));
    expect(state.kind).toBe("ok");
  });

  test("a non-base64 placeholder is malformed, not 'configured'", () => {
    const state = decodeUploadthingToken("not-a-token-at-all-".repeat(9));
    expect(state.kind).toBe("malformed");
  });

  test("base64 that is not JSON is malformed", () => {
    const state = decodeUploadthingToken(Buffer.from("hello world", "utf8").toString("base64"));
    expect(state.kind).toBe("malformed");
  });

  test("JSON missing appId is malformed", () => {
    const state = decodeUploadthingToken(b64({ apiKey: "api_abc", regions: ["eu"] }));
    expect(state.kind).toBe("malformed");
  });

  test("empty value is reported as missing", () => {
    expect(decodeUploadthingToken("   ").kind).toBe("missing");
  });
});

describe("dogPhotoTokenState / isDogPhotoUploadConfigured", () => {
  const withEnv = (env: Record<string, string | undefined>, fn: () => void) => {
    const saved: Record<string, string | undefined> = {};
    for (const key of ["UPLOADTHING_TOKEN", "UPLOADTHING_SECRET"]) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    Object.assign(process.env, env);
    try {
      fn();
    } finally {
      for (const key of ["UPLOADTHING_TOKEN", "UPLOADTHING_SECRET"]) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  };

  test("absent variable → missing → not configured", () => {
    withEnv({}, () => {
      expect(dogPhotoTokenState().kind).toBe("missing");
      expect(isDogPhotoUploadConfigured()).toBe(false);
    });
  });

  test("v6 UPLOADTHING_SECRET alone → malformed with an actionable reason (never used)", () => {
    withEnv({ UPLOADTHING_SECRET: "sk_live_v6_style_secret" }, () => {
      const state = dogPhotoTokenState();
      expect(state.kind).toBe("malformed");
      if (state.kind === "malformed") expect(state.reason).toContain("UPLOADTHING_TOKEN");
      expect(isDogPhotoUploadConfigured()).toBe(false);
    });
  });

  test("wrong-shaped UPLOADTHING_TOKEN → malformed → not configured", () => {
    withEnv({ UPLOADTHING_TOKEN: "x".repeat(187) }, () => {
      expect(dogPhotoTokenState().kind).toBe("malformed");
      expect(isDogPhotoUploadConfigured()).toBe(false);
    });
  });

  test("valid v7 token → ok → configured", () => {
    withEnv({ UPLOADTHING_TOKEN: b64({ apiKey: "api_abc", appId: "app_abc", regions: ["eu"] }) }, () => {
      expect(dogPhotoTokenState().kind).toBe("ok");
      expect(isDogPhotoUploadConfigured()).toBe(true);
    });
  });
});

// ── 3. SDK error mapping ─────────────────────────────────────────────────────
describe("mapUploadthingError", () => {
  test("INVALID_SERVER_CONFIG → 503 not-configured (retrying cannot help)", () => {
    const failure = mapUploadthingError({
      code: "INVALID_SERVER_CONFIG",
      message: "Invalid token. A token is a base64 encoded JSON object …",
    });
    expect(failure.status).toBe(503);
    expect(failure.titleKey).toBe("photo.err.notConfiguredTitle");
    expect(failure.bodyKey).toBe("photo.err.notConfiguredBody");
  });

  test("a genuine upload error stays a 502 'try again'", () => {
    const failure = mapUploadthingError({ code: "UPLOAD_FAILED", message: "network" });
    expect(failure.status).toBe(502);
    expect(failure.titleKey).toBe("photo.err.uploadFailedTitle");
  });

  test("an unknown thrown value still maps to 502 (never a false success)", () => {
    const failure = mapUploadthingError(new Error("boom"));
    expect(failure.ok).toBe(false);
    expect(failure.status).toBe(502);
  });
});

// ── 4. Batch F1: /book/my-bookings?error=RATE_LIMITED notice ─────────────────
describe("my-bookings RATE_LIMITED notice (F1-1)", () => {
  const route = readFileSync(join(import.meta.dirname, "..", "routes", "book.my-bookings.tsx"), "utf8");
  const noticeList = route.slice(route.indexOf("const NOTICE_CODES"), route.indexOf("] as const;"));

  test("RATE_LIMITED is an accepted notice code (else the 303 renders nothing)", () => {
    expect(noticeList).toContain('"RATE_LIMITED"');
  });

  test("every accepted code has FR-first copy in both dictionaries", () => {
    const codes = [...noticeList.matchAll(/"([A-Za-z_]+)"/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      const fr = t(`myBookings.notice.${code}`, "fr");
      const en = t(`myBookings.notice.${code}`, "en");
      expect(fr).not.toBe(`myBookings.notice.${code}`);
      expect(en).not.toBe(`myBookings.notice.${code}`);
      expect(fr).not.toBe(en);
    }
  });

  test("the FR rate-limit notice says nothing was changed and to try again", () => {
    const fr = t("myBookings.notice.RATE_LIMITED", "fr");
    expect(fr).toContain("rien n'a été modifié");
    expect(fr.toLowerCase()).toContain("réessayez");
  });
});

// ── 5. Batch F1: messaging 429 copy reaches the thread UI (F1-3) ─────────────
describe("conversation thread 429 copy (F1-3)", () => {
  const route = readFileSync(join(import.meta.dirname, "..", "routes", "match.conversations_.$id.tsx"), "utf8");

  test("FR-first: both languages have a dedicated rate-limit line", () => {
    const fr = t("msg.tooMany", "fr");
    const en = t("msg.tooMany", "en");
    expect(fr).not.toBe("msg.tooMany");
    expect(en).not.toBe("msg.tooMany");
    expect(fr).not.toBe(en);
    expect(fr.toLowerCase()).toContain("patientez");
  });

  test("a 429 selects msg.tooMany, everything else keeps the generic line", () => {
    expect(route).toContain('res.status === 429 ? "rate" : "generic"');
    expect(route).toContain('t(sendError === "rate" ? "msg.tooMany" : "msg.sendFailed", L)');
  });

  test("typed text is preserved on failure (cleared only on success)", () => {
    const clear = route.indexOf('setNewMsg("")');
    const fail = route.indexOf("setSendError(res.status === 429");
    expect(fail).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(fail);
  });
});
