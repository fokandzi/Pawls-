import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { seoHead, SEO } from "../lib/seo";

export const Route = createFileRoute("/plus")({
  head: () => seoHead(SEO.plus),
  component: PlusPage,
});

// Honest framing (owner decision 2026-08-12): Pawls Plus is NOT for sale at
// launch. No price, no purchase link, no claims about premium features that
// don't exist yet (unlimited swipes, advanced filters, priority booking,
// verified badge, see-who-liked-you are all unbuilt — Phase 5 wires real
// entitlement from server-side subscriptions). This page only describes the
// vision as "coming soon".
const upcomingFeatures = [
  "Unlimited swipes",
  "Advanced filters (temperament, energy, size)",
  "Priority booking slots",
  "Verified profile badge",
  "See who liked you",
];

function PlusPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader active="plus" />
      <section className="bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 pb-20 pt-20">
        <div className="mx-auto max-w-xl text-center">
          <span className="rounded-full bg-[var(--pawls-cream-100)] px-4 py-2 text-sm font-semibold">
            Premium Experience
          </span>
          <h1 className="mt-6 text-4xl font-extrabold text-gray-900">
            Pawls Plus — <span className="text-[var(--pawls-terracotta-500)]">Coming Soon</span>
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Pawls Plus will be a premium tier for dog owners who want more from
            Pawls. We're building it carefully — it's not available yet.
          </p>
          <div className="mt-10 rounded-2xl border-2 border-[var(--pawls-gold-400)] bg-white p-8 text-left shadow-lg">
            <h2 className="text-2xl font-bold text-[var(--pawls-terracotta-500)]">
              What's coming
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Planned ideas we're exploring — nothing here is live yet:
            </p>
            <ul className="mt-6 space-y-3">
              {upcomingFeatures.map((f) => (
                <li key={f} className="text-sm font-medium text-gray-800">
                  {f}
                </li>
              ))}
            </ul>
            <p className="mt-6 rounded-xl bg-[var(--pawls-cream-50)] p-4 text-xs leading-relaxed text-gray-500">
              Pricing and the final feature set haven't been announced. When
              Pawls Plus launches, it will be clearly described here — you'll
              never be charged without knowing exactly what you're getting.
            </p>
          </div>
          <p className="mt-8 text-sm text-gray-500">
            In the meantime, everything on Pawls is free to use during beta.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block text-sm text-gray-400 underline"
          >
            Back to Pawls →
          </Link>
        </div>
      </section>
      <AppFooter />
    </div>
  );
}
