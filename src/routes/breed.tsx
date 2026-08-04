import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { sql } from "../db";
import { createBreedTables } from "../db/schema";
import { EmptyState } from "../lib/empty-state";

// ── Seed data ──────────────────────────────────────────────────────────────

type BreederSeed = {
  name: string;
  location: string;
  description: string;
  breed_specialty: string;
  verification_status: string;
  membership_tier: string;
  years_experience: number;
  health_testing: string;
  litters: {
    breed: string;
    birth_date: string;
    available_count: number;
    total_count: number;
    price_cents: number;
    health_tests: string;
    description: string;
  }[];
};

const seedBreeders: BreederSeed[] = [
  {
    name: "Labradors d'Île-de-France",
    location: "Rambouillet, Yvelines",
    description:
      "Family-run Labrador breeding program with over 20 years of experience in the Yvelines countryside. We raise healthy, well-tempered Labradors in a loving home environment. All our dogs are hip-scored and DNA-tested.",
    breed_specialty: "Labrador Retriever",
    verification_status: "verified",
    membership_tier: "premium",
    years_experience: 22,
    health_testing: "OFA Hip, Elbow, Eye (CERF), EIC DNA, PRA DNA, CNM DNA",
    litters: [
      {
        breed: "Labrador Retriever",
        birth_date: "2026-05-15",
        available_count: 4,
        total_count: 8,
        price_cents: 180000,
        health_tests: "OFA Hip, Elbow, CERF Eye Exam, DNA Panel (EIC, PRA, CNM)",
        description: "Champion-sired yellow and black puppies. Both parents cleared for hips, elbows, and eyes. Raised with Puppy Culture protocols in our family home.",
      },
      {
        breed: "Labrador Retriever",
        birth_date: "2026-06-20",
        available_count: 6,
        total_count: 9,
        price_cents: 165000,
        health_tests: "OFA Good/Excellent, Elbow Normal, DNA Clear",
        description: "Chocolate lab puppies from our foundation bitch. Excellent temperaments — both parents are therapy dogs.",
      },
    ],
  },
  {
    name: "Les Corgis de l'Essonne",
    location: "Évry, Essonne",
    description:
      "Dedicated Pembroke Welsh Corgi breeder in the Essonne department, south of Paris. We prioritize health testing and sound temperament above all else. Our pups are raised underfoot with daily handling.",
    breed_specialty: "Pembroke Welsh Corgi",
    verification_status: "verified",
    membership_tier: "free",
    years_experience: 12,
    health_testing: "OFA Hip, von Willebrand Disease (vWD) DNA, DM DNA, Eye Exam",
    litters: [
      {
        breed: "Pembroke Welsh Corgi",
        birth_date: "2026-06-01",
        available_count: 2,
        total_count: 6,
        price_cents: 220000,
        health_tests: "vWD Clear, DM Carrier (safe), OFA Hip Good, Eye Normal",
        description: "Beautiful red & white pups. Both parents are health-tested with excellent breed club scores. Raised in our living room!",
      },
    ],
  },
  {
    name: "Goldens du Val-de-Marne",
    location: "Créteil, Val-de-Marne",
    description:
      "Ethical Golden Retriever breeder in the Val-de-Marne, focused on preserving the breed's gentle temperament. We health screen all breeding stock and provide lifetime support to our puppy families.",
    breed_specialty: "Golden Retriever",
    verification_status: "verified",
    membership_tier: "plus",
    years_experience: 15,
    health_testing: "OFA Hip, Elbow, Heart, Eye (CERF), DNA Panel (GR-PRA1, PRA2, MD, ICT-A)",
    litters: [
      {
        breed: "Golden Retriever",
        birth_date: "2026-04-28",
        available_count: 3,
        total_count: 7,
        price_cents: 195000,
        health_tests: "OFA Hip Good, Elbow Normal, Heart Clear, Eye Normal, DNA Clear all 4",
        description: "European champion lines. These golden pups come from fully health-tested parents with outstanding family temperaments.",
      },
    ],
  },
  {
    name: "Border Collies de Seine-et-Marne",
    location: "Meaux, Seine-et-Marne",
    description:
      "Working-line Border Collie breeder in Seine-et-Marne. We breed for soundness, intelligence, and drive. All breeding dogs have working titles and complete health clearances. Countryside setting just 40 minutes from Paris.",
    breed_specialty: "Border Collie",
    verification_status: "verified",
    membership_tier: "free",
    years_experience: 10,
    health_testing: "OFA Hip, Elbow, Eye (CEA) DNA, MDR1 DNA, TNS DNA, BAER Hearing",
    litters: [
      {
        breed: "Border Collie",
        birth_date: "2026-05-30",
        available_count: 3,
        total_count: 6,
        price_cents: 175000,
        health_tests: "CEA Non-Affected, MDR1 Clear, TNS Clear, OFA Hip Good, BAER Normal",
        description: "Intelligent, driven pups from working sheepdog lines. Ideal for active homes, agility, or herding. Not suitable for sedentary households.",
      },
      {
        breed: "Border Collie",
        birth_date: "2026-07-01",
        available_count: 5,
        total_count: 7,
        price_cents: 155000,
        health_tests: "CEA Carrier, MDR1 Clear, TNS Clear, OFA Hip Fair, BAER Normal",
        description: "Slightly lower-drive litter — great for active families who don't plan to compete. Still 100% health-tested.",
      },
    ],
  },
  {
    name: "Frenchies de Paris",
    location: "Paris 15e, Paris",
    description:
      "Health-first French Bulldog breeder in the heart of Paris. We're committed to improving the breed through rigorous health testing, including BOAS grading, spine screening, and DNA panels. No extreme features.",
    breed_specialty: "French Bulldog",
    verification_status: "verified",
    membership_tier: "free",
    years_experience: 8,
    health_testing: "BOAS Grade (RFG), Spine (X-ray), OFA Patella, DNA (DM, HUU, CMR1, JHC), Cardiac Echo",
    litters: [
      {
        breed: "French Bulldog",
        birth_date: "2026-06-10",
        available_count: 2,
        total_count: 4,
        price_cents: 350000,
        health_tests: "BOAS Grade 0, Spine Clear, Patella Normal, DNA Clear, Cardiac Normal",
        description: "Exceptional health-tested French Bulldog pups. Longer muzzle, open nares, excellent BOAS scores. Bred for health, not extremes.",
      },
    ],
  },
  {
    name: "Bouviers de l'Oise",
    location: "Beauvais, Oise",
    description:
      "Passionate Bernese Mountain Dog breeder in the Oise countryside, just north of Paris. We focus on longevity and health — all our breeding dogs are extensively screened. Puppies raised with ENS and Puppy Culture.",
    breed_specialty: "Bernese Mountain Dog",
    verification_status: "verified",
    membership_tier: "premium",
    years_experience: 18,
    health_testing: "OFA Hip, Elbow, Cardiac, Eye (CERF), DM DNA, Histiocytic Sarcoma DNA (SH)", 
    litters: [
      {
        breed: "Bernese Mountain Dog",
        birth_date: "2026-04-15",
        available_count: 1,
        total_count: 5,
        price_cents: 240000,
        health_tests: "OFA Hip Good, Elbow Normal, Cardiac Clear, DM Clear, SH Marker Negative",
        description: "Our spring litter from our top-rated dam. Only 1 pup remaining — gorgeous tri-color boy with fantastic conformation.",
      },
      {
        breed: "Bernese Mountain Dog",
        birth_date: "2026-07-05",
        available_count: 6,
        total_count: 8,
        price_cents: 225000,
        health_tests: "OFA Hip Excellent, Elbow Normal, Cardiac Clear, DNA Clear",
        description: "Summer litter just arrived! Both parents in the top 5% of the breed for hip scores. Expected to be calm, gentle family dogs.",
      },
    ],
  },
];

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
};

