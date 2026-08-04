import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { trackEvent } from "../lib/analytics";
import { isNative } from "../lib/platform";
import { getCustomerInfo } from "../lib/iap";

import { seoHead, SEO } from "../lib/seo";

export const Route = createFileRoute("/plus/success")({
  head: () => seoHead(SEO["plus/success"]),
  component: PlusSuccessPage,
});

function PlusSuccessPage() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("pawnder-plus", "true");
      if (isNative()) {
        getCustomerInfo().catch(() => undefined);
        trackEvent("plus_iap_success_viewed");
      } else {
        trackEvent("plus_checkout_completed");
      }
    }
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <AppHeader active="plus" />

      {/* Success Content */}
      <section className="flex flex-1 items-center justify-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-20">
        <div className="max-w-md text-center">
          <div className="text-6xl"></div>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
            Welcome to{" "}
            <span className="text-[var(--pawls-terracotta-500)]">Pawls Plus</span>!
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-gray-600">
            You now have unlimited swipes, advanced filters, and priority booking.
          </p>

          {/* Feature highlights */}
          <div className="mt-8 space-y-3 text-left">
            <div className="flex items-center gap-3 rounded-xl bg-[var(--pawls-cream-50)] p-3">
              <img src="/logo-full.png" alt="Pawls" className="h-8" />
              <span className="text-sm font-medium text-gray-800">
                Unlimited swipes — match with as many dogs as you like
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-[var(--pawls-cream-50)] p-3">
              <span className="text-2xl"></span>
              <span className="text-sm font-medium text-gray-800">
                Advanced filters — temperament, energy level, size, and more
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-[var(--pawls-cream-50)] p-3">
              <span className="text-2xl">⭐</span>
              <span className="text-sm font-medium text-gray-800">
                Priority booking — first access to top-rated dog services
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-[var(--pawls-cream-50)] p-3">
              <span className="text-2xl"></span>
              <span className="text-sm font-medium text-gray-800">
                Verified profile badge — stand out in the community
              </span>
            </div>
          </div>

          <Link
            to="/match"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
          >
             Start matching →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <AppFooter />
    </div>
  );
}
