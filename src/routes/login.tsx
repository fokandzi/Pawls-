import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { seoHead, SEO } from "../lib/seo";
export const Route = createFileRoute("/login")({
  head: () => seoHead(SEO.login),
  component: LoginPage,
});
function LoginPage() {
  const search = (Route.useSearch() as any) ?? {};
  const reset = String(search?.reset ?? "") === "1";
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <section className="bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 pb-20 pt-16 sm:pt-20">
        <div className="mx-auto w-full max-w-md">
          <div className="text-center">
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Welcome back to <span className="text-[var(--pawls-terracotta-500)]">Pawls</span>
            </h1>
            <p className="mt-3 text-base text-gray-600">Log in to match, book and connect.</p>
            {reset && (
              <p className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
                Your password has been reset. Please log in.
              </p>
            )}
          </div>
          <form action="/auth/login" method="POST" className="mt-10 space-y-5 rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6 shadow-lg sm:p-8">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-gray-800">Email address</label>
              <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="w-full rounded-full border border-[var(--pawls-cream-200)] bg-white px-5 py-3 text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30" />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-gray-800">Password</label>
              <input id="password" name="password" type="password" required autoComplete="current-password" className="w-full rounded-full border border-[var(--pawls-cream-200)] bg-white px-5 py-3 text-gray-900 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30" />
            </div>
            <button type="submit" className="inline-flex w-full items-center justify-center rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)]">Log In</button>
            <p className="text-center text-sm text-gray-500">
              <Link to="/forgot-password" className="font-medium text-[var(--pawls-terracotta-500)] underline hover:text-[var(--pawls-terracotta-700)]">Forgot your password?</Link>
            </p>
            <p className="text-center text-sm text-gray-500">
              New to Pawls?{" "}
              <Link to="/register" className="font-semibold text-[var(--pawls-terracotta-500)] underline hover:text-[var(--pawls-terracotta-700)]">Create an account</Link>
            </p>
          </form>
        </div>
      </section>
      <AppFooter />
    </div>
  );
}
