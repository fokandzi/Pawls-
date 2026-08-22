import posthog from "posthog-js";

const apiKey = (import.meta.env.VITE_POSTHOG_API_KEY || import.meta.env.POSTHOG_API_KEY || "").trim();
let initialized = false;

if (typeof window !== "undefined" && apiKey && apiKey !== "phc_placeholder_replace_me") {
  posthog.init(apiKey, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com",
    cookieless_mode: "always",
    persistence: "memory",
    capture_pageview: false,
  });
  initialized = true;
}

export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

export function trackEvent(name: string, properties?: AnalyticsProperties): void {
  if (initialized) posthog.capture(name, properties);
}

export function identifyUser(email: string): void {
  if (initialized && email.trim()) posthog.identify(email.trim().toLowerCase());
}

/**
 * Server-side event capture (used by pre-SSR handlers like registration / dog
 * creation). Shares the SAME consent gate as the client: it stays completely
 * OFF until a real `phc_` key exists anywhere in the environment — the
 * placeholder is treated as absent, and no event is ever dispatched with it.
 * Fires no network call otherwise.
 */
export async function trackServerEvent(
  name: string,
  properties?: AnalyticsProperties,
): Promise<void> {
  const key = (process.env.POSTHOG_API_KEY || process.env.VITE_POSTHOG_API_KEY || "").trim();
  if (!key || key === "phc_placeholder_replace_me") return;
  const host = process.env.POSTHOG_HOST || "https://us.i.posthog.com";
  try {
    await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event: name,
        timestamp: new Date().toISOString(),
        properties: { distinct_id: properties?.distinct_id || "pawls-server", ...properties },
      }),
    }).catch(() => undefined);
  } catch (err) {
    console.error(`[analytics] server capture failed (${name})`, err);
  }
}
