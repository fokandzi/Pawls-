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
