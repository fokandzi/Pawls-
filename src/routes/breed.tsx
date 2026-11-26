import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { sql } from "../db";
import { EmptyState } from "../lib/empty-state";

// ── Seed data ──────────────────────────────────────────────────────────────



// ── Server functions ───────────────────────────────────────────────────────

type Breeder = {
  id: number;
  name: string;
  location: string;
  description: string;
  breed_specialty: string;
  verification_status: string;
  membership_tier: string;
  years_experience: number;
  health_testing: string;
  image_url: string | null;
  is_demo: boolean;
};



const getBreeders = createServerFn({ method: "GET" }).handler(async () => {
  try {

    // P0 Data: no auto-seeding from page views. Demo fixture breeders are
    // clearly badged as "Demo listing" below; real breeders will appear here
    // once breeder onboarding + verification ship.

    const rows = await sql()`
      SELECT id, name, location, description, breed_specialty, verification_status, membership_tier, years_experience, health_testing, image_url, is_demo
      FROM breeders
      ORDER BY 
        CASE membership_tier WHEN 'premium' THEN 1 WHEN 'plus' THEN 2 ELSE 3 END,
        name ASC
    `;
    return { breeders: rows as Breeder[], error: null };
  } catch {
    return { breeders: null, error: "Database not connected" };
  }
});

// ── Route definition ──────────────────────────────────────────────────────

import { seoHead } from "../lib/seo";
import { t, DEFAULT_LANG, type Lang } from "../lib/i18n";
import { resolveRouteLang } from "../lib/i18n/route-lang";

export const Route = createFileRoute("/breed")({
  head: () => seoHead({ title: t("breed.title", DEFAULT_LANG), description: t("breed.desc", DEFAULT_LANG), path: "/breed" }),
  loader: async () => {
    const data = await getBreeders();
    let lang: Lang = DEFAULT_LANG;
    try {
      lang = await resolveRouteLang();
    } catch {
      lang = DEFAULT_LANG;
    }
    return { ...data, lang };
  },
  component: BreedPage,
});

// ── Helpers ────────────────────────────────────────────────────────────────

const breedEmojis: Record<string, string> = {
  "Labrador Retriever": "",
  "Pembroke Welsh Corgi": "",
  "Golden Retriever": "",
  "Border Collie": "",
  "French Bulldog": "",
  "Bernese Mountain Dog": "‍",
};

function breederEmoji(breedSpecialty: string): string {
  for (const [breed, emoji] of Object.entries(breedEmojis)) {
    if (breedSpecialty.includes(breed)) return emoji;
  }
  return "";
}

