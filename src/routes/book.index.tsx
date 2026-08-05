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
  { label: string; bg: string; text: string; emoji: string }
> = {
  walker: {
    label: "Walker",
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    emoji: "",
  },
  groomer: {
    label: "Groomer",
    bg: "bg-purple-100",
    text: "text-purple-700",
    emoji: "",
  },
  sitter: {
    label: "Sitter",
    bg: "bg-sky-100",
    text: "text-sky-700",
    emoji: "",
  },
  trainer: {
    label: "Trainer",
    bg: "bg-[var(--pawls-cream-100)]",
    text: "text-[var(--pawls-gold-500)]",
    emoji: "",
  },
  vet: {
    label: "Vet",
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

import { seoHead, SEO } from "../lib/seo";

const loadProviders = createServerFn({ method: "GET" }).handler(async () => {
  await createBookingTables();
  try {
    const rows = (await sql()`
      SELECT id, name, category, description, location, image_url, rating, review_count
      FROM providers ORDER BY rating DESC
    `) as Provider[];
    return { providers: rows, error: null };
  } catch {
    return { providers: null, error: "Database not connected" };
  }
});

export const Route = createFileRoute("/book/")({
  head: () => seoHead(SEO.book),
  loader: () => loadProviders(),
  component: BookPage,
});

function BookPage() {
  const { providers, error } = Route.useLoaderData();
  return (
    <>
          {/* Hero strip */}
          <section className="bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 pb-12 pt-8 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Book dog services
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-base text-gray-600">
              Find and book trusted walkers, groomers, sitters, trainers, and vets
              near you.
            </p>
          </section>

          {/* Join CTA */}
          <section className="bg-white px-6 pb-8">
            <div className="mx-auto max-w-6xl text-center">
              <Link
                to="/book/register"
                className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--pawls-terracotta-500)] bg-white px-6 py-3 text-sm font-semibold text-[var(--pawls-terracotta-500)] shadow-sm transition-all hover:bg-[var(--pawls-terracotta-500)] hover:text-white"
              >
                 List Your Business — Free
              </Link>
            </div>
          </section>

          {/* Provider grid */}
          <section className="bg-white px-6 pb-20">
            <div className="mx-auto max-w-6xl">
              {error || !providers || providers.length === 0 ? (
                <EmptyState
                  title="No providers available yet"
                  description="Check back soon for trusted walkers, groomers, sitters, trainers, and vets near you."
                />
              ) : (
                /* Provider cards grid */
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {providers.map((provider) => {
                    const cfg = categoryConfig[provider.category] ?? {
                      label: provider.category,
                      bg: "bg-gray-100",
                      text: "text-gray-600",
                      emoji: "",
                    };

                    return (
                      <span
                        key={provider.id}
                        onClick={() => { window.location.href = `/book/${provider.id}`; }}
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
                            {cfg.label}
                          </span>
                          <span className="text-xs text-gray-400">
                             {provider.location}
                          </span>
                        </div>

                        {/* Name */}
                        <h3 className="mb-1 text-lg font-bold text-gray-900 group-hover:text-[var(--pawls-terracotta-500)] transition-colors">
                          {provider.name}
                        </h3>

                        {/* Rating */}
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

                        {/* Description excerpt */}
                        <p className="line-clamp-3 text-sm leading-relaxed text-gray-600">
                          {provider.description}
                        </p>

                        {/* View button hint */}
                        <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[var(--pawls-terracotta-500)] opacity-0 transition-opacity group-hover:opacity-100">
                          View services →
                        </div>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
    </>
  );
}
