import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { readFile } from "node:fs/promises";
import { TrustBadges } from "../lib/social-proof";
import { AppHeader } from "../lib/app-header";
import { AppIcon } from "../lib/app-icon";
import { t, DEFAULT_LANG, type Lang } from "../lib/i18n";

const getBusinessName = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const cfg = JSON.parse(await readFile("site.json", "utf8")) as {
      businessName?: string;
    };
    return cfg.businessName?.trim() ?? "Pawls";
  } catch {
    return "Pawls";
  }
});

import { seoHead, organizationJsonLd } from "../lib/seo";

export const Route = createFileRoute("/")({
  head: () => {
    const seo = seoHead({
      title: t("home.seoTitle", DEFAULT_LANG),
      description: t("home.seoDesc", DEFAULT_LANG),
    });
    return {
      ...seo,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(organizationJsonLd()),
        },
      ],
    };
  },
  loader: async (ctx: any) => {
    const businessName = await getBusinessName();
    // Read ?subscribed=1 (set by the native POST /api/waitlist handler) so the
    // waitlist section can show an honest confirmation without client JS.
    const rawSearch = ctx.location?.search;
    const search = (typeof rawSearch === "string"
      ? Object.fromEntries(new URLSearchParams(rawSearch.startsWith("?") ? rawSearch.slice(1) : rawSearch).entries())
      : (rawSearch ?? {})) as Record<string, unknown>;
    const subscribed = String(search.subscribed ?? "") === "1";
    return { businessName, subscribed };
  },
  component: Home,
});

type FeatureStatus = "beta" | "coming-soon";

const features: {
  icon: "match" | "breed" | "rescue" | "book" | "connect" | "venues";
  titleKey: string;
  descKey: string;
  status: FeatureStatus;
}[] = [
  { icon: "match", titleKey: "home.feat.match.title", descKey: "home.feat.match.desc", status: "beta" },
  { icon: "breed", titleKey: "home.feat.breed.title", descKey: "home.feat.breed.desc", status: "coming-soon" },
  { icon: "rescue", titleKey: "home.feat.rescue.title", descKey: "home.feat.rescue.desc", status: "coming-soon" },
  { icon: "book", titleKey: "home.feat.book.title", descKey: "home.feat.book.desc", status: "coming-soon" },
  { icon: "connect", titleKey: "home.feat.connect.title", descKey: "home.feat.connect.desc", status: "coming-soon" },
  { icon: "venues", titleKey: "home.feat.venues.title", descKey: "home.feat.venues.desc", status: "coming-soon" },
];

