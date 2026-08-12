import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { seoHead, SEO } from "../lib/seo";
export const Route = createFileRoute("/verify-email")({
  head: () => seoHead(SEO["verify-email"]),
  component: VerifyEmailPage,
});
function VerifyEmailPage() {
  const search = (Route.useSearch() as any) ?? {};
  const token = String(search?.token ?? "");
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <section className="bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 pb-20 pt-16 sm:pt-20">
        <div className="mx-auto w-full max-w-md text-center">
          <span className="text-5xl">📬</span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900">Verify your email</h1>
          {token ? (
            <>
              <p className="mt-3 text-base text-gray-600">Confirm that this is your email address to activate your Pawls account.</p>
              <form action="/auth/verify-email" method="POST" className="mt-8 rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6 shadow-lg">
                <input type="hidden" name="token" value={token} />
                <button type="submit" className="inline-flex w-full items-center justify-center rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)]">Verify my email</button>
              </form>
            </>
          ) : (
            <>
              <p className="mt-3 text-base text-gray-600">We've emailed you a verification link. Click it (or paste the token below) to activate your account.</p>
              <form action="/auth/verify-email" method="POST" className="mt-8 rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6 shadow-lg">
                <input name="token" placeholder="Paste verification token" className="w-full rounded-full border border-[var(--pawls-cream-200)] bg-white px-5 py-3 text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30" />
                <button type="submit" className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-[var(--pawls-terracotta-700)]">Verify</button>
              </form>
            </>
          )}
          <p className="mt-6 text-sm text-gray-500">
            <Link to="/register" className="font-medium text-[var(--pawls-terracotta-500)] underline">Register instead</Link> ·{" "}
            <Link to="/login" className="font-medium text-[var(--pawls-terracotta-500)] underline">Log in</Link>
          </p>
        </div>
      </section>
      <AppFooter />
    </div>
  );
}
