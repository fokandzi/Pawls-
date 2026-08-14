import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { seoHead } from "../lib/seo";
import { t, DEFAULT_LANG, type Lang } from "../lib/i18n";

export const Route = createFileRoute("/reset-password")({
  head: () =>
    seoHead({
      title: t("auth.reset.seoTitle", DEFAULT_LANG),
      description: t("auth.reset.seoDesc", DEFAULT_LANG),
      path: "/reset-password",
    }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const L: Lang = DEFAULT_LANG;
  const search = (Route.useSearch() as any) ?? {};
  const token = String(search?.token ?? "");
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <section className="bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 pb-20 pt-16 sm:pt-20">
        <div className="mx-auto w-full max-w-md">
          <div className="text-center">
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900">{t("auth.reset.heading", L)}</h1>
            <p className="mt-3 text-base text-gray-600">{t("auth.reset.sub", L)}</p>
          </div>
          {token ? (
            <form action="/auth/password-reset" method="POST" className="mt-10 space-y-5 rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6 shadow-lg sm:p-8">
              <input type="hidden" name="token" value={token} />
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-gray-800">{t("auth.reset.newPassword", L)}</label>
                <input id="password" name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="w-full rounded-full border border-[var(--pawls-cream-200)] bg-white px-5 py-3 text-gray-900 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30" />
              </div>
              <button type="submit" className="inline-flex w-full items-center justify-center rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)]">{t("auth.reset.button", L)}</button>
            </form>
          ) : (
            <div className="mt-10 rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6 text-center shadow-lg">
              <p className="text-gray-600">{t("auth.reset.noToken", L)}</p>
              <Link to="/forgot-password" className="mt-3 inline-block font-semibold text-[var(--pawls-terracotta-500)] underline">{t("auth.reset.requestNew", L)}</Link>
            </div>
          )}
        </div>
      </section>
      <AppFooter />
    </div>
  );
}
