import { createFileRoute, Link } from "@tanstack/react-router";
import { t, DEFAULT_LANG, type Lang } from "../lib/i18n";
import { resolveRouteLang } from "../lib/i18n/route-lang";
import { seoHead } from "../lib/seo";

// ── Tier definitions ─────────────────────────────────────────────────────
//
// Honesty (2026-11-26 content patch): the membership product does not exist
// yet, so NO price is announced here — the previous €25/mo and €40/mo figures
// were a claim about something nobody can buy. The "verified breeder badge"
// claim is gone too: Pawls runs no verification programme. What remains is the
// intended shape of the tiers, labelled as coming later.

const tiers = [
  {
    key: "free",
    nameKey: "breedMem.free",
    featureKeys: ["breedMem.free1", "breedMem.free2", "breedMem.free3", "breedMem.free4", "breedMem.free5"],
    ctaKey: "breedMem.ctaCurrent",
    highlight: false,
    popular: false,
  },
  {
    key: "plus",
    nameKey: "breedMem.plus",
    featureKeys: ["breedMem.plus1", "breedMem.plus2", "breedMem.plus3", "breedMem.plus4", "breedMem.plus5", "breedMem.plus6"],
    ctaKey: "breedMem.ctaSoon",
    highlight: false,
    popular: true,
  },
  {
    key: "premium",
    nameKey: "breedMem.premium",
    featureKeys: ["breedMem.premium1", "breedMem.premium2", "breedMem.premium3", "breedMem.premium4", "breedMem.premium5", "breedMem.premium6"],
    ctaKey: "breedMem.ctaSoon",
    highlight: true,
    popular: false,
  },
];

// ── Route ─────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/breed/membership")({
  loader: async (): Promise<{ lang: Lang }> => {
    try {
      return { lang: await resolveRouteLang() };
    } catch {
      return { lang: DEFAULT_LANG };
    }
  },
  head: ({ loaderData }) => {
    const L: Lang = (loaderData as { lang?: Lang } | undefined)?.lang ?? DEFAULT_LANG;
    return seoHead({
      title: `${t("breedMem.title", L)} — Pawls`,
      description: t("breedMem.intro", L),
      path: "/breed/membership",
    });
  },
  component: MembershipPage,
});

function MembershipPage() {
  const { lang: serverLang } = Route.useLoaderData() as { lang?: Lang };
  const L: Lang = serverLang ?? DEFAULT_LANG;

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white">
        {/* Hero */}
        <section className="px-6 pb-8 pt-12 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
            {t("breedMem.title", L)}
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-base text-gray-600">{t("breedMem.intro", L)}</p>
        </section>

        {/* Tier cards */}
        <section className="mx-auto max-w-6xl px-6 pb-20">
          <div className="grid gap-6 md:grid-cols-3">
            {tiers.map((tier) => {
              const isGold = tier.key === "premium";

              return (
                <div
                  key={tier.key}
                  className={`relative flex flex-col rounded-2xl border-2 bg-white p-6 shadow-sm transition-shadow hover:shadow-lg sm:p-8 ${
                    isGold ? "border-yellow-400 ring-2 ring-yellow-200" : "border-[var(--pawls-cream-100)]"
                  }`}
                >
                  {/* Most Popular badge */}
                  {tier.popular && (
                    <div className="absolute -top-3 left-0 right-0 flex justify-center">
                      <span className="inline-flex items-center rounded-full bg-gradient-to-r from-[var(--pawls-gold-400)] to-[var(--pawls-terracotta-500)] px-4 py-1 text-xs font-bold text-white shadow-md">
                        {t("breedMem.plus", L)}
                      </span>
                    </div>
                  )}

                  {/* Tier name & price */}
                  <div className="mb-6 text-center">
                    <h2 className={`text-xl font-bold ${isGold ? "text-yellow-700" : "text-gray-900"}`}>
                      {t(tier.nameKey, L)}
                    </h2>
                    <div className="mt-3 flex items-baseline justify-center gap-1">
                      <span className="text-sm font-semibold text-gray-500">{t("breedMem.noPrice", L)}</span>
                    </div>
                  </div>

                  {/* Features */}
                  <ul className="mb-8 flex-1 space-y-3">
                    {tier.featureKeys.map((featureKey) => (
                      <li key={featureKey} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="mt-0.5 flex-shrink-0 text-green-500" aria-hidden="true">
                          ✓
                        </span>
                        {t(featureKey, L)}
                      </li>
                    ))}
                  </ul>

                  {/* CTA button */}
                  <button
                    disabled
                    className={`w-full cursor-not-allowed rounded-full px-6 py-3 text-sm font-semibold ${
                      tier.key === "free"
                        ? "border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)] text-[var(--pawls-gold-500)]"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {t(tier.ctaKey, L)}
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
              {t("breedMem.back", L)}
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
