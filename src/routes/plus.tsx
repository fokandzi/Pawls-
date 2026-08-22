import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { seoHead } from "../lib/seo";
import { t, DEFAULT_LANG } from "../lib/i18n";
export const Route = createFileRoute("/plus")({
  head: () => seoHead({ title: t("plus.title", DEFAULT_LANG), description: t("plus.desc", DEFAULT_LANG), path: "/plus" }),
  component: PlusPage,
});
// Honest framing (owner decision 2026-08-12): Pawls Plus is NOT for sale at
// launch. No price, no purchase link, no claims about premium features that
// don't exist yet (unlimited swipes, advanced filters, priority booking,
// verified badge, see-who-liked-you are all unbuilt — Phase 5 wires real
// entitlement from server-side subscriptions). This page only describes the
// vision as "coming soon".
function PlusPage() {
  const lang = DEFAULT_LANG;
  const upcomingFeatures = [
    t("plus.feature1", lang),
    t("plus.feature2", lang),
    t("plus.feature3", lang),
    t("plus.feature4", lang),
    t("plus.feature5", lang),
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader active="plus" />
      <section className="bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 pb-20 pt-20">
        <div className="mx-auto max-w-xl text-center">
          <span className="rounded-full bg-[var(--pawls-cream-100)] px-4 py-2 text-sm font-semibold">
            {t("plus.badge", lang)}
          </span>
          <h1 className="mt-6 text-4xl font-extrabold text-gray-900">
            {t("plus.heading1", lang)}{" "}
            <span className="text-[var(--pawls-terracotta-500)]">{t("plus.heading2", lang)}</span>
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            {t("plus.intro", lang)}
          </p>
          <div className="mt-10 rounded-2xl border-2 border-[var(--pawls-gold-400)] bg-white p-8 text-left shadow-lg">
            <h2 className="text-2xl font-bold text-[var(--pawls-terracotta-500)]">
              {t("plus.comingTitle", lang)}
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              {t("plus.comingSub", lang)}
            </p>
            <ul className="mt-6 space-y-3">
              {upcomingFeatures.map((f) => (
                <li key={f} className="text-sm font-medium text-gray-800">
                  {f}
                </li>
              ))}
            </ul>
            <p className="mt-6 rounded-xl bg-[var(--pawls-cream-50)] p-4 text-xs leading-relaxed text-gray-500">
              {t("plus.footnote", lang)}
            </p>
          </div>
          <p className="mt-8 text-sm text-gray-500">
            {t("plus.freeNote", lang)}
          </p>
          <Link
            to="/"
            className="mt-4 inline-block text-sm text-gray-400 underline"
          >
            {t("plus.back", lang)}
          </Link>
        </div>
      </section>
      <AppFooter />
    </div>
  );
}
