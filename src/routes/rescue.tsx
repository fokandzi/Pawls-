import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { sql } from "../db";
import { createRescueTables } from "../db/schema";
import { EmptyState } from "../lib/empty-state";

// ── Types ────────────────────────────────────────────────────────────────────

type Shelter = {
  id: number;
  name: string;
  location: string;
  description: string;
  phone: string | null;
  email: string | null;
  website: string | null;
};

type RescueDog = {
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
  shelter_email: string | null;
  shelter_phone: string | null;
};

// ── Seed data ────────────────────────────────────────────────────────────────

type ShelterSeed = {
  name: string;
  location: string;
  description: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  dogs: {
    name: string;
    breed: string;
    age: number;
    size: string;
    gender: string;
    description: string;
    good_with_dogs: boolean;
    good_with_kids: boolean;
    good_with_cats: boolean;
    urgent: boolean;
  }[];
};

const seedShelters: ShelterSeed[] = [
  {
    name: "SPA de Paris",
    location: "Paris 13e",
    description:
      "The Paris branch of the Société Protectrice des Animaux, France's oldest animal welfare organisation. We rescue, rehabilitate, and rehome hundreds of dogs every year from our modern facility in the 13th arrondissement.",
    phone: "+33 1 43 89 76 00",
    email: "adoption@spa-paris.fr",
    website: "https://www.la-spa.fr/paris",
    dogs: [
      {
        name: "Bella",
        breed: "Staffordshire Bull Terrier Mix",
        age: 3,
        size: "medium",
        gender: "female",
        description:
          "Bella is a sweet, affectionate girl who loves nothing more than curling up on the couch with her favourite humans. She walks beautifully on the leash and knows basic commands. Bella would thrive in a calm home where she can be the centre of attention. She's been waiting over 6 months for her forever family.",
        good_with_dogs: false,
        good_with_kids: true,
        good_with_cats: false,
        urgent: true,
      },
      {
        name: "Rocky",
        breed: "Labrador Retriever",
        age: 5,
        size: "large",
        gender: "male",
        description:
          "Rocky is a classic Lab — friendly, food-motivated, and always wagging his tail. He loves swimming, fetch, and long walks in the Jardin du Luxembourg. Rocky gets along well with other dogs and would make a wonderful family companion. He's house-trained and knows several commands.",
        good_with_dogs: true,
        good_with_kids: true,
        good_with_cats: true,
        urgent: false,
      },
      {
        name: "Toby",
        breed: "Jack Russell Terrier",
        age: 2,
        size: "small",
        gender: "male",
        description:
          "Toby is a bundle of energy in a small package! This clever little terrier loves agility games, puzzle toys, and going on adventures along the Seine. He'd suit an active owner who can keep his mind and body busy. Toby is house-trained and crate-trained.",
        good_with_dogs: true,
        good_with_kids: false,
        good_with_cats: false,
        urgent: false,
      },
      {
        name: "Nala",
        breed: "German Shepherd",
        age: 4,
        size: "large",
        gender: "female",
        description:
          "Nala is a loyal and intelligent shepherd who forms deep bonds with her people. She's protective but not aggressive, and she's received professional training. Nala needs an experienced owner who understands the breed. She'd excel at obedience or scent work.",
        good_with_dogs: true,
        good_with_kids: true,
        good_with_cats: false,
        urgent: false,
      },
    ],
  },
  {
    name: "Refuge de Gennevilliers",
    location: "Gennevilliers",
    description:
      "Refuge de Gennevilliers serves the northern suburbs of Paris, providing loving temporary care for abandoned and surrendered dogs. Our dedicated team works tirelessly to match each dog with the perfect home.",
    phone: "+33 1 47 33 55 00",
    email: "contact@refuge-gennevilliers.fr",
    website: "https://www.refuge-gennevilliers.fr",
    dogs: [
      {
        name: "Charlie",
        breed: "Beagle",
        age: 6,
        size: "medium",
        gender: "male",
        description:
          "Charlie is a gentle, easygoing beagle who loves sniffing around the garden and napping in sunny spots. He's great with children and other dogs. Charlie would suit a relaxed household where he can enjoy his golden years surrounded by love.",
        good_with_dogs: true,
        good_with_kids: true,
        good_with_cats: true,
        urgent: false,
      },
      {
        name: "Daisy",
        breed: "Border Collie Mix",
        age: 1,
        size: "medium",
        gender: "female",
        description:
          "Daisy is a bright, eager-to-please young collie with bags of potential. She picks up new commands incredibly fast and has already mastered sit, stay, and recall. Daisy needs an active home where she'll get plenty of exercise and mental stimulation. She'd be a star at dog sports!",
        good_with_dogs: true,
        good_with_kids: true,
        good_with_cats: false,
        urgent: false,
      },
      {
        name: "Oscar",
        breed: "Cavalier King Charles Spaniel",
        age: 8,
        size: "small",
        gender: "male",
        description:
          "Oscar is a sweet senior gentleman looking for a quiet retirement home. He loves gentle walks, cuddling on laps, and being told he's a good boy. Oscar has a heart murmur that's well-managed with medication. He's the perfect companion for someone who wants a calm, loving friend.",
        good_with_dogs: true,
        good_with_kids: true,
        good_with_cats: true,
        urgent: true,
      },
    ],
  },
  {
    name: "Fondation Assistance aux Animaux",
    location: "Paris 15e",
    description:
      "Fondation Assistance aux Animaux is a non-profit foundation dedicated to rescuing dogs from difficult situations across the Île-de-France region. We provide medical care, rehabilitation, and a second chance at happiness.",
    phone: "+33 1 45 31 60 00",
    email: "adoption@assistance-aux-animaux.fr",
    website: "https://www.assistance-aux-animaux.fr",
    dogs: [
      {
        name: "Lola",
        breed: "French Bulldog",
        age: 4,
        size: "small",
        gender: "female",
        description:
          "Lola is a charming Frenchie with a big personality. She loves belly rubs, squeaky toys, and following her humans everywhere. Lola is house-trained and walks well on a harness. She'd do best as an only dog where she can soak up all the attention.",
        good_with_dogs: false,
        good_with_kids: true,
        good_with_cats: false,
        urgent: false,
      },
      {
        name: "Max",
        breed: "Husky Mix",
        age: 2,
        size: "large",
        gender: "male",
        description:
          "Max is a stunning husky mix with piercing blue eyes and a playful spirit. He loves running in the Bois de Boulogne, howling along to music, and digging in sand. Max needs a securely fenced garden and an owner who understands high-energy breeds. He's incredibly affectionate once he trusts you.",
        good_with_dogs: true,
        good_with_kids: false,
        good_with_cats: false,
        urgent: false,
      },
      {
        name: "Zara",
        breed: "Rottweiler",
        age: 3,
        size: "large",
        gender: "female",
        description:
          "Zara is a gentle giant who doesn't realise her own size! She's calm, well-mannered, and surprisingly delicate when taking treats. Zara has been through professional training and responds beautifully to commands. She'd be an amazing companion for someone who appreciates the breed.",
        good_with_dogs: true,
        good_with_kids: true,
        good_with_cats: true,
        urgent: false,
      },
      {
        name: "Milo",
        breed: "Cocker Spaniel",
        age: 5,
        size: "medium",
        gender: "male",
        description:
          "Milo is a cheerful cocker spaniel with a permanently wagging tail. He adores people, gets along with everyone, and is always up for a cuddle. Milo needs regular grooming to keep his beautiful coat healthy. He's fully house-trained and walks nicely on the lead.",
        good_with_dogs: true,
        good_with_kids: true,
        good_with_cats: true,
        urgent: false,
      },
    ],
  },
  {
    name: "Refuge de Thiais",
    location: "Thiais",
    description:
      "Refuge de Thiais has been serving the southern Paris community for over 30 years. We provide shelter, veterinary care, and adoption services for dogs in need. Our knowledgeable staff offer post-adoption support to ensure successful matches.",
    phone: "+33 1 46 87 83 00",
    email: "contact@refuge-thiais.fr",
    website: "https://www.refuge-thiais.fr",
    dogs: [
      {
        name: "Finn",
        breed: "Golden Retriever",
        age: 7,
        size: "large",
        gender: "male",
        description:
          "Finn is a sweet senior golden who still has plenty of love to give. He enjoys leisurely walks in the Bois de Vincennes, swimming in the summer, and being brushed. Finn is excellent with children and other pets. He's looking for a family to spend his retirement years with — could that be you?",
        good_with_dogs: true,
        good_with_kids: true,
        good_with_cats: true,
        urgent: false,
      },
      {
        name: "Kiki",
        breed: "Shiba Inu",
        age: 3,
        size: "medium",
        gender: "female",
        description:
          "Kiki is a beautiful, independent Shiba Inu with a cat-like personality. She's clean, quiet, and surprisingly agile. Kiki needs an experienced owner who understands primitive breeds — she's not a cuddly lapdog but will be a loyal and fascinating companion for the right person.",
        good_with_dogs: false,
        good_with_kids: false,
        good_with_cats: true,
        urgent: false,
      },
      {
        name: "Duke",
        breed: "Boxer Mix",
        age: 1,
        size: "large",
        gender: "male",
        description:
          "Duke is a young, goofy boxer mix who thinks he's still a tiny puppy. He's full of enthusiasm and wiggles his entire body when he's happy. Duke is learning his manners and would benefit from continued training. He loves playing with other dogs and would thrive in an active household.",
        good_with_dogs: true,
        good_with_kids: true,
        good_with_cats: false,
        urgent: false,
      },
    ],
  },
];

