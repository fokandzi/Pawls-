/**
 * Minimal health endpoint (seed of batch E — "failure visibility, no false
 * success").
 *
 * WHY: on 2026-10-24 the only way to learn that photo upload was misconfigured
 * in Preview was to shell into the deployment and run the SDK by hand. A public
 * boolean fixes that class of blindness without exposing anything sensitive.
 *
 * Contract:
 *   GET|HEAD /health → 200 {"status":"ok","db":"ok","photosConfigured":bool,
 *                           "timestamp":"<ISO-8601>"}
 *                    → 503 {"status":"degraded","db":"unreachable",…} when the
 *                      database is not reachable (a truthful 200 here would be
 *                      the same kind of lie this phase exists to remove).
 *
 * NOTHING sensitive is returned: no env values, no token fragments, no counts,
 * no user data, no commit ids. Only booleans, a fixed enum and a timestamp.
 * Anonymous access is intended (uptime probes have no session).
 */
import { sql } from "../db";
import { isDogPhotoUploadConfigured } from "./dog-photo";

const NO_STORE = "no-store, max-age=0, must-revalidate";

export interface HealthSnapshot {
  status: "ok" | "degraded";
  db: "ok" | "unreachable";
  /** True only when object storage is configured AND the token is a usable v7 token. */
  photosConfigured: boolean;
  timestamp: string;
}

/** Probe the database and the feature flags. Never throws. */
export async function healthSnapshot(): Promise<HealthSnapshot> {
  let db: "ok" | "unreachable" = "unreachable";
  try {
    await sql()`SELECT 1`;
    db = "ok";
  } catch (err) {
    console.error("[health] database probe failed", err);
  }
  return {
    status: db === "ok" ? "ok" : "degraded",
    db,
    photosConfigured: isDogPhotoUploadConfigured(),
    timestamp: new Date().toISOString(),
  };
}

/** Native /health handler — wired pre-SSR in serve.ts and vercel-entry.ts. */
export async function handleHealthRequest(request: Request): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": NO_STORE,
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { ...headers, Allow: "GET, HEAD" },
    });
  }
  const snapshot = await healthSnapshot();
  return new Response(JSON.stringify(snapshot), {
    status: snapshot.status === "ok" ? 200 : 503,
    headers,
  });
}
