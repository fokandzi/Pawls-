import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "~/styles/app.css?url";
import { AppHeader, AppFooter } from "../lib/app-header";
import { createServerFn } from "@tanstack/react-start";
import { getSessionUser } from "../lib/auth/session";
import { normalizeLang, t, DEFAULT_LANG, type Lang } from "../lib/i18n";

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
      { title: t("root.title", DEFAULT_LANG) },
      { name: "description", content: t("root.seoDesc", DEFAULT_LANG) },
      { name: "theme-color", content: "#C95D43" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Pawls" },
      // Open Graph defaults (overridden by per-page head)
      { property: "og:title", content: t("root.title", DEFAULT_LANG) },
      { property: "og:description", content: t("root.seoDesc", DEFAULT_LANG) },
      { property: "og:image", content: "https://pawls.club/logo.png" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Pawls" },
      // Twitter Card defaults
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: t("root.title", DEFAULT_LANG) },
      { name: "twitter:description", content: t("root.seoDesc", DEFAULT_LANG) },
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
  notFoundComponent: () => <NotFoundPage />,
  component: RootComponent,
});

/**
 * 404 — FR-first (the site's primary language), EN secondary, and always with a
 * way back into the product instead of a dead end. The language comes from the
 * root loader, which already resolved the visitor's persisted preference
 * server-side, so the served HTML is in the right language.
 */
function NotFoundPage() {
  let lang: Lang = DEFAULT_LANG;
  try {
    const resolved = Route.useLoaderData() as Lang | undefined;
    lang = normalizeLang(resolved ?? DEFAULT_LANG);
  } catch {
    lang = DEFAULT_LANG;
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader lang={lang} />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <span className="text-5xl" aria-hidden="true">🐾</span>
        <p className="mt-4 text-sm font-bold uppercase tracking-widest text-[var(--pawls-terracotta-500)]">404</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
          {t("notFound.title", lang)}
        </h1>
        <p className="mt-3 max-w-md text-base leading-relaxed text-gray-600">{t("notFound.body", lang)}</p>
        <nav aria-label={t("notFound.nav", lang)} className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--pawls-terracotta-600)]"
          >
            {t("notFound.home", lang)}
          </Link>
          <Link
            to="/match"
            className="rounded-full border-2 border-[var(--pawls-terracotta-500)] bg-white px-6 py-3 text-sm font-semibold text-[var(--pawls-terracotta-500)] transition-colors hover:bg-[var(--pawls-cream-50)]"
          >
            {t("nav.match", lang)}
          </Link>
          <Link
            to="/book"
            className="rounded-full border border-[var(--pawls-cream-200)] bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-[var(--pawls-cream-50)]"
          >
            {t("nav.book", lang)}
          </Link>
        </nav>
      </main>
      <AppFooter lang={lang} />
    </div>
  );
}

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