// ── Server functions ─────────────────────────────────────────────────────────

const seedRescueData = createServerFn({ method: "POST" }).handler(async () => {
  await createRescueTables();

  // Check if already seeded
  const [dogCount] = await sql()`SELECT COUNT(*)::int AS count FROM rescue_dogs`;
  if (Number(dogCount.count) > 0) {
    return { success: true, count: 0, message: "Already seeded" };
  }

  for (const s of seedShelters) {
    const [shelter] = await sql()`
      INSERT INTO shelters (name, location, description, phone, email, website)
      VALUES (${s.name}, ${s.location}, ${s.description}, ${s.phone}, ${s.email}, ${s.website})
      RETURNING id
    `;

    if (shelter) {
      for (const d of s.dogs) {
        await sql()`
          INSERT INTO rescue_dogs (shelter_id, name, breed, age, size, gender, description, good_with_dogs, good_with_kids, good_with_cats, urgent)
          VALUES (${shelter.id}, ${d.name}, ${d.breed}, ${d.age}, ${d.size}, ${d.gender}, ${d.description}, ${d.good_with_dogs}, ${d.good_with_kids}, ${d.good_with_cats}, ${d.urgent})
        `;
      }
    }
  }

  return { success: true, count: seedShelters.length };
});

const getRescueDogs = createServerFn({ method: "GET" }).handler(async () => {
  try {
    await createRescueTables();

    // Auto-seed if empty
    const [dogCount] = await sql()`SELECT COUNT(*)::int AS count FROM rescue_dogs`;
    if (Number(dogCount.count) === 0) {
      for (const s of seedShelters) {
        const [shelter] = await sql()`
          INSERT INTO shelters (name, location, description, phone, email, website)
          VALUES (${s.name}, ${s.location}, ${s.description}, ${s.phone}, ${s.email}, ${s.website})
          RETURNING id
        `;
        if (shelter) {
          for (const d of s.dogs) {
            await sql()`
              INSERT INTO rescue_dogs (shelter_id, name, breed, age, size, gender, description, good_with_dogs, good_with_kids, good_with_cats, urgent)
              VALUES (${shelter.id}, ${d.name}, ${d.breed}, ${d.age}, ${d.size}, ${d.gender}, ${d.description}, ${d.good_with_dogs}, ${d.good_with_kids}, ${d.good_with_cats}, ${d.urgent})
            `;
          }
        }
      }
    }

    const rows = await sql()`
      SELECT 
        d.id, d.shelter_id, d.name, d.breed, d.age, d.size, d.gender,
        d.description, d.good_with_dogs, d.good_with_kids, d.good_with_cats,
        d.photo_url, d.urgent,
        s.name AS shelter_name, s.location AS shelter_location,
        s.email AS shelter_email, s.phone AS shelter_phone
      FROM rescue_dogs d
      JOIN shelters s ON d.shelter_id = s.id
      ORDER BY d.urgent DESC, d.created_at DESC
    `;

    return { dogs: rows as RescueDog[], error: null };
  } catch {
    return { dogs: null, error: "Database not connected" };
  }
});