function membershipBadge(tier: string, lang: Lang) {
  if (tier === "premium") {
    return { label: t("breed.premium", lang), bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-300" };
  }
  if (tier === "plus") {
    return { label: t("breed.plus", lang), bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-300" };
  }
  return null;
}

function verificationBadge(status: string, isDemo: boolean, lang: Lang) {
  // Honest display (owner directive 2026-08-14): demo fixture breeders must
  // NEVER look like genuine pending applicants — a demo row ALWAYS shows
  // "Demo listing", regardless of its verification_status column. Real rows are
  // shown as pending: there is no verification programme to pass.
  if (isDemo) {
    return { label: t("breed.demoBadge", lang), bg: "bg-[var(--pawls-cream-100)]", text: "text-[var(--pawls-gold-500)]" };
  }
  // 2026-11-26 content patch: Pawls runs NO verification programme, so no real
  // row may be labelled "Vérifié" — every real row is honestly shown as pending
  // until a programme exists. (`status` is kept in the signature for callers.)
  void status;
  return { label: t("breed.pending", lang), bg: "bg-[var(--pawls-cream-100)]", text: "text-[var(--pawls-gold-500)]" };
}

// ── Component ──────────────────────────────────────────────────────────────

function BreedPage() {
  const { breeders, error, lang: serverLang } = Route.useLoaderData() as { breeders: Breeder[] | null; error: string | null; lang?: Lang };
  const routerState = useRouterState();
  const isExactBreed = routerState.location.pathname === "/breed";
  const lang: Lang = serverLang ?? DEFAULT_LANG;

  // Extract unique breeds for filter pills
  const allBreeds = breeders
    ? [...new Set(breeders.map((b) => b.breed_specialty))].sort()
    : [];

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <AppHeader active="breed" lang={lang} />

      {isExactBreed ? (
        <>
          {/* Hero */}
          <section className="bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 pb-12 pt-8 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              {t("breed.heroTitle", lang)}
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-base text-gray-600">
              {t("breed.heroSub", lang)}
            </p>
          </section>

          {/* Breed education tips */}
          <section className="bg-white px-6 pb-12">
            <div className="mx-auto max-w-6xl">
              <h2 className="mb-6 text-center text-2xl font-bold text-gray-900">
                {t("breed.guideTitle", lang)}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-5">
                  <div className="mb-2 text-2xl"></div>
                  <h3 className="mb-1 font-semibold text-gray-900">{t("breed.guide1Title", lang)}</h3>
                  <p className="text-sm leading-relaxed text-gray-600">
                    {t("breed.guide1Body", lang)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-5">
                  <div className="mb-2 text-2xl"></div>
                  <h3 className="mb-1 font-semibold text-gray-900">{t("breed.guide2Title", lang)}</h3>
                  <p className="text-sm leading-relaxed text-gray-600">
                    {t("breed.guide2Body", lang)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-5">
                  <div className="mb-2 text-2xl"></div>
                  <h3 className="mb-1 font-semibold text-gray-900">{t("breed.guide3Title", lang)}</h3>
                  <p className="text-sm leading-relaxed text-gray-600">
                    {t("breed.guide3Body", lang)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-5">
                  <div className="mb-2 text-2xl"></div>
                  <h3 className="mb-1 font-semibold text-gray-900">{t("breed.guide4Title", lang)}</h3>
                  <p className="text-sm leading-relaxed text-gray-600">
                    {t("breed.guide4Body", lang)}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Join CTA */}
          <section className="bg-white px-6 pb-8">
            <div className="mx-auto max-w-6xl text-center">
              <Link
                to="/breed/register"
                className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--pawls-terracotta-500)] bg-white px-6 py-3 text-sm font-semibold text-[var(--pawls-terracotta-500)] shadow-sm transition-all hover:bg-[var(--pawls-terracotta-500)] hover:text-white"
              >
                {t("breed.joinTitle", lang)}
              </Link>
            </div>
          </section>

          {/* Breeder grid */}
          <section className="bg-white px-6 pb-20">
            <div className="mx-auto max-w-6xl">
              {error || !breeders || breeders.length === 0 ? (
                <EmptyState
                  title={t("breed.emptyTitle", lang)}
                  description={t("breed.emptyBody", lang)}
                />
              ) : (
                <>
                  {/* Breed filter pills */}
                  <div className="mb-6 flex flex-wrap gap-2">
                    {allBreeds.map((breed) => (
                      <a
                        key={breed}
                        href={`#breed-${breed.replace(/\s+/g, "-").toLowerCase()}`}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)] px-3 py-1.5 text-xs font-medium text-[var(--pawls-ink-700)] transition-colors hover:border-[var(--pawls-terracotta-500)] hover:bg-[var(--pawls-cream-100)]"
                      >
                        {breederEmoji(breed)} {breed}
                      </a>
                    ))}
                  </div>

                  {/* Cards grid */}
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {breeders.map((breeder) => {
                      // P0 Data: membership tier badges are fabricated for
                      // fixture rows — only show them for real breeders.
                      const mb = breeder.is_demo ? null : membershipBadge(breeder.membership_tier, lang);
                      const vb = verificationBadge(breeder.verification_status, breeder.is_demo, lang);
                      const emoji = breederEmoji(breeder.breed_specialty);

                      return (
                        <Link
                          key={breeder.id}
                          to="/breed/$breederId"
                          params={{ breederId: String(breeder.id) }}
                          id={`breed-${breeder.breed_specialty.replace(/\s+/g, "-").toLowerCase()}`}
                          className={`group relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md ${
                            breeder.membership_tier === "premium"
                              ? "border-yellow-300 ring-1 ring-yellow-200"
                              : "border-[var(--pawls-cream-100)]"
                          }`}
                        >
                          {/* Photo */}
                          <div className="relative mb-4 flex h-40 items-center justify-center overflow-hidden rounded-xl bg-[var(--pawls-cream-50)]">
                            <img
                              src={`/dogs/breed-${breeder.breed_specialty.toLowerCase().replace(/\s+/g, "-")}.jpg`}
                              alt={breeder.breed_specialty}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                const img = e.target as HTMLImageElement;
                                img.style.display = "none";
                                const fallback = img.parentElement?.querySelector(".emoji-fallback");
                                if (fallback) fallback.classList.remove("hidden");
                              }}
                            />
                            <span className="emoji-fallback hidden text-5xl">{emoji}</span>
                          </div>

                          {/* Breed specialty badge */}
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center rounded-full bg-[var(--pawls-cream-50)] px-2.5 py-0.5 text-xs font-medium text-[var(--pawls-gold-500)]">
                              {breeder.breed_specialty}
                            </span>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${vb.bg} ${vb.text}`}>
                              {vb.label}
                            </span>
                          </div>

                          {/* Name */}
                          <h3 className="mb-1 text-lg font-bold text-gray-900 group-hover:text-[var(--pawls-terracotta-500)] transition-colors">
                            {breeder.name}
                          </h3>

                          {/* Location */}
                          <p className="mb-2 text-xs text-gray-500"> {breeder.location}</p>

                          {/* Membership badge */}
                          {mb && (
                            <span className={`mb-2 inline-flex items-center self-start rounded-full border px-2 py-0.5 text-xs font-semibold ${mb.bg} ${mb.text} ${mb.border}`}>
                              {mb.label}
                            </span>
                          )}

                          {/* Experience */}
                          <p className="mb-3 text-xs text-gray-400">
                            {t("breed.yearsExperience", lang).replace("{count}", String(breeder.years_experience))}
                          </p>

                          {/* Description excerpt */}
                          <p className="line-clamp-2 flex-1 text-sm leading-relaxed text-gray-600">
                            {t(breeder.description, lang)}
                          </p>

                          {/* View link */}
                          <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[var(--pawls-terracotta-500)] opacity-0 transition-opacity group-hover:opacity-100">
                            {t("breed.view", lang)}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </section>
        </>
      ) : (
        <Outlet />
      )}

      {/* Footer */}
      <AppFooter lang={lang} />
    </div>
  );
}
