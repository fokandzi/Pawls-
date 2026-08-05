import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { sql } from "../db";
import { createRescueTables } from "../db/schema";

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
      await createRescueTables();

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
        WHERE d.id = ${data.dogId}
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

import { seoHead, seoRescueDog } from "../lib/seo";

export const Route = createFileRoute("/rescue/$dogId")({
  head: ({ loaderData }) => {
    const d = loaderData as { dog: { name: string; breed: string } | null };
    if (d?.dog) {
      return seoHead(seoRescueDog(d.dog.name, d.dog.breed));
    }
    return seoHead({ title: "Rescue Dog — Pawls", description: "View rescue dog details on Pawls.", path: "/rescue" });
  },
  loader: ({ params }) => getDogDetail({ data: { dogId: params.dogId } }),
  component: RescueDogDetailPage,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const sizeEmoji: Record<string, string> = {
  small: "",
  medium: "",
  large: "",
};

const sizeLabel: Record<string, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

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

function ageLabel(age: number): string {
  if (age < 1) return "Under 1 year";
  if (age === 1) return "1 year old";
  return `${age} years old`;
}

// ── Component ────────────────────────────────────────────────────────────────

function RescueDogDetailPage() {
  const { dog, error } = Route.useLoaderData();

  // Error / loading states
  if (error || !dog) {
    return (
      <div className="flex min-h-dvh flex-col">

        <section className="flex flex-1 items-center justify-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-20">
          <div className="max-w-sm text-center">
            <span className="text-5xl"></span>
            <h2 className="mt-4 text-2xl font-bold text-gray-900">
              {error === "Dog not found" ? "Dog not found" : "Coming soon"}
            </h2>
            <p className="mt-2 text-gray-600">
              {error === "Dog not found"
                ? "This dog may have been adopted or the listing was removed."
                : "Our rescue listings are being set up. Check back soon!"}
            </p>
            <Link
              to="/rescue"
              className="mt-6 inline-flex items-center gap-1 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--pawls-terracotta-500)]/20 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
            >
              ← Back to all dogs
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const mailtoSubject = encodeURIComponent(`Adoption inquiry: ${dog.name} (${dog.breed})`);
  const mailtoBody = encodeURIComponent(
    `Hello ${dog.shelter_name},\n\nI'm interested in adopting ${dog.name} (${dog.breed}, ${ageLabel(dog.age)}).\n\nCould you tell me more about the adoption process?\n\nThank you!`
  );
  const mailtoHref = dog.shelter_email
    ? `mailto:${dog.shelter_email}?subject=${mailtoSubject}&body=${mailtoBody}`
    : "#";

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
            ← Back to all dogs
          </Link>
        </div>
      </div>

      {/* Urgent banner */}
      {dog.urgent && (
        <div className="bg-red-500 px-6 py-3">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-sm font-bold text-white">
               URGENT — This dog needs a home soon! Please reach out to {dog.shelter_name} today.
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
              <div className="flex h-64 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--pawls-cream-100)] to-[var(--pawls-cream-50)] lg:h-80">
                {dog.photo_url ? (
                  <img src={dog.photo_url} alt={`${dog.name} — ${dog.breed}`} className="h-full w-full rounded-2xl object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                ) : (
                  <span className="text-9xl">{dogEmoji(dog.breed)}</span>
                )}
              </div>

              {/* Key stats card */}
              <div className="mt-6 rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-5">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">About</h3>
                <dl className="space-y-3">
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">Breed</dt>
                    <dd className="text-sm font-semibold text-gray-900">{dog.breed}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">Age</dt>
                    <dd className="text-sm font-semibold text-gray-900">{ageLabel(dog.age)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">Size</dt>
                    <dd className="text-sm font-semibold text-gray-900">
                      {sizeEmoji[dog.size]} {sizeLabel[dog.size] ?? dog.size}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">Gender</dt>
                    <dd className="text-sm font-semibold text-gray-900">
                      {dog.gender === "male" ? " Male" : " Female"}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Compatibility card */}
              <div className="mt-4 rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-5">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
                  Good with
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-lg ${dog.good_with_dogs ? "" : "opacity-40"}`}>
                      {dog.good_with_dogs ? "" : ""}
                    </span>
                    <span className={`text-sm ${dog.good_with_dogs ? "font-medium text-gray-900" : "text-gray-400"}`}>
                       Other dogs
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-lg ${dog.good_with_kids ? "" : "opacity-40"}`}>
                      {dog.good_with_kids ? "" : ""}
                    </span>
                    <span className={`text-sm ${dog.good_with_kids ? "font-medium text-gray-900" : "text-gray-400"}`}>
                       Children
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-lg ${dog.good_with_cats ? "" : "opacity-40"}`}>
                      {dog.good_with_cats ? "" : ""}
                    </span>
                    <span className={`text-sm ${dog.good_with_cats ? "font-medium text-gray-900" : "text-gray-400"}`}>
                       Cats
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right column: description + shelter */}
            <div className="lg:col-span-2">
              {/* Dog name + basics */}
              <div className="mb-6">
                <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
                  {dog.name}
                </h1>
                <p className="mt-1 text-lg text-gray-500">{dog.breed} · {sizeLabel[dog.size] ?? dog.size} · {ageLabel(dog.age)}</p>
              </div>

              {/* Description */}
              <div className="mb-8">
                <h2 className="mb-3 text-lg font-semibold text-gray-900">About {dog.name}</h2>
                <p className="leading-relaxed text-gray-700">{dog.description}</p>
              </div>

              {/* Apply button */}
              <div className="mb-10">
                <a
                  href={mailtoHref}
                  className={`inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-base font-semibold shadow-lg transition-colors ${
                    dog.shelter_email
                      ? "bg-[var(--pawls-terracotta-500)] text-white shadow-[var(--pawls-terracotta-500)]/25 hover:bg-[var(--pawls-terracotta-700)]"
                      : "pointer-events-none bg-gray-300 text-gray-500"
                  }`}
                >
                   Apply to Adopt
                </a>
                {!dog.shelter_email && (
                  <p className="mt-2 text-xs text-gray-400">
                    No email address available. Please contact the shelter directly (details below).
                  </p>
                )}
              </div>

              {/* Shelter info */}
              <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/30 p-6">
                <h2 className="mb-1 text-lg font-semibold text-gray-900">{dog.shelter_name}</h2>
                <p className="mb-4 text-sm text-gray-500"> {dog.shelter_location}</p>
                <p className="mb-4 text-sm leading-relaxed text-gray-600">{dog.shelter_description}</p>

                <div className="space-y-2 border-t border-[var(--pawls-cream-100)] pt-4">
                  {dog.shelter_phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400"></span>
                      <a href={`tel:${dog.shelter_phone}`} className="text-[var(--pawls-terracotta-500)] hover:underline">
                        {dog.shelter_phone}
                      </a>
                    </div>
                  )}
                  {dog.shelter_email && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400"></span>
                      <a href={`mailto:${dog.shelter_email}`} className="text-[var(--pawls-terracotta-500)] hover:underline">
                        {dog.shelter_email}
                      </a>
                    </div>
                  )}
                  {dog.shelter_website && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400"></span>
                      <a
                        href={dog.shelter_website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--pawls-terracotta-500)] hover:underline"
                      >
                        Visit website
                      </a>
                    </div>
                  )}
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
