import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createPlusCheckout } from "../db/payments";
import { isNative } from "../lib/platform";
import { getOfferings, purchasePackage, restorePurchases } from "../lib/iap";
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { trackEvent } from "../lib/analytics";

import { seoHead, SEO } from "../lib/seo";

export const Route = createFileRoute("/plus")({
  head: () => seoHead(SEO.plus),
  component: PlusPage,
});

const freeFeatures = [
  "3 swipes per day",
  "Standard booking",
  "Basic profile",
  "Browse breeders & rescues",
  "Join community groups",
];

const plusFeatures = [
  "Unlimited swipes",
  "Advanced filters (temperament, energy, size)",
  "Priority booking slot",
  "Verified profile badge ",
  "See who liked you",
  "Early access to new features",
];

function PlusPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [native, setNative] = useState(false);
  const [nativePackage, setNativePackage] = useState<PurchasesPackage | null>(null);

  useEffect(() => {
    const onNative = isNative();
    setNative(onNative);
    if (onNative) {
      getOfferings().then((offerings) => {
        const pkg = offerings?.current?.monthly || offerings?.current?.availablePackages?.[0];
        setNativePackage(pkg || null);
      }).catch(() => setError("Native subscriptions are temporarily unavailable."));
    }
  }, []);

  const handleUpgrade = async () => {
    if (native) {
      if (!nativePackage) { setError("Subscription plan is not available yet."); return; }
      setLoading(true); setError("");
      try { await purchasePackage(nativePackage); trackEvent("plus_iap_completed"); window.location.href = "/plus/success"; }
      catch { setError("Purchase was not completed. You can try again anytime."); }
      finally { setLoading(false); }
      return;
    }
    trackEvent("plus_checkout_started");
    setLoading(true);
    setError("");
    try {
      const result = await createPlusCheckout();
      if ("error" in result && result.error) {
        setError(result.error);
      } else if ("url" in result && result.url) {
        window.location.href = result.url;
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <AppHeader active="plus" />

      {/* Hero */}
      <section className="relative flex flex-col items-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 pb-12 pt-20 text-center">
        <div className="pointer-events-none absolute left-8 top-8 rotate-[-20deg] select-none text-4xl opacity-20">
          
        </div>
        <div className="pointer-events-none absolute right-12 top-16 rotate-[15deg] select-none text-3xl opacity-15">
          
        </div>

        <span className="mb-6 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-cream-100)] px-4 py-1.5 text-sm font-semibold text-[var(--pawls-ink-700)]">
           Premium Experience
        </span>

        <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
          Unlock the Full{" "}
          <span className="text-[var(--pawls-terracotta-500)]">Pawls Experience</span>
        </h1>

        <p className="mt-4 max-w-lg text-lg text-gray-600">
          Get unlimited swipes, advanced matching, priority booking, and more.
        </p>
      </section>

      {/* Pricing Comparison */}
      <section className="bg-white px-6 pb-20">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Free Card */}
            <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
              <h3 className="text-xl font-bold text-gray-900">Free</h3>
              <p className="mt-2 text-gray-600">Get started with basic features.</p>
              <p className="mt-4">
                <span className="text-4xl font-extrabold text-gray-900">€0</span>
                <span className="text-gray-500">/month</span>
              </p>
              <ul className="mt-6 space-y-3">
                {freeFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span className="mt-0.5 text-gray-400">○</span>
                    <span className="text-sm text-gray-600">{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Plus Card */}
            <div className="relative rounded-2xl border-2 border-[var(--pawls-gold-400)] bg-gradient-to-b from-[var(--pawls-cream-50)]/50 to-white p-8 shadow-lg">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--pawls-cream-50)]0 px-4 py-1 text-xs font-bold text-white shadow-md">
                 Most Popular
              </span>
              <h3 className="text-xl font-bold text-[var(--pawls-terracotta-500)]">Pawls Plus</h3>
              <p className="mt-2 text-gray-600">
                Everything you need for the ultimate dog-parent experience.
              </p>
              <p className="mt-4">
                <span className="text-4xl font-extrabold text-[var(--pawls-terracotta-500)]">{native ? "€7.99" : "€8"}</span>
                <span className="text-gray-500">/month</span>
              </p>
              <ul className="mt-6 space-y-3">
                {plusFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span className="mt-0.5 text-[var(--pawls-terracotta-500)]"></span>
                    <span className="text-sm font-medium text-gray-800">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={handleUpgrade}
                disabled={loading}
                className="mt-8 w-full rounded-full bg-gradient-to-r from-[var(--pawls-cream-50)]0 to-[var(--pawls-terracotta-500)] px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--pawls-cream-50)]0/25 transition-all hover:from-[var(--pawls-gold-500)] hover:to-[var(--pawls-terracotta-700)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? (native ? "Opening App Store..." : "Redirecting...") : (native ? "Subscribe" : "Get Pawls Plus")}
              </button>
              {native && (
                <button type="button" onClick={async () => { setLoading(true); setError(""); try { await restorePurchases(); window.location.href = "/plus/success"; } catch { setError("No previous purchase could be restored."); } finally { setLoading(false); } }} className="mt-3 w-full text-sm font-medium text-gray-500 underline">Restore Purchases</button>
              )}

              {error && (
                <p className="mt-3 text-center text-sm text-red-600">{error}</p>
              )}
            </div>
          </div>

          {/* Maybe later link */}
          <div className="mt-8 text-center">
            <Link
              to="/"
              className="text-sm font-medium text-gray-400 transition-colors hover:text-gray-600"
            >
              Maybe later →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <AppFooter />
    </div>
  );
}
