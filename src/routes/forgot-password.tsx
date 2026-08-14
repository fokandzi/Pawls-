import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { seoHead } from "../lib/seo";
import { t, DEFAULT_LANG, type Lang } from "../lib/i18n";

export const Route = createFileRoute("/forgot-password")({
  head: () =>
    seoHead({
      title: t("auth.forgot.seoTitle", DEFAULT_LANG),
      description: t("auth.forgot.seoDesc", DEFAULT_LANG),
      path: "/forgot-password",
    }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const L: Lang = DEFAULT_LANG;
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <section className="bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 pb-20 pt-16 sm:pt-20">
        <div className="mx-auto w-full max-w-md">
          <div className="text-center">
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900">{t("auth.forgot.heading", L)}</h1>
            <p className="mt-3 text-base text-gray-600">{t("auth.forgot.sub", L)}</p>
          </div>
          <form action="/auth/password-reset-request" method="POST" className="mt-10 space-y-5 rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6 shadow-lg sm:p-8">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-gray-800">{t("auth.email", L)}</label>
              <input id="email" name="email" type="email" required autoComplete="email" placeholder={t("auth.emailPlaceholder", L)} className="w-full rounded-full border border-[var(--pawls-cream-200)] bg-white px-5 py-3 text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30" />
            </div>
            <button type="submit" className="inline-flex w-full items-center justify-center rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)]">{t("auth.forgot.send", L)}</button>
            <p className="text-center text-sm text-gray-500">
              <Link to="/login" className="font-medium text-[var(--pawls-terracotta-500)] underline hover:text-[var(--pawls-terracotta-700)]">{t("auth.backToLogin", L)}</Link>
            </p>
          </form>
        </div>
      </section>
      <AppFooter />
    </div>
  );
}
