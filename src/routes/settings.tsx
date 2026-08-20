import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { seoHead } from "../lib/seo";
import { getMe } from "../db/auth-fns";
import { t, normalizeLang, DEFAULT_LANG, type Lang } from "../lib/i18n";

export const Route = createFileRoute("/settings")({
  head: () => seoHead({ title: t("settings.seoTitle", DEFAULT_LANG), description: t("settings.seoDesc", DEFAULT_LANG) }),
  loader: async () => {
    const { user } = await getMe();
    if (!user) throw redirect({ to: "/login" });
    return { user };
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = Route.useLoaderData();
  const L: Lang = normalizeLang(user.preferredLanguage);
  const search = (Route.useSearch() as any) ?? {};
  const changed = String(search?.changed ?? "") === "1";
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader active="settings" lang={L} />
      <section className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-12">
        <div className="mx-auto max-w-xl">
          <div className="mb-8 text-center">
            <span className="text-5xl">⚙️</span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900">{t("settings.heading", L)}</h1>
          </div>
          {changed && (
            <p className="mb-6 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
              {t("settings.changed", L)}
            </p>
          )}
          <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6 shadow-lg sm:p-8">
            <h2 className="text-lg font-bold text-gray-900">{t("settings.account", L)}</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="font-semibold text-gray-500">{t("settings.name", L)}</dt><dd className="text-gray-900">{user.name}</dd></div>
              <div className="flex justify-between gap-4"><dt className="font-semibold text-gray-500">{t("settings.email", L)}</dt><dd className="text-gray-900">{user.email}</dd></div>
              <div className="flex justify-between gap-4">
                <dt className="font-semibold text-gray-500">{t("settings.emailVerified", L)}</dt>
                <dd>{user.verified ? <span className="font-semibold text-green-600">{t("settings.yes", L)}</span> : <Link to="/verify-email" className="font-semibold text-[var(--pawls-terracotta-500)] underline">{t("settings.verifyNow", L)}</Link>}</dd>
              </div>
            </dl>
          </div>
          <form action="/auth/password-change" method="POST" className="mt-6 rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6 shadow-lg sm:p-8">
            <h2 className="text-lg font-bold text-gray-900">{t("settings.changePassword", L)}</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="currentPassword" className="mb-1 block text-sm font-semibold text-gray-700">{t("settings.currentPassword", L)}</label>
                <input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" className="w-full rounded-full border border-[var(--pawls-cream-200)] bg-white px-5 py-3 text-gray-900 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30" />
              </div>
              <div>
                <label htmlFor="newPassword" className="mb-1 block text-sm font-semibold text-gray-700">{t("settings.newPassword", L)}</label>
                <input id="newPassword" name="newPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="w-full rounded-full border border-[var(--pawls-cream-200)] bg-white px-5 py-3 text-gray-900 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30" />
              </div>
              <button type="submit" className="inline-flex w-full items-center justify-center rounded-full bg-[var(--pawls-ink-700)] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-black">{t("settings.updatePassword", L)}</button>
            </div>
          </form>
          <form action="/auth/delete-account" method="POST" className="mt-6 rounded-2xl border border-red-200 bg-red-50/60 p-6 shadow-lg sm:p-8" onSubmit={(e) => { if (!window.confirm(t("settings.deleteConfirmText", L))) e.preventDefault(); }}>
            <h2 className="text-lg font-bold text-red-800">{t("settings.deleteAccount", L)}</h2>
            <p className="mt-2 text-sm text-red-700">{t("settings.deleteWarning", L)}</p>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="confirmEmail" className="mb-1 block text-sm font-semibold text-red-800">{t("settings.deleteConfirmLabel", L).replace("{email}", "")}<span className="font-mono"> {user.email}</span></label>
                <input id="confirmEmail" name="confirmEmail" type="text" required autoComplete="off" className="w-full rounded-full border border-red-200 bg-white px-5 py-3 text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30" />
              </div>
              <label className="flex items-start gap-3 text-sm text-red-800">
                <input type="checkbox" name="confirm" value="1" required className="mt-0.5 h-4 w-4 rounded border-red-300" />
                {t("settings.deleteConfirmCheckbox", L)}
              </label>
              <button type="submit" className="inline-flex w-full items-center justify-center rounded-full bg-red-600 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-red-700">{t("settings.deleteButton", L)}</button>
            </div>
          </form>
          <p className="mt-8 text-center text-sm text-gray-500">
            <Link to="/match" className="font-medium text-[var(--pawls-terracotta-500)] underline">{t("settings.backToMatching", L)}</Link>
          </p>
        </div>
      </section>
      <AppFooter lang={L} />
    </div>
  );
}
