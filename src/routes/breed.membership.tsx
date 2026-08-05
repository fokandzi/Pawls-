import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { createMembershipCheckout } from "../db/payments";

// ── Tier definitions ─────────────────────────────────────────────────────

const tiers = [
  {
    key: "free",
    name: "Free",
    price: "€0",
    priceCents: 0,
    period: "/mo",
    features: [
      "Basic breeder listing",
      "1 active litter",
      "Standard visibility in search",
      "Health testing display",
      "Breed education tips",
    ],
    cta: "Current Plan",
    highlight: false,
  },
  {
    key: "plus",
    name: "Plus",
    price: "€25",
    priceCents: 2500,
    period: "/mo",
    features: [
      "Everything in Free",
      "Highlighted listing in search",
      "Up to 3 active litters",
      "Health test badges on listing",
      "Priority email support",
      "Breeder detail page enhancements",
    ],
    cta: "Upgrade to Plus",
    highlight: false,
    popular: true,
  },
  {
    key: "premium",
    name: "Premium",
    price: "€40",
    priceCents: 4000,
    period: "/mo",
    features: [
      "Everything in Plus",
      "Featured placement on /breed",
      "Unlimited active litters",
      "⭐ Verified breeder badge",
      "Homepage feature rotation",
      "Litter analytics & insights",
      "Dedicated account manager",
    ],
    cta: "Upgrade to Premium",
    highlight: true,
  },
];

// ── Route ─────────────────────────────────────────────────────────────────

import { seoHead, SEO } from "../lib/seo";

export const Route = createFileRoute("/breed/membership")({
  head: () => seoHead(SEO["breed/membership"]),
  component: MembershipPage,
});

function MembershipPage() {
  const router = useRouter();

  const handleUpgrade = async (tierKey: string, priceCents: number) => {
    if (tierKey === "free") return;

    try {
      const result = await createMembershipCheckout({
        data: {
          breederId: 0, // Placeholder — in production this would come from auth
          tier: tierKey as "plus" | "premium",
          priceCents,
        },
      });

      if ("url" in result && result.url) {
        window.location.href = result.url;
      } else if ("error" in result) {
        alert(result.error || "Something went wrong. Please try again.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert("Checkout failed: " + message);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}

      <main className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white">
        {/* Hero */}
        <section className="px-6 pb-8 pt-12 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
            Grow Your Breeding Program
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-base text-gray-600">
            Choose the plan that fits your kennel. Upgrade anytime — more visibility, more litters, more families connected with your dogs.
          </p>
        </section>

        {/* Tier cards */}
        <section className="mx-auto max-w-6xl px-6 pb-20">
          <div className="grid gap-6 md:grid-cols-3">
            {tiers.map((tier) => {
              const isGold = tier.key === "premium";
              const isPlus = tier.key === "plus";

              return (
                <div
                  key={tier.key}
                  className={`relative flex flex-col rounded-2xl border-2 bg-white p-6 shadow-sm transition-shadow hover:shadow-lg sm:p-8 ${
                    isGold
                      ? "border-yellow-400 ring-2 ring-yellow-200"
                      : "border-[var(--pawls-cream-100)]"
                  }`}
                >
                  {/* Most Popular badge */}
                  {tier.popular && (
                    <div className="absolute -top-3 left-0 right-0 flex justify-center">
                      <span className="inline-flex items-center rounded-full bg-gradient-to-r from-[var(--pawls-cream-50)]0 to-[var(--pawls-terracotta-500)] px-4 py-1 text-xs font-bold text-white shadow-md">
                        Most Popular
                      </span>
                    </div>
                  )}

                  {/* Tier name & price */}
                  <div className="mb-6 text-center">
                    <h2
                      className={`text-xl font-bold ${
                        isGold ? "text-yellow-700" : "text-gray-900"
                      }`}
                    >
                      {tier.name}
                    </h2>
                    <div className="mt-3 flex items-baseline justify-center gap-1">
                      <span className="text-4xl font-extrabold text-gray-900">
                        {tier.price}
                      </span>
                      <span className="text-sm text-gray-500">
                        {tier.period}
                      </span>
                    </div>
                  </div>

                  {/* Features */}
                  <ul className="mb-8 flex-1 space-y-3">
                    {tier.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-sm text-gray-600"
                      >
                        <span className="mt-0.5 flex-shrink-0 text-green-500">
                          
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {/* CTA button */}
                  <button
                    onClick={() =>
                      handleUpgrade(tier.key, tier.priceCents)
                    }
                    disabled={tier.key === "free"}
                    className={`w-full rounded-full px-6 py-3 text-sm font-semibold transition-all ${
                      tier.key === "free"
                        ? "cursor-default border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)] text-[var(--pawls-gold-500)]"
                        : isGold
                          ? "bg-gradient-to-r from-yellow-500 to-[var(--pawls-gold-500)] text-white shadow-lg shadow-[var(--pawls-cream-50)]0/30 hover:from-yellow-600 hover:to-[var(--pawls-gold-500)]"
                          : "bg-[var(--pawls-terracotta-500)] text-white shadow-md shadow-[var(--pawls-terracotta-500)]/20 hover:bg-[var(--pawls-terracotta-700)]"
                    }`}
                  >
                    {tier.cta}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Back link */}
          <div className="mt-10 text-center">
            <Link
              to="/breed"
              className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-[var(--pawls-terracotta-500)] transition-colors"
            >
              ← Back to breeders
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
    </div>
  );
}
