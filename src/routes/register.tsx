import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { seoHead } from "../lib/seo";
import { t, DEFAULT_LANG, type Lang } from "../lib/i18n";

export const Route = createFileRoute("/register")({
  head: () =>
    seoHead({
      title: t("auth.register.seoTitle", DEFAULT_LANG),
      description: t("auth.register.seoDesc", DEFAULT_LANG),
      path: "/register",
    }),
  component: RegisterPage,
});

function RegisterPage() {
  const L: Lang = DEFAULT_LANG;

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <section className="bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 pb-20 pt-16 sm:pt-20">
        <div className="mx-auto w-full max-w-md">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--pawls-cream-100)] px-4 py-1.5 text-sm font-semibold text-[var(--pawls-ink-700)]">
              {t("auth.register.freeAccount", L)}
            </span>
            <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              {t("auth.register.heading", L)}
            </h1>
            <p className="mt-3 text-base text-gray-600 sm:text-lg">
              {t("auth.register.sub", L)}
            </p>
          </div>

          <form
            action="/register"
            method="POST"
            className="mt-10 space-y-5 rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6 shadow-lg sm:p-8"
          >
            <div>
              <label
                htmlFor="name"
                className="mb-1.5 block text-sm font-semibold text-gray-800"
              >
                {t("auth.name", L)}
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                autoComplete="name"
                placeholder={t("auth.namePlaceholder", L)}
                className="w-full rounded-full border border-[var(--pawls-cream-200)] bg-white px-5 py-3 text-gray-900 placeholder:text-gray-400 transition-shadow focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-semibold text-gray-800"
              >
                {t("auth.email", L)}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder={t("auth.emailPlaceholder", L)}
                className="w-full rounded-full border border-[var(--pawls-cream-200)] bg-white px-5 py-3 text-gray-900 placeholder:text-gray-400 transition-shadow focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
              />
            </div>

            <div>
              <label
                htmlFor="date_of_birth"
                className="mb-1.5 block text-sm font-semibold text-gray-800"
              >
                {t("auth.dob", L)}
              </label>
              <input
                id="date_of_birth"
                name="date_of_birth"
                type="date"
                required
                max="2010-08-12"
                className="w-full rounded-full border border-[var(--pawls-cream-200)] bg-white px-5 py-3 text-gray-900 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
              />
              <p className="mt-1.5 text-xs text-gray-500">{t("auth.dobHint", L)}</p>
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-semibold text-gray-800"
              >
                {t("auth.password", L)}
              </label>
              <input
                id="password"
                minLength={8}
                maxLength={128}
                name="password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder={t("auth.passwordPlaceholder", L)}
                className="w-full rounded-full border border-[var(--pawls-cream-200)] bg-white px-5 py-3 text-gray-900 placeholder:text-gray-400 transition-shadow focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
              />
            </div>

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors duration-200 hover:bg-[var(--pawls-terracotta-700)]"
            >
              {t("auth.signUp", L)}
            </button>

            <p className="text-center text-xs text-gray-400">
              {t("auth.agreeTerms", L)}{" "}
              <Link to="/terms" className="underline hover:text-[var(--pawls-terracotta-500)]">
                {t("auth.terms", L)}
              </Link>{" "}
              {t("auth.andPrivacy", L)}{" "}
              <Link to="/privacy" className="underline hover:text-[var(--pawls-terracotta-500)]">
                {t("auth.privacy", L)}
              </Link>
              .
            </p>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            {t("auth.haveAccount", L)}{" "}
            <Link
              to="/"
              className="font-semibold text-[var(--pawls-terracotta-500)] underline hover:text-[var(--pawls-terracotta-700)]"
            >
              {t("auth.goToApp", L)}
            </Link>
          </p>
        </div>
      </section>
      <AppFooter />
    </div>
  );
}