const ensureBreedTables = createServerFn({ method: "POST" }).handler(async () => {
  await createBreedTables();
  return { success: true };
});

const seedBreedersFn = createServerFn({ method: "POST" }).handler(async () => {
  await createBreedTables();

  const [existing] = await sql()`SELECT COUNT(*)::int AS count FROM breeders`;
  if (Number(existing.count) > 0) {
    return { success: true, count: 0, message: "Already seeded" };
  }

  for (const b of seedBreeders) {
    const [breeder] = await sql()`
      INSERT INTO breeders (name, location, description, breed_specialty, verification_status, membership_tier, years_experience, health_testing)
      VALUES (${b.name}, ${b.location}, ${b.description}, ${b.breed_specialty}, ${b.verification_status}, ${b.membership_tier}, ${b.years_experience}, ${b.health_testing})
      RETURNING id
    `;

    if (breeder) {
      for (const l of b.litters) {
        await sql()`
          INSERT INTO litters (breeder_id, breed, birth_date, available_count, total_count, price_cents, health_tests, description)
          VALUES (${breeder.id}, ${l.breed}, ${l.birth_date}::date, ${l.available_count}, ${l.total_count}, ${l.price_cents}, ${l.health_tests}, ${l.description})
        `;
      }
    }
  }

  return { success: true, count: seedBreeders.length };
});

