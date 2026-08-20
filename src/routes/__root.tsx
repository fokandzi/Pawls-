import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "~/styles/app.css?url";
import { createServerFn } from "@tanstack/react-start";
import { getSessionUser } from "../lib/auth/session";
import { normalizeLang, DEFAULT_LANG, type Lang } from "../lib/i18n";

/** Resolve the ACTUAL language for the SSR <html lang> — from the signed-in
 * user's preferred_language (users.preferred_language) when available, else
 * the FR default. Runs server-side so the served HTML carries the right lang. */
const resolveRootLang = createServerFn({ method: "GET" }).handler(async (ctx: any) => {
  const request = ctx?.request as Request | undefined;
  if (!request) return DEFAULT_LANG;
  try {
    const user = await getSessionUser(request);
    return normalizeLang(user?.preferredLanguage ?? null);
  } catch {
    return DEFAULT_LANG;
  }
});

export const Route = createRootRoute({
  loader: () => resolveRootLang(),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Pawls — The all-in-one app for dog people" },
      { name: "description", content: "Pawls is the all-in-one platform for dog people. Find playmates, book walkers & groomers, connect with ethical breeders, rescue dogs, and join local dog communities." },
      { name: "theme-color", content: "#C95D43" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Pawls" },
      // Open Graph defaults (overridden by per-page head)
      { property: "og:title", content: "Pawls — The all-in-one app for dog people" },
      { property: "og:description", content: "Find playmates, book services, breed responsibly, rescue dogs — all in one app." },
      { property: "og:image", content: "https://pawls.club/logo.png" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Pawls" },
      // Twitter Card defaults
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Pawls — The all-in-one app for dog people" },
      { name: "twitter:description", content: "Find playmates, book services, breed responsibly, rescue dogs — all in one app." },
      { name: "twitter:image", content: "https://pawls.club/logo.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "canonical", href: "https://pawls.club" },
    ],
    scripts: [
      { src: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" },
    ],
  }),
  notFoundComponent: () => <div>Page not found</div>,
  component: RootComponent,
});

function RootComponent() {
  const lang = Route.useLoaderData() as Lang;
  return (
    <RootDocument lang={lang}>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children, lang }: { children: ReactNode; lang: Lang }) {
  return (
    <html lang={lang}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }); }`,
          }}
        />
      </body>
    </html>
  );
}
