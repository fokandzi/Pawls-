import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { seoHead, SEO } from "../lib/seo";
import { getMe } from "../db/auth-fns";

export const Route = createFileRoute("/settings")({
  head: () => seoHead(SEO.settings),
  loader: async () => {
    const { user } = await getMe();
    if (!user) throw redirect({ to: "/login" });
    return { user };
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = Route.useLoaderData();
  const search = (Route.useSearch() as any) ?? {};
  const changed = String(search?.changed ?? "") === "1";
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader active="settings" />
      <section className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-12">
        <div className="mx-auto max-w-xl">
          <div className="mb-8 text-center">
            <span className="text-5xl">⚙️</span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900">Account settings</h1>
          </div>
          {changed && (
            <p className="mb-6 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
              Your password has been updated. Other sessions were signed out.
            </p>
          )}
          <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6 shadow-lg sm:p-8">
            <h2 className="text-lg font-bold text-gray-900">Your account</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="font-semibold text-gray-500">Name</dt><dd className="text-gray-900">{user.name}</dd></div>
              <div className="flex justify-between gap-4"><dt className="font-semibold text-gray-500">Email</dt><dd className="text-gray-900">{user.email}</dd></div>
              <div className="flex justify-between gap-4">
                <dt className="font-semibold text-gray-500">Email verified</dt>
                <dd>{user.verified ? <span className="font-semibold text-green-600">Yes</span> : <Link to="/verify-email" className="font-semibold text-[var(--pawls-terracotta-500)] underline">Verify now</Link>}</dd>
              </div>
            </dl>
          </div>
          <form action="/auth/password-change" method="POST" className="mt-6 rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6 shadow-lg sm:p-8">
            <h2 className="text-lg font-bold text-gray-900">Change password</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="currentPassword" className="mb-1 block text-sm font-semibold text-gray-700">Current password</label>
                <input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" className="w-full rounded-full border border-[var(--pawls-cream-200)] bg-white px-5 py-3 text-gray-900 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30" />
              </div>
              <div>
                <label htmlFor="newPassword" className="mb-1 block text-sm font-semibold text-gray-700">New password (8+ characters)</label>
                <input id="newPassword" name="newPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="w-full rounded-full border border-[var(--pawls-cream-200)] bg-white px-5 py-3 text-gray-900 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30" />
              </div>
              <button type="submit" className="inline-flex w-full items-center justify-center rounded-full bg-[var(--pawls-ink-700)] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-black">Update password</button>
            </div>
          </form>
          <form action="/auth/delete-account" method="POST" className="mt-6 rounded-2xl border border-red-200 bg-red-50/60 p-6 shadow-lg sm:p-8" onSubmit={(e) => { if (!window.confirm("This permanently deletes your account and all your data. Continue?")) e.preventDefault(); }}>
            <h2 className="text-lg font-bold text-red-800">Delete account</h2>
            <p className="mt-2 text-sm text-red-700">This permanently removes your profile, your dogs, your matches and messages. Bookings are anonymised; payment records are retained for legal reasons. This cannot be undone.</p>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="confirmEmail" className="mb-1 block text-sm font-semibold text-red-800">Type <span className="font-mono">{user.email}</span> to confirm</label>
                <input id="confirmEmail" name="confirmEmail" type="text" required autoComplete="off" className="w-full rounded-full border border-red-200 bg-white px-5 py-3 text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30" />
              </div>
              <label className="flex items-start gap-3 text-sm text-red-800">
                <input type="checkbox" name="confirm" value="1" required className="mt-0.5 h-4 w-4 rounded border-red-300" />
                I understand my account and data will be permanently deleted.
              </label>
              <button type="submit" className="inline-flex w-full items-center justify-center rounded-full bg-red-600 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-red-700">Delete my account</button>
            </div>
          </form>
          <p className="mt-8 text-center text-sm text-gray-500">
            <Link to="/match" className="font-medium text-[var(--pawls-terracotta-500)] underline">← Back to matching</Link>
          </p>
        </div>
      </section>
      <AppFooter />
    </div>
  );
}