// ── Route definition ─────────────────────────────────────────────────────────

import { seoHead, SEO } from "../lib/seo";

export const Route = createFileRoute("/rescue")({
  head: () => seoHead(SEO.rescue),
  loader: () => getRescueDogs(),
  component: RescuePage,
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

const sizeBadge: Record<string, { bg: string; text: string }> = {
  small: { bg: "bg-sky-100", text: "text-sky-700" },
  medium: { bg: "bg-[var(--pawls-cream-100)]", text: "text-[var(--pawls-gold-500)]" },
  large: { bg: "bg-rose-100", text: "text-rose-700" },
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
  if (age < 1) return "Puppy";
  if (age === 1) return "1 year";
  return `${age} years`;
}

// ── Component ────────────────────────────────────────────────────────────────

function RescuePage() {
  const { dogs, error } = Route.useLoaderData();
  const routerState = useRouterState();
  const isExactRescue = routerState.location.pathname === "/rescue";

  // Filter state
  const [sizeFilter, setSizeFilter] = useState<string | null>(null);
  const [dogsFilter, setDogsFilter] = useState<boolean | null>(null);
  const [kidsFilter, setKidsFilter] = useState<boolean | null>(null);
  const [catsFilter, setCatsFilter] = useState<boolean | null>(null);

  const filteredDogs = dogs
    ? dogs.filter((d) => {
        if (sizeFilter && d.size !== sizeFilter) return false;
        if (dogsFilter !== null && d.good_with_dogs !== dogsFilter) return false;
        if (kidsFilter !== null && d.good_with_kids !== kidsFilter) return false;
        if (catsFilter !== null && d.good_with_cats !== catsFilter) return false;
        return true;
      })
    : null;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <AppHeader active="rescue" />

      {isExactRescue ? (
        <>
          {/* Hero */}
          <section className="bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 pb-12 pt-8 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Find Your Forever Friend 
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-base text-gray-600">
              Browse adoptable dogs from shelters across the Paris region. Every dog deserves a loving home — could yours be the one?
            </p>
          </section>

          {error || !dogs || dogs.length === 0 ? (
            <section className="bg-white px-6 pb-20">
              <div className="mx-auto max-w-6xl">
                <EmptyState
                  title="No rescue dogs available yet"
                  description="Shelters are adding adoptable dogs all the time. Check back soon."
                />
              </div>
            </section>
          ) : (
            <>
              {/* Filter bar */}
              <section className="bg-white px-6 pb-8">
                <div className="mx-auto max-w-6xl">
                  <div className="flex flex-wrap gap-6">
                    {/* Size filter */}
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Size</span>
                      <div className="flex gap-2">
                        {(["small", "medium", "large"] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => setSizeFilter(sizeFilter === s ? null : s)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
                              sizeFilter === s
                                ? "bg-[var(--pawls-terracotta-500)] text-white shadow-sm"
                                : "bg-[var(--pawls-cream-50)] text-gray-600 hover:bg-[var(--pawls-cream-100)]"
                            }`}
                          >
                            {sizeEmoji[s]} {sizeLabel[s]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Compatibility toggle chips */}
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Good with</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setDogsFilter(dogsFilter === null ? true : dogsFilter === true ? false : null)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
                            dogsFilter === true
                              ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"
                              : dogsFilter === false
                                ? "bg-red-50 text-red-500 line-through ring-1 ring-red-200"
                                : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                          }`}
                        >
                           Dogs
                        </button>
                        <button
                          onClick={() => setKidsFilter(kidsFilter === null ? true : kidsFilter === true ? false : null)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
                            kidsFilter === true
                              ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"
                              : kidsFilter === false
                                ? "bg-red-50 text-red-500 line-through ring-1 ring-red-200"
                                : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                          }`}
                        >
                           Kids
                        </button>
                        <button
                          onClick={() => setCatsFilter(catsFilter === null ? true : catsFilter === true ? false : null)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
                            catsFilter === true
                              ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"
                              : catsFilter === false
                                ? "bg-red-50 text-red-500 line-through ring-1 ring-red-200"
                                : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                          }`}
                        >
                           Cats
                        </button>
                      </div>
                    </div>

                    {/* Active filters summary */}
                    {(sizeFilter || dogsFilter !== null || kidsFilter !== null || catsFilter !== null) && (
                      <div className="flex items-end">
                        <button
                          onClick={() => {
                            setSizeFilter(null);
                            setDogsFilter(null);
                            setKidsFilter(null);
                            setCatsFilter(null);
                          }}
                          className="text-sm font-medium text-[var(--pawls-terracotta-500)] hover:text-[var(--pawls-terracotta-700)] underline underline-offset-2"
                        >
                          Clear all filters
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Result count */}
                  <p className="mt-4 text-sm text-gray-400">
                    Showing {filteredDogs?.length ?? 0} of {dogs.length} dogs
                  </p>
                </div>
              </section>

              {/* Dog cards grid */}
              <section className="bg-white px-6 pb-20">
                <div className="mx-auto max-w-6xl">
                  {filteredDogs && filteredDogs.length > 0 ? (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                      {filteredDogs.map((dog) => {
                        const szCfg = sizeBadge[dog.size] ?? sizeBadge.medium;
                        return (
                          <Link
                            key={dog.id}
                            to="/rescue/$dogId"
                            params={{ dogId: String(dog.id) }}
                            className="group relative overflow-hidden rounded-2xl border border-[var(--pawls-cream-100)] bg-white shadow-sm transition-all hover:border-[var(--pawls-cream-200)] hover:shadow-md"
                          >
                            {/* Urgent banner */}
                            {dog.urgent && (
                              <div className="absolute right-3 top-3 z-10">
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white shadow-md">
                                   URGENT
                                </span>
                              </div>
                            )}

                            {/* Photo */}
                            <div className="relative flex h-48 items-center justify-center overflow-hidden bg-gradient-to-br from-[var(--pawls-cream-100)] to-[var(--pawls-cream-50)]">
                              <img
                                src={`/dogs/${dog.name.toLowerCase()}.jpg`}
                                alt={dog.name}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  const img = e.target as HTMLImageElement;
                                  img.style.display = "none";
                                  const fallback = img.parentElement?.querySelector(".emoji-fallback");
                                  if (fallback) fallback.classList.remove("hidden");
                                }}
                              />
                              <span className="emoji-fallback hidden text-7xl">{dogEmoji(dog.breed)}</span>
                            </div>

                            {/* Card info */}
                            <div className="p-5">
                              <div className="mb-2 flex items-start justify-between">
                                <div>
                                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-[var(--pawls-terracotta-500)] transition-colors">
                                    {dog.name}
                                  </h3>
                                  <p className="text-sm text-gray-500">{dog.breed}</p>
                                </div>
                                <span className="text-lg font-bold text-[var(--pawls-terracotta-500)]">
                                  {ageLabel(dog.age)}
                                </span>
                              </div>

                              {/* Badges */}
                              <div className="mb-3 flex flex-wrap gap-2">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${szCfg.bg} ${szCfg.text}`}
                                >
                                  {sizeEmoji[dog.size]} {sizeLabel[dog.size] ?? dog.size}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-1 text-xs font-medium text-purple-700">
                                  {dog.gender === "male" ? "" : ""}{" "}
                                  {dog.gender.charAt(0).toUpperCase() + dog.gender.slice(1)}
                                </span>
                              </div>

                              {/* Location + Shelter */}
                              <p className="text-sm text-gray-500">
                                 {dog.shelter_location}
                              </p>
                              <p className="text-xs text-gray-400">
                                {dog.shelter_name}
                              </p>

                              {/* Compatibility */}
                              <div className="mt-3 flex gap-3 text-xs text-gray-500">
                                <span
                                  className={dog.good_with_dogs ? "" : "text-gray-300 line-through"}
                                >
                                   dogs
                                </span>
                                <span
                                  className={dog.good_with_kids ? "" : "text-gray-300 line-through"}
                                >
                                   kids
                                </span>
                                <span
                                  className={dog.good_with_cats ? "" : "text-gray-300 line-through"}
                                >
                                   cats
                                </span>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    /* No results with filters */
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/50 px-6 py-16 text-center">
                      <span className="text-5xl"></span>
                      <h3 className="mt-4 text-xl font-bold text-gray-900">No dogs match your filters</h3>
                      <p className="mt-2 text-gray-600">Try adjusting your filters to see more results.</p>
                      <button
                        onClick={() => {
                          setSizeFilter(null);
                          setDogsFilter(null);
                          setKidsFilter(null);
                          setCatsFilter(null);
                        }}
                        className="mt-4 text-sm font-medium text-[var(--pawls-terracotta-500)] hover:text-[var(--pawls-terracotta-700)] underline underline-offset-2"
                      >
                        Clear all filters
                      </button>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </>
      ) : (
        <Outlet />
      )}

      {/* Footer */}
      <AppFooter />
    </div>
  );
}
