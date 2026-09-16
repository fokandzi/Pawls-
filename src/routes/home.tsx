import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader, AppFooter } from "../lib/app-header";
import { AppIcon, type AppIconName } from "../lib/app-icon";
import { t, DEFAULT_LANG, type Lang } from "../lib/i18n";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/home")({
  head: () =>
    seoHead({
      title: t("welcome.seoTitle", DEFAULT_LANG),
      description: t("welcome.seoDesc", DEFAULT_LANG),
      path: "/home",
    }),
  component: HomePage,
});

/** In-app welcome / dashboard. FR-first through the i18n dict (EN fallback);
 * card labels reuse the nav.* keys so there is no duplicated UI string. */
function HomePage() {
  const L: Lang = DEFAULT_LANG;
  const tools: Array<{ to: string; icon: AppIconName; labelKey: string; descKey: string }> = [
    { to: "/match", icon: "match", labelKey: "nav.match", descKey: "welcome.card.match.desc" },
    { to: "/breed", icon: "breed", labelKey: "nav.breed", descKey: "welcome.card.breed.desc" },
    { to: "/book", icon: "book", labelKey: "nav.book", descKey: "welcome.card.book.desc" },
    { to: "/rescue", icon: "rescue", labelKey: "nav.rescue", descKey: "welcome.card.rescue.desc" },
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />

      {/* Dashboard content */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center sm:px-6">
        {/* Hero logo — 64px on mobile (was rendered at ~343px by the broken
            unlayered `img { height: auto }` override in app.css). */}
        <img
          src="/logo-full.png"
          alt="Pawls"
          width={1024}
          height={1024}
          className="mb-8 block h-16 w-16 object-contain sm:h-24 sm:w-24"
        />

        <h2 className="mb-4 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          {t("welcome.heading", L)}
        </h2>

        <p className="mb-4 max-w-md text-base leading-relaxed text-gray-600">
          {t("welcome.sub", L)}
        </p>

        <p className="mb-8 max-w-md text-sm leading-relaxed text-gray-500">
          {t("welcome.betaNote", L)}
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {tools.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-5 transition-all hover:border-[var(--pawls-cream-200)] hover:bg-[var(--pawls-cream-50)] hover:shadow-md sm:p-6"
            >
              <AppIcon name={item.icon} size={40} />
              <span className="text-sm font-semibold text-gray-800">{t(item.labelKey, L)}</span>
              <span className="text-xs text-gray-500">{t(item.descKey, L)}</span>
            </Link>
          ))}
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
