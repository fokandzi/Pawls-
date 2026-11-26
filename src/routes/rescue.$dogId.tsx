import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { sql } from "../db";

// ── Types ────────────────────────────────────────────────────────────────────

type RescueDogDetail = {
  id: number;
  shelter_id: number;
  name: string;
  breed: string;
  age: number;
  size: string;
  gender: string;
  description: string;
  good_with_dogs: boolean;
  good_with_kids: boolean;
  good_with_cats: boolean;
  photo_url: string | null;
  urgent: boolean;
  shelter_name: string;
  shelter_location: string;
  shelter_description: string;
  shelter_phone: string | null;
  shelter_email: string | null;
  shelter_website: string | null;
};

// ── Server function ──────────────────────────────────────────────────────────

const getDogDetail = createServerFn({ method: "GET" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null || !("dogId" in data)) {
      throw new Error("dogId is required");
    }
    return { dogId: Number((data as { dogId: string }).dogId) };
  })
  .handler(async ({ data }) => {
    try {

      const [dog] = await sql()`
        SELECT 
          d.id, d.shelter_id, d.name, d.breed, d.age, d.size, d.gender,
          d.description, d.good_with_dogs, d.good_with_kids, d.good_with_cats,
          d.photo_url, d.urgent,
          s.name AS shelter_name, s.location AS shelter_location,
          s.description AS shelter_description,
          s.phone AS shelter_phone, s.email AS shelter_email,
          s.website AS shelter_website
        FROM rescue_dogs d
        JOIN shelters s ON d.shelter_id = s.id
        WHERE d.id = ${data.dogId} AND s.is_demo = false
      `;

      if (!dog) {
        return { dog: null, error: "Dog not found" };
      }

      return { dog: dog as RescueDogDetail, error: null };
    } catch {
      return { dog: null, error: "Database not connected" };
    }
  });

// ── Route definition ─────────────────────────────────────────────────────────

import { seoHead } from "../lib/seo";
import { t, DEFAULT_LANG, type Lang } from "../lib/i18n";
import { resolveRouteLang } from "../lib/i18n/route-lang";

/** Minimal {placeholder} interpolation for the SEO templates (same shape the
 * /book/$providerId detail route uses). */
function seoFill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