function Home() {
  const { businessName, subscribed } = Route.useLoaderData();
  // Public landing renders FR by default (DEFAULT_LANG='fr'); a persisted
  // FR|EN toggle arrives with the full i18n phase.
  const L: Lang = DEFAULT_LANG;

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />

      {/* Hero Section */}
      <section className="relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-4 pb-12 pt-8 text-center sm:px-6 sm:pb-20 sm:pt-14">
        {/* Decorative paw prints */}
        <div className="pointer-events-none absolute left-2 top-4 rotate-[-20deg] select-none text-3xl opacity-10 sm:left-8 sm:top-8 sm:text-4xl sm:opacity-20">
          🐾
        </div>
        <div className="pointer-events-none absolute right-2 top-8 rotate-[15deg] select-none text-2xl opacity-8 sm:right-12 sm:top-16 sm:text-3xl sm:opacity-15">
          🐾
        </div>

        {/* Logo */}
        <Link to="/home" className="mb-4 inline-block">
          <img
            src="/logo-full.png"
            alt="Pawls"
            className="block h-24 w-24 object-contain sm:h-32 sm:w-32 md:h-40 md:w-40"
          />
        </Link>

        <span className="mb-5 inline-flex items-center rounded-full bg-[var(--pawls-cream-100)] px-3 py-1 text-xs font-semibold text-[var(--pawls-ink-700)] sm:px-4 sm:py-1.5 sm:text-sm">
          {t("home.betaBadge", L)}
        </span>

        {/* Single i18n string — one text node, no JSX-fragment boundary, so the
            space between words can never be lost (was "fordog" across the old
            {" "}/<span> fragment). */}
        <h1 className="max-w-3xl text-2xl font-extrabold tracking-tight text-gray-900 sm:text-4xl md:text-5xl">
          {t("home.tagline", L)}
        </h1>

        <p className="mt-3 max-w-xl text-base leading-relaxed text-gray-600 sm:mt-5 sm:text-lg">
          {t("home.sub", L).replace("{name}", businessName)}
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/register"
            className="inline-flex items-center justify-center rounded-full bg-[var(--pawls-terracotta-500)] px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors duration-200 hover:bg-[var(--pawls-terracotta-700)] sm:px-8 sm:py-3.5 sm:text-base"
          >
            {t("home.ctaCreate", L)}
            <svg
              className="ml-2 h-4 w-4 sm:h-5 sm:w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Link>
          <a
            href="#features"
            className="inline-flex items-center justify-center rounded-full border-2 border-[var(--pawls-cream-200)] bg-white px-7 py-3 text-sm font-semibold text-gray-700 transition-colors duration-200 hover:border-[var(--pawls-terracotta-500)] hover:text-[var(--pawls-terracotta-500)] sm:px-8 sm:py-3.5 sm:text-base"
          >
            {t("home.ctaExplore", L)}
          </a>
        </div>
      </section>

      {/* Trust Section — only claims that are factually true today */}
      <section className="bg-gradient-to-b from-white to-[var(--pawls-cream-50)]/50 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div>
            <TrustBadges lang={L} />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="bg-white px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-14 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {t("home.featuresHeading", L)}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              {t("home.featuresSub", L)}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.titleKey}
                className="group relative rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-6 transition-all duration-300 hover:border-[var(--pawls-cream-200)] hover:bg-[var(--pawls-cream-50)] hover:shadow-md"
              >
                <div className="mb-4 flex items-start justify-between">
                  <AppIcon name={feature.icon} size={40} />
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      feature.status === "beta"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-[var(--pawls-cream-100)] text-[var(--pawls-gold-500)]"
                    }`}
                  >
                    {feature.status === "beta" ? t("home.statusBeta", L) : t("home.statusSoon", L)}
                  </span>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900">
                  {t(feature.titleKey, L)}
                </h3>
                <p className="text-sm leading-relaxed text-gray-600">
                  {t(feature.descKey, L)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Waitlist Section — native form POST, works without client JS */}
      <section
        id="waitlist"
        className="bg-gradient-to-b from-[var(--pawls-cream-50)] to-[var(--pawls-terracotta-500)]/5 px-6 py-20"
      >
        <div className="mx-auto max-w-lg text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t("home.waitlistHeading", L)}
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            {t("home.waitlistBody", L)}
          </p>

          {subscribed ? (
            <div className="mt-8 rounded-2xl border border-green-200 bg-green-50 p-6">
              <div className="mb-3 text-4xl">🐾</div>
              <p className="text-lg font-semibold text-green-800">
                {t("home.waitlistDoneTitle", L)}
              </p>
              <p className="mt-1 text-sm text-green-600">
                {t("home.waitlistDoneBody", L)}
              </p>
            </div>
          ) : (
            <form
              action="/api/waitlist"
              method="POST"
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
            >
              <input
                type="email"
                name="email"
                required
                placeholder={t("home.waitlistPlaceholder", L)}
                className="flex-1 rounded-full border border-[var(--pawls-cream-200)] bg-white px-5 py-3.5 text-gray-900 placeholder:text-gray-400 transition-shadow focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-[var(--pawls-terracotta-500)] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors duration-200 hover:bg-[var(--pawls-terracotta-700)]"
              >
                {t("home.waitlistCta", L)}
              </button>
            </form>
          )}

          <p className="mt-4 text-xs text-gray-400">
            {t("home.waitlistFinePrint", L)}
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-[var(--pawls-cream-100)] bg-white px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <img src="/logo-full.png" alt="Pawls" className="h-8" />
          </div>
          <p className="text-sm text-gray-500">
            {t("home.footerTagline", L)}
          </p>
        </div>
      </footer>
    </div>
  );
}
