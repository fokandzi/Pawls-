import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { sql } from "../db";
import { createBookingTables } from "../db/schema";
import { EmptyState } from "../lib/empty-state";

type Provider = {
  id: number;
  name: string;
  category: string;
  description: string;
  location: string;
  image_url: string | null;
  rating: number;
  review_count: number;
};

const categoryConfig: Record<
  string,
  { labelKey: string; bg: string; text: string; emoji: string }
> = {
  walker: {
    labelKey: "book.cat.walker",
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    emoji: "",
  },
  groomer: {
    labelKey: "book.cat.groomer",
    bg: "bg-purple-100",
    text: "text-purple-700",
    emoji: "",
  },
  sitter: {
    labelKey: "book.cat.sitter",
    bg: "bg-sky-100",
    text: "text-sky-700",
    emoji: "",
  },
  trainer: {
    labelKey: "book.cat.trainer",
    bg: "bg-[var(--pawls-cream-100)]",
    text: "text-[var(--pawls-gold-500)]",
    emoji: "",
  },
  vet: {
    labelKey: "book.cat.vet",
    bg: "bg-rose-100",
    text: "text-rose-700",
    emoji: "",
  },
};

function renderStars(rating: number) {
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.25;
  const stars = [];
  for (let i = 0; i < full; i++) stars.push("");
  if (hasHalf) stars.push("");
  return stars.join("");
}

import { seoHead } from "../lib/seo";
import { t, DEFAULT_LANG, type Lang } from "../lib/i18n";

const loadProviders = createServerFn({ method: "GET" }).handler(async () => {
  await createBookingTables();
  try {
    // P0 Data: REAL providers only — seeded/demo rows never appear as supply,
    // and only approved providers are bookable. There are none yet, so the
    // page shows the honest "coming soon" state.
    //
    // REAL-ONLY clause (identical to the /book/register counter in
    // src/lib/provider-core.ts): a provider is public supply only when it is
    // non-demo, approved, bound to a real owner account AND that owner is not a
    // test account. Legacy unowned "approved" rows (owner_user_id IS NULL) and
    // their fabricated ratings are therefore never listed — the public sees the
    // honest empty state. The rows themselves are never deleted or modified.
    const rows = (await sql()`
      SELECT p.id, p.name, p.category, p.description, p.location, p.image_url, p.rating, p.review_count
      FROM providers p
      JOIN users u ON u.id = p.owner_user_id
      WHERE p.is_demo = false
        AND p.approval_status = 'approved'
        AND p.owner_user_id IS NOT NULL
        AND u.is_test = false
      ORDER BY p.rating DESC NULLS LAST, p.id DESC
    `) as Provider[];
    return { providers: rows, error: null };
  } catch {
    return { providers: null, error: "Database not connected" };
  }
});

export const Route = createFileRoute("/book/")({
  head: () => seoHead({ title: t("book.seoTitle", DEFAULT_LANG), description: t("book.seoDesc", DEFAULT_LANG) }),
  loader: () => loadProviders(),
  component: BookPage,
});

function BookPage() {
  const L: Lang = DEFAULT_LANG;
  const { providers, error } = Route.useLoaderData();
  return (
    <>
          {/* Hero strip */}
          <section className="bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 pb-12 pt-8 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              {t("book.heading", L)}
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-base text-gray-600">
              {t("book.subtitle", L)}
            </p>
          </section>

          {/* Join CTA + customer/provider entry points (batch D1 surfaces) */}
          <section className="bg-white px-6 pb-8">
            <div className="mx-auto max-w-6xl text-center">
              <Link
                to="/book/register"
                className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--pawls-terracotta-500)] bg-white px-6 py-3 text-sm font-semibold text-[var(--pawls-terracotta-500)] shadow-sm transition-all hover:bg-[var(--pawls-terracotta-500)] hover:text-white"
              >
                 {t("book.listBusiness", L)}
              </Link>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-sm">
                <Link to="/book/my-bookings" className="rounded-full border border-[var(--pawls-cream-200)] bg-white px-5 py-2 font-semibold text-gray-700 transition-colors hover:bg-[var(--pawls-cream-50)]">
                  Mes réservations
                </Link>
                <Link to="/book/provider" className="rounded-full border border-[var(--pawls-cream-200)] bg-white px-5 py-2 font-semibold text-gray-700 transition-colors hover:bg-[var(--pawls-cream-50)]">
                  Espace prestataire
                </Link>
              </div>
              <p className="mx-auto mt-3 max-w-xl text-xs text-gray-500">
                Les paiements ne sont pas encore activés : une réservation est enregistrée sans paiement et bloque son créneau.
              </p>
            </div>
          </section>

          {/* Provider grid */}
          <section className="bg-white px-6 pb-20">
            <div className="mx-auto max-w-6xl">
              {error || !providers || providers.length === 0 ? (
                <EmptyState
                  title={t("book.comingSoonTitle", L)}
                  description={t("book.comingSoonBody", L)}
                />
              ) : (
                /* Provider cards grid */
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {providers.map((provider) => {
                    const cfg = categoryConfig[provider.category] ?? {
                      labelKey: `book.cat.${provider.category}`,
                      bg: "bg-gray-100",
                      text: "text-gray-600",
                      emoji: "",
                    };

                    return (
                      <a
                        key={provider.id}
                        href={`/book/${provider.id}`}
                        target="_self"
                        rel="external"
                        className="group relative flex cursor-pointer flex-col rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-6 shadow-sm transition-all duration-300 hover:border-amber-300 hover:shadow-md"
                      >
                        {/* Image placeholder */}
                        <div className="mb-4 flex h-40 items-center justify-center overflow-hidden rounded-xl bg-[var(--pawls-cream-50)]">
                          {provider.image_url ? <img src={provider.image_url} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.src = "/logo-full.png"; }} /> : <span className="text-5xl">{cfg.emoji}</span>}
                        </div>

                        {/* Category badge + location */}
                        <div className="mb-3 flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}
                          >
                            {cfg.labelKey ? t(cfg.labelKey, L) : provider.category}
                          </span>
                          <span className="text-xs text-gray-400">
                             {provider.location}
                          </span>
                        </div>

                        {/* Name */}
                        <h3 className="mb-1 text-lg font-bold text-gray-900 group-hover:text-[var(--pawls-terracotta-500)] transition-colors">
                          {provider.name}
                        </h3>

                        {/* Rating — only from real reviews (none exist yet). */}
                        {Number(provider.review_count) > 0 && (
                          <div className="mb-2 flex items-center gap-1">
                            <span className="text-sm font-medium text-[var(--pawls-cream-50)]0">
                              {renderStars(provider.rating)}
                            </span>
                            <span className="text-sm font-semibold text-gray-700">
                              {Number(provider.rating).toFixed(1)}
                            </span>
                            <span className="text-xs text-gray-400">
                              ({provider.review_count} reviews)
                            </span>
                          </div>
                        )}

                        {/* Description excerpt */}
                        <p className="line-clamp-3 text-sm leading-relaxed text-gray-600">
                          {provider.description}
                        </p>

                        {/* View button hint */}
                        <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[var(--pawls-terracotta-500)] opacity-0 transition-opacity group-hover:opacity-100">
                          {t("book.viewServices", L)}
                        </div>
                      </a>
                      );
                      })}
                </div>
              )}
            </div>
          </section>
    </>
  );
}