export const Route = createFileRoute("/rescue/$dogId")({
  // FR-first SSR title/meta (P2 item 5): the not-found branch was hard-coded EN
  // ("Rescue Dog — Pawls") and the named branch used an EN-only generator.
  head: ({ loaderData }) => {
    const L: Lang = (loaderData as { lang?: Lang } | undefined)?.lang ?? DEFAULT_LANG;
    const d = loaderData as { dog: { name: string; breed: string } | null };
    if (d?.dog) {
      const vars = { name: d.dog.name, breed: d.dog.breed };
      return seoHead({
        title: seoFill(t("rescueDetail.seoNamedTitle", L), vars),
        description: seoFill(t("rescueDetail.seoNamedDesc", L), vars),
        path: `/rescue/${encodeURIComponent(d.dog.name.toLowerCase())}`,
      });
    }
    return seoHead({
      title: t("rescueDetail.seoTitle", L),
      description: t("rescueDetail.seoDesc", L),
      path: "/rescue",
    });
  },
  loader: async ({ params }) => {
    const data = await getDogDetail({ data: { dogId: params.dogId } });
    let lang: Lang = DEFAULT_LANG;
    try {
      lang = await resolveRouteLang();
    } catch {
      lang = DEFAULT_LANG;
    }
    return { ...data, lang };
  },
  component: RescueDogDetailPage,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const sizeEmoji: Record<string, string> = {
  small: "",
  medium: "",
  large: "",
};

function sizeLabelFor(size: string, L: Lang): string {
  if (size === "small") return t("rescueDetail.sizeSmall", L);
  if (size === "medium") return t("rescueDetail.sizeMedium", L);
  if (size === "large") return t("rescueDetail.sizeLarge", L);
  return size;
}

const breedEmojis: Record<string, string> = {
  "Labrador": "",
  "Golden Retriever": "",
  "German Shepherd": "‍",
  "Staffordshire Bull Terrier": "",
  "Jack Russell Terrier": "",
  "Beagle": "",
  "Border Collie": "",
  "Cavalier King Charles Spaniel": "",
  "French Bulldog": "",
  "Husky": "",
  "Rottweiler": "‍",
  "Cocker Spaniel": "",
  "Shiba Inu": "",
  "Boxer": "",
};

function dogEmoji(breed: string): string {
  for (const [key, emoji] of Object.entries(breedEmojis)) {
    if (breed.includes(key)) return emoji;
  }
  return "";
}

function ageLabel(age: number, L: Lang): string {
  if (age < 1) return t("rescueDetail.ageUnderOne", L);
  if (age === 1) return t("rescueDetail.ageOne", L);
  return `${age} ${t("rescueDetail.ageYears", L)}`;
}

// ── Component ────────────────────────────────────────────────────────────────

function RescueDogDetailPage() {
  const { dog, error, lang: serverLang } = Route.useLoaderData() as { dog: RescueDogDetail | null; error: string | null; lang?: Lang };
  const L: Lang = serverLang ?? DEFAULT_LANG;

  // Error / loading states
  if (error || !dog) {
    return (
      <div className="flex min-h-dvh flex-col">

        <section className="flex flex-1 items-center justify-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-20">
          <div className="max-w-sm text-center">
            <span className="text-5xl"></span>
            <h2 className="mt-4 text-2xl font-bold text-gray-900">
              {error === "Dog not found" ? t("rescueDetail.notFoundTitle", L) : t("rescueDetail.comingSoonTitle", L)}
            </h2>
            <p className="mt-2 text-gray-600">
              {error === "Dog not found"
                ? t("rescueDetail.notFoundBody", L)
                : t("rescueDetail.comingSoonBody", L)}
            </p>
            <Link
              to="/rescue"
              className="mt-6 inline-flex items-center gap-1 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--pawls-terracotta-500)]/20 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
            >
              {t("rescueDetail.back", L)}
            </Link>
          </div>
        </section>
      </div>
    );
  }

  // No mailto/apply flow: these are demo listings and shelters are not yet
  // partners, so there is no real contact or adoption flow to offer (Phase 1a).

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}

      {/* Back link */}
      <div className="bg-white px-6 pt-6">
        <div className="mx-auto max-w-4xl">
          <Link
            to="/rescue"
            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--pawls-terracotta-500)] hover:text-[var(--pawls-terracotta-700)] transition-colors"
          >
            {t("rescueDetail.back", L)}
          </Link>
        </div>
      </div>

      {/* Urgent banner — demo data, so no implied contactable shelter */}
      {dog.urgent && (
        <div className="bg-red-500 px-6 py-3">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-sm font-bold text-white">
              {t("rescueDetail.urgentBanner", L)}
            </p>
          </div>
        </div>
      )}

      {/* Main content */}
      <section className="bg-white px-6 pb-20 pt-8">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Left column: photo + key stats */}
            <div className="lg:col-span-1">
              {/* Photo placeholder */}
              <div className="relative h-64 overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--pawls-cream-100)] to-[var(--pawls-cream-50)] lg:h-80">
                {dog.photo_url ? (
                  <img src={dog.photo_url} alt={`${dog.name} — ${dog.breed}`} className="absolute inset-0 h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                ) : (
                  <span className="text-9xl">{dogEmoji(dog.breed)}</span>
                )}
              </div>

              {/* Key stats card */}
              <div className="mt-6 rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-5">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">{t("rescueDetail.about", L)}</h3>
                <dl className="space-y-3">
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">{t("rescueDetail.breed", L)}</dt>
                    <dd className="text-sm font-semibold text-gray-900">{dog.breed}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">{t("rescueDetail.age", L)}</dt>
                    <dd className="text-sm font-semibold text-gray-900">{ageLabel(dog.age, L)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">{t("rescueDetail.size", L)}</dt>
                    <dd className="text-sm font-semibold text-gray-900">
                      {sizeEmoji[dog.size]} {sizeLabelFor(dog.size, L)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">{t("rescueDetail.gender", L)}</dt>
                    <dd className="text-sm font-semibold text-gray-900">
                      {dog.gender === "male" ? t("rescueDetail.male", L) : t("rescueDetail.female", L)}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Compatibility card */}
              <div className="mt-4 rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-5">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
                  {t("rescueDetail.goodWith", L)}
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-lg ${dog.good_with_dogs ? "" : "opacity-40"}`}>
                      {dog.good_with_dogs ? "" : ""}
                    </span>
                    <span className={`text-sm ${dog.good_with_dogs ? "font-medium text-gray-900" : "text-gray-400"}`}>
                       {t("rescueDetail.otherDogs", L)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-lg ${dog.good_with_kids ? "" : "opacity-40"}`}>
                      {dog.good_with_kids ? "" : ""}
                    </span>
                    <span className={`text-sm ${dog.good_with_kids ? "font-medium text-gray-900" : "text-gray-400"}`}>
                       {t("rescueDetail.children", L)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-lg ${dog.good_with_cats ? "" : "opacity-40"}`}>
                      {dog.good_with_cats ? "" : ""}
                    </span>
                    <span className={`text-sm ${dog.good_with_cats ? "font-medium text-gray-900" : "text-gray-400"}`}>
                       {t("rescueDetail.cats", L)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right column: description + shelter */}
            <div className="lg:col-span-2">
              {/* Dog name + basics */}
              <div className="mb-6">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
                    {dog.name}
                  </h1>
                  {/* Demo listing badge — matches the list page pattern */}
                  <span className="inline-flex items-center rounded-full bg-[var(--pawls-cream-100)] px-2.5 py-1 text-xs font-semibold text-[var(--pawls-gold-500)] shadow-sm">
                    {t("rescueDetail.demo", L)}
                  </span>
                </div>
                <p className="mt-1 text-lg text-gray-500">{dog.breed} · {sizeLabelFor(dog.size, L)} · {ageLabel(dog.age, L)}</p>
              </div>
              {/* Description */}
              <div className="mb-8">
                <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("rescueDetail.aboutNamed", L)} {dog.name}</h2>
                <p className="leading-relaxed text-gray-700">{dog.description}</p>
              </div>
              {/* Adoption flow — coming soon (no fake Apply flow) */}
              <div className="mb-10">
                <span className="inline-flex items-center gap-2 rounded-full bg-gray-200 px-8 py-3.5 text-base font-semibold text-gray-500">
                  🐾 {t("rescueDetail.adoptionSoon", L)}
                </span>
                <p className="mt-2 text-sm text-gray-400">
                  {t("rescueDetail.adoptionSoonBody", L)}
                </p>
              </div>
              {/* Shelter info */}
              <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/30 p-6">
                <h2 className="mb-1 text-lg font-semibold text-gray-900">{dog.shelter_name}</h2>
                <p className="mb-4 text-sm text-gray-500"> {dog.shelter_location}</p>
                <p className="mb-4 text-sm leading-relaxed text-gray-600">{dog.shelter_description}</p>

                <div className="space-y-2 border-t border-[var(--pawls-cream-100)] pt-4">
                  <p className="text-sm text-gray-400">
                    {t("rescueDetail.contactHidden", L)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
    </div>
  );
}
