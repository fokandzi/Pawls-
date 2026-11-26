import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { EmptyState } from "../lib/empty-state";
import { t, DEFAULT_LANG, type Lang } from "../lib/i18n";
import { resolveRouteLang } from "../lib/i18n/route-lang";

// ── Route definition ─────────────────────────────────────────────────────────
//
// Honesty: Connect is NOT a Phase-1 launch priority and there are no real
// groups or events yet. The page is a clearly labelled Coming Soon shell and
// renders NO fictional group/event names or cards. (Fixture group/event data
// from earlier builds is not rendered and is not seeded into production.)

import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/connect")({
  head: () => seoHead({ title: t("connect.title", DEFAULT_LANG), description: t("connect.desc", DEFAULT_LANG), path: "/connect" }),
  loader: async (): Promise<{ lang: Lang }> => {
    try {
      return { lang: await resolveRouteLang() };
    } catch {
      return { lang: DEFAULT_LANG };
    }
  },
  component: ConnectPage,
});

// ── Component ────────────────────────────────────────────────────────────────

function ConnectPage() {
  const routerState = useRouterState();
  const isExactConnect = routerState.location.pathname === "/connect";
  // FR-first: the server resolved the visitor's persisted language.
  const { lang: serverLang } = Route.useLoaderData() as { lang?: Lang };
  const lang: Lang = serverLang ?? DEFAULT_LANG;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <AppHeader active="connect" lang={lang} />

      {isExactConnect ? (
        <>
          {/* Hero */}
          <section className="bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 pb-12 pt-8 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              {t("connect.pageTitle", lang)}
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-base text-gray-600">
              {t("connect.pageSubtitle", lang)}
            </p>
          </section>

          {/* Coming Soon — no fictional groups/events are rendered */}
          <section className="bg-white px-6 pb-20">
            <div className="mx-auto max-w-6xl">
              <EmptyState
                icon="empty-no-matches"
                title={t("connect.comingSoonTitle", lang)}
                description={t("connect.comingSoonBody", lang)}
              />
            </div>
          </section>
        </>
      ) : (
        <Outlet />
      )}

      {/* Footer */}
      <AppFooter lang={lang} />
    </div>
  );
}
