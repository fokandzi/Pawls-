import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";

import { seoHead, SEO } from "../lib/seo";

export const Route = createFileRoute("/plus/success")({
  head: () => seoHead(SEO["plus/success"]),
  component: PlusSuccessPage,
});

// Plain static thank-you page. No localStorage self-grant, no entitlement
// mutation — real Plus entitlement is wired in Phase 5 (subscriptions table).
function PlusSuccessPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <AppHeader active="plus" />

      {/* Success Content */}
      <section className="flex flex-1 items-center justify-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-20">
        <div className="max-w-md text-center">
          <div className="text-6xl">🐾</div>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
            Thank you for{" "}
            <span className="text-[var(--pawls-terracotta-500)]">supporting Pawls</span>!
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-gray-600">
            Your payment was received. Premium features are still in
            development — as a Plus member you'll be first to know, and we'll
            email you when they're ready.
          </p>

          <Link
            to="/match"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
          >
            🐕 Start matching →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <AppFooter />
    </div>
  );
}