const getBreeders = createServerFn({ method: "GET" }).handler(async () => {
  try {
    await createBreedTables();

    // Auto-seed if empty
    const [countRow] = await sql()`SELECT COUNT(*)::int AS count FROM breeders`;
    if (Number(countRow.count) === 0) {
      for (const b of seedBreeders) {
        const [breeder] = await sql()`
          INSERT INTO breeders (name, location, description, breed_specialty, verification_status, membership_tier, years_experience, health_testing)
          VALUES (${b.name}, ${b.location}, ${b.description}, ${b.breed_specialty}, ${b.verification_status}, ${b.membership_tier}, ${b.years_experience}, ${b.health_testing})
          RETURNING id
        `;
        if (breeder) {
          for (const l of b.litters) {
            await sql()`
              INSERT INTO litters (breeder_id, breed, birth_date, available_count, total_count, price_cents, health_tests, description)
              VALUES (${breeder.id}, ${l.breed}, ${l.birth_date}::date, ${l.available_count}, ${l.total_count}, ${l.price_cents}, ${l.health_tests}, ${l.description})
            `;
          }
        }
      }
    }

    const rows = await sql()`
      SELECT id, name, location, description, breed_specialty, verification_status, membership_tier, years_experience, health_testing, image_url
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

import { seoHead, SEO } from "../lib/seo";

export const Route = createFileRoute("/breed")({
  head: () => seoHead(SEO.breed),
  loader: () => getBreeders(),
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

function membershipBadge(tier: string) {
  if (tier === "premium") {
    return { label: "⭐ Premium", bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-300" };
  }
  if (tier === "plus") {
    return { label: " Plus", bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-300" };
  }
  return null;
}

function verificationBadge(status: string) {
  if (status === "verified") {
    return { label: " Verified", bg: "bg-green-100", text: "text-green-700" };
  }
  if (status === "featured") {
    return { label: " Featured", bg: "bg-purple-100", text: "text-purple-700" };
  }
  return { label: "⏳ Pending", bg: "bg-[var(--pawls-cream-100)]", text: "text-[var(--pawls-gold-500)]" };
}

// ── Component ──────────────────────────────────────────────────────────────

function BreedPage() {
  const { breeders, error } = Route.useLoaderData();
  const routerState = useRouterState();
  const isExactBreed = routerState.location.pathname === "/breed";

  // Extract unique breeds for filter pills
  const allBreeds = breeders
    ? [...new Set(breeders.map((b) => b.breed_specialty))].sort()
    : [];

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <AppHeader active="breed" />

      {isExactBreed ? (
        <>
          {/* Hero */}
          <section className="bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 pb-12 pt-8 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Find Ethical Breeders
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-base text-gray-600">
              Connect with vetted, health-tested breeders who put their dogs first. Every listed breeder meets our ethical standards.
            </p>
          </section>

          {/* Breed education tips */}
          <section className="bg-white px-6 pb-12">
            <div className="mx-auto max-w-6xl">
              <h2 className="mb-6 text-center text-2xl font-bold text-gray-900">
                 Breed Guide: Finding an Ethical Breeder
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-5">
                  <div className="mb-2 text-2xl"></div>
                  <h3 className="mb-1 font-semibold text-gray-900">Health Testing</h3>
                  <p className="text-sm leading-relaxed text-gray-600">
                    Ethical breeders screen for breed-specific conditions — hips, eyes, heart, and DNA. Always ask to see the certificates (OFA, PennHIP, CERF).
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-5">
                  <div className="mb-2 text-2xl"></div>
                  <h3 className="mb-1 font-semibold text-gray-900">Visit in Person</h3>
                  <p className="text-sm leading-relaxed text-gray-600">
                    A good breeder welcomes visits. You should see where the puppies are raised, meet the mother, and observe the environment.
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-5">
                  <div className="mb-2 text-2xl"></div>
                  <h3 className="mb-1 font-semibold text-gray-900">Ask for Pedigree</h3>
                  <p className="text-sm leading-relaxed text-gray-600">
                    Reputable breeders provide full pedigree documentation. They're proud of their lines and transparent about lineage and health history.
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-5">
                  <div className="mb-2 text-2xl"></div>
                  <h3 className="mb-1 font-semibold text-gray-900">Lifetime Support</h3>
                  <p className="text-sm leading-relaxed text-gray-600">
                    Ethical breeders offer a take-back guarantee and lifetime support. They care about every puppy they produce, forever.
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
                 Join as Breeder — Free
              </Link>
            </div>
          </section>

          {/* Breeder grid */}
          <section className="bg-white px-6 pb-20">
            <div className="mx-auto max-w-6xl">
              {error || !breeders || breeders.length === 0 ? (
                <EmptyState
                  title="No breeders available yet"
                  description="Check back soon for ethical, health-tested breeders near you."
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
                      const mb = membershipBadge(breeder.membership_tier);
                      const vb = verificationBadge(breeder.verification_status);
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
                            {breeder.years_experience} years experience
                          </p>

                          {/* Description excerpt */}
                          <p className="line-clamp-2 flex-1 text-sm leading-relaxed text-gray-600">
                            {breeder.description}
                          </p>

                          {/* View link */}
                          <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[var(--pawls-terracotta-500)] opacity-0 transition-opacity group-hover:opacity-100">
                            View breeder →
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
      <AppFooter />
    </div>
  );
}
