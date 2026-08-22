import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "../lib/seo";
import { t, DEFAULT_LANG } from "../lib/i18n";

export const Route = createFileRoute("/press")({
  head: () => seoHead({ title: t("press.title", DEFAULT_LANG), description: t("press.desc", DEFAULT_LANG), path: "/press" }),
  component: PressPage,
});

function PressPage() {
  const lang = DEFAULT_LANG;
  const stats = [
    { label: t("press.stat1Label", lang), value: t("press.stat1Value", lang) },
    { label: t("press.stat2Label", lang), value: t("press.stat2Value", lang) },
    { label: t("press.stat3Label", lang), value: t("press.stat3Value", lang) },
    { label: t("press.stat4Label", lang), value: t("press.stat4Value", lang) },
  ];
  const assets = [
    { name: t("press.asset1Name", lang), description: t("press.asset1Desc", lang), file: "/brand/logo-primary.png", size: "1.3 MB", icon: "" },
    { name: t("press.asset2Name", lang), description: t("press.asset2Desc", lang), file: "/brand/icon-mark.png", size: "1.4 MB", icon: "" },
    { name: t("press.asset3Name", lang), description: t("press.asset3Desc", lang), file: "/brand/wordmark.png", size: "2.0 MB", icon: "" },
  ];
  const screenshots = [
    { label: t("press.scr1", lang), icon: "" },
    { label: t("press.scr2", lang), icon: "" },
    { label: t("press.scr3", lang), icon: "" },
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <AppHeader active="press" />

      {/* Main Content */}
      <main className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-16">
        <div className="mx-auto max-w-5xl">
          {/* Hero */}
          <div className="mb-16 text-center">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-cream-100)] px-4 py-1.5 text-sm font-semibold text-[var(--pawls-ink-700)]">
              {t("press.badge", lang)}
            </span>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
              {t("press.heading", lang)}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              {t("press.sub", lang)}
            </p>
          </div>

          {/* Boilerplate */}
          <section className="mb-16">
            <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-8 shadow-sm sm:p-10">
              <h2 className="text-2xl font-bold text-[var(--pawls-terracotta-500)]">{t("press.aboutTitle", lang)}</h2>
              <div className="mt-4 space-y-4 text-lg leading-relaxed text-gray-700">
                <p>{t("press.about1", lang)}</p>
                <p>{t("press.about2", lang)}</p>
                <p>{t("press.about3", lang)}</p>
              </div>
            </div>
          </section>

          {/* Key Stats */}
          <section className="mb-16">
            <h2 className="mb-8 text-center text-2xl font-bold text-gray-900">
              {t("press.statsTitle1", lang)} <span className="text-[var(--pawls-terracotta-500)]">{t("press.statsTitle2", lang)}</span>
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-6 text-center shadow-sm">
                  <div className="text-4xl">{stat.icon}</div>
                  <div className="mt-3 text-3xl font-extrabold text-[var(--pawls-terracotta-500)]">
                    {stat.value}
                  </div>
                  <div className="mt-1 text-sm font-medium text-gray-500">{stat.label}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-sm text-gray-400">
              {t("press.statsNote", lang)}
            </p>
          </section>

          {/* Founder / Team */}
          <section className="mb-16">
            <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-8 shadow-sm sm:p-10">
              <h2 className="text-2xl font-bold text-[var(--pawls-terracotta-500)]">{t("press.founderTitle", lang)}</h2>
              <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-[var(--pawls-cream-100)] text-4xl"></div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{t("press.founder", lang)}</h3>
                  <p className="mt-2 leading-relaxed text-gray-700">
                    {t("press.founderBody", lang)}
                  </p>
                  <p className="mt-3 text-sm text-gray-500">
                    {t("press.founderContactBefore", lang)}{" "}
                    <a
                      href="mailto:press@pawls.club"
                      className="text-[var(--pawls-terracotta-500)] underline hover:text-[var(--pawls-terracotta-700)]"
                    >
                      press@pawls.club
                    </a>
                    .
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Brand Assets */}
          <section className="mb-16">
            <h2 className="mb-8 text-center text-2xl font-bold text-gray-900">
              {t("press.assetsTitle1", lang)} <span className="text-[var(--pawls-terracotta-500)]">{t("press.assetsTitle2", lang)}</span>
            </h2>
            <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-8 shadow-sm sm:p-10">
              <p className="mb-6 leading-relaxed text-gray-700">
                {t("press.assetsBody", lang)}
              </p>
              <div className="grid gap-6 sm:grid-cols-3">
                {assets.map((asset) => (
                  <div key={asset.name} className="rounded-xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-6 text-center">
                    <div className="mb-3 text-3xl">{asset.icon}</div>
                    <h3 className="font-semibold text-gray-900">{asset.name}</h3>
                    <p className="mt-1 text-sm text-gray-500">{asset.description}</p>
                    <p className="mt-1 text-xs text-gray-400">{asset.size} — PNG</p>
                    <a
                      href={asset.file}
                      download
                      className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-4 py-2 text-sm font-medium text-white shadow-md shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
                    >
                      {t("press.download", lang)}
                    </a>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-lg border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)] p-4">
                <p className="text-sm text-gray-700">
                  <strong>{t("press.brandColorLabel", lang)}</strong> {t("press.brandColorValue", lang)}{" "}
                  <code className="rounded bg-[var(--pawls-cream-100)] px-1.5 py-0.5 text-[var(--pawls-terracotta-500)]">
                    var(--pawls-terracotta-500)
                  </code>
                  <span
                    className="ml-2 inline-block h-4 w-4 rounded align-middle"
                    style={{ backgroundColor: "var(--pawls-terracotta-500)" }}
                  />
                </p>
              </div>
            </div>
          </section>

          {/* Screenshots */}
          <section className="mb-16">
            <h2 className="mb-8 text-center text-2xl font-bold text-gray-900">
              {t("press.screensTitle1", lang)} <span className="text-[var(--pawls-terracotta-500)]">{t("press.screensTitle2", lang)}</span>
            </h2>
            <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-8 shadow-sm sm:p-10">
              <p className="mb-6 leading-relaxed text-gray-700">
                {t("press.screensBody", lang)}
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                {screenshots.map((placeholder) => (
                  <div key={placeholder.label} className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/50 p-8">
                    <div className="text-4xl">{placeholder.icon}</div>
                    <p className="mt-3 text-sm font-medium text-gray-500">{placeholder.label}</p>
                    <p className="mt-1 text-xs text-gray-400">{t("press.scrAvail", lang)}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Media Contact */}
          <section className="mb-16">
            <div className="rounded-2xl border-2 border-[var(--pawls-gold-400)] bg-gradient-to-b from-[var(--pawls-cream-50)]/50 to-white p-8 shadow-lg sm:p-10">
              <h2 className="text-2xl font-bold text-[var(--pawls-terracotta-500)]">{t("press.mediaTitle", lang)}</h2>
              <p className="mt-3 leading-relaxed text-gray-700">
                {t("press.mediaBody", lang)}
              </p>
              <div className="mt-6 space-y-3">
                <a
                  href="mailto:press@pawls.club"
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3 text-base font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
                >
                  press@pawls.club
                </a>
              </div>
              <p className="mt-4 text-sm text-gray-500">
                {t("press.respondNote", lang)}
              </p>
            </div>
          </section>
        </div>
      </main>
      {/* Footer */}
      <AppFooter />
    </div>
  );
}
