import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { sql } from "../db";
import { createBreedTables } from "../db/schema";

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

type Litter = {
  id: number;
  breeder_id: number;
  breed: string;
  birth_date: string;
  available_count: number;
  total_count: number;
  price_cents: number;
  health_tests: string;
  description: string;
};

const getBreederDetail = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null || !("breederId" in data)) {
      throw new Error("breederId is required");
    }
    return { breederId: Number((data as { breederId: unknown }).breederId) };
  })
  .handler(async ({ data }) => {
    try {
      await createBreedTables();

      const [breeder] = await sql()`
        SELECT id, name, location, description, breed_specialty, verification_status, membership_tier, years_experience, health_testing, image_url
        FROM breeders
        WHERE id = ${data.breederId}
      ` as Breeder[];

      if (!breeder) {
        return { breeder: null, litters: [], error: "Breeder not found" };
      }

      const litters = await sql()`
        SELECT id, breeder_id, breed, birth_date, available_count, total_count, price_cents, health_tests, description
        FROM litters
        WHERE breeder_id = ${data.breederId}
        ORDER BY birth_date DESC
      ` as Litter[];

      return {
        breeder,
        litters: litters.map((l) => ({
          ...l,
          birth_date: String(l.birth_date),
        })),
        error: null,
      };
    } catch (err: any) {
      return { breeder: null, litters: [], error: err.message || "Database not connected" };
    }
  });

function membershipBadge(tier: string) {
  if (tier === "premium") return { label: "⭐ Premium Breeder", bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-300" };
  if (tier === "plus") return { label: " Plus Breeder", bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-300" };
  return null;
}

function verificationBadge(status: string) {
  if (status === "verified") return { label: " Verified", bg: "bg-green-100", text: "text-green-700" };
  if (status === "featured") return { label: " Featured", bg: "bg-purple-100", text: "text-purple-700" };
  return { label: "⏳ Pending Verification", bg: "bg-[var(--pawls-cream-100)]", text: "text-[var(--pawls-gold-500)]" };
}

function formatPrice(cents: number): string {
  return `€${(cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function ageInWeeks(dateStr: string): number {
  const birth = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24 * 7));
}

import { seoHead, seoBreeder } from "../lib/seo";

export const Route = createFileRoute("/breed/$breederId")({
  head: ({ loaderData }) => {
    const d = loaderData as { breeder: { name: string; breed_specialty: string } | null };
    if (d?.breeder) {
      return seoHead(seoBreeder(d.breeder.name, d.breeder.breed_specialty));
    }
    return seoHead({ title: "Breeder — Pawls", description: "View ethical breeder details on Pawls.", path: "/breed" });
  },
  loader: ({ params }) => getBreederDetail({ data: { breederId: Number(params.breederId) } }),
  component: BreederDetailPage,
});

function BreederDetailPage() {
  const { breeder, litters, error } = Route.useLoaderData();
  const router = useRouter();
  const searchParams = new URLSearchParams(router.state.location.search);
  const upgraded = searchParams.get("upgraded") === "true";


  if (error && !breeder) {
    return (
      <div className="flex min-h-dvh flex-col">
        <section className="flex flex-1 items-center justify-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-20">
          <div className="max-w-sm text-center">
            <span className="text-5xl"></span>
            <h2 className="mt-4 text-2xl font-bold text-gray-900">Coming soon</h2>
            <p className="mt-2 text-gray-600">{error}</p>
            <Link to="/breed" className="mt-6 inline-flex items-center gap-1 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--pawls-terracotta-500)]/20 transition-colors hover:bg-[var(--pawls-terracotta-700)]">
              ← Back to breeders
            </Link>
          </div>
        </section>
      </div>
    );
  }

  if (!breeder) {
    return (
      <div className="flex min-h-dvh flex-col">
        <section className="flex flex-1 items-center justify-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-20">
          <div className="max-w-sm text-center">
            <span className="text-5xl"></span>
            <h2 className="mt-4 text-2xl font-bold text-gray-900">Breeder not found</h2>
            <p className="mt-2 text-gray-600">This breeder may have been removed or the link is incorrect.</p>
            <Link to="/breed" className="mt-6 inline-flex items-center gap-1 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--pawls-terracotta-500)]/20 transition-colors hover:bg-[var(--pawls-terracotta-700)]">
              ← Back to breeders
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const vb = verificationBadge(breeder.verification_status);
  const mb = membershipBadge(breeder.membership_tier);
  const healthTests = breeder.health_testing ? breeder.health_testing.split(",").map((t: string) => t.trim()) : [];

  return (
    <div className="flex min-h-dvh flex-col">

      {/* Membership upgrade confirmation banner */}
      {upgraded && (
        <div className="border-b border-green-200 bg-green-50 px-6 py-4">
          <div className="mx-auto flex max-w-6xl items-center justify-center gap-2">
            <span className="text-lg"></span>
            <p className="text-sm font-semibold text-green-800">
              Membership upgraded successfully! Your new tier is now active.
            </p>
          </div>
        </div>
      )}

      <main className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-10">
        <div className="mx-auto max-w-3xl">
          <Link to="/breed" className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-[var(--pawls-terracotta-500)] transition-colors">
            ← Back to breeders
          </Link>

          <div className="mb-8 rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--pawls-cream-50)]">
                <span className="text-4xl"></span>
              </div>
              <div className="flex-1">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${vb.bg} ${vb.text}`}>
                    {vb.label}
                  </span>
                  {mb && (
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${mb.bg} ${mb.text} ${mb.border}`}>
                      {mb.label}
                    </span>
                  )}
                  <Link
                    to="/breed/membership"
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--pawls-terracotta-500)]/30 bg-[var(--pawls-terracotta-500)]/5 px-2.5 py-0.5 text-xs font-semibold text-[var(--pawls-terracotta-500)] transition-colors hover:bg-[var(--pawls-terracotta-500)]/10"
                  >
                     Upgrade
                  </Link>
                  <span className="inline-flex items-center rounded-full bg-[var(--pawls-cream-50)] px-2.5 py-0.5 text-xs font-medium text-[var(--pawls-gold-500)]">
                    {breeder.breed_specialty}
                  </span>
                </div>

                <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">{breeder.name}</h1>
                <p className="mt-1 text-sm text-gray-500"> {breeder.location}</p>
                <p className="mt-1 text-sm text-gray-400">{breeder.years_experience} years of breeding experience</p>
              </div>
            </div>

            <p className="mt-6 leading-relaxed text-gray-700">{breeder.description}</p>

            {healthTests.length > 0 && (
              <div className="mt-6 rounded-xl border border-green-200 bg-green-50/50 p-5">
                <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-green-800">
                  <span></span> Health Testing Protocol
                </h2>
                <div className="flex flex-wrap gap-2">
                  {healthTests.map((test: string) => (
                    <span key={test} className="inline-flex items-center rounded-full border border-green-200 bg-white px-3 py-1 text-xs font-medium text-green-700">
                       {test}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <h2 className="mb-4 text-xl font-bold text-gray-900">Current Litters</h2>

          {litters.length === 0 ? (
            <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-8 text-center">
              <span className="text-3xl"></span>
              <p className="mt-2 text-gray-600">No litters currently available. Check back soon or contact the breeder about upcoming litters.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {litters.map((litter: Litter) => {
                const weeks = ageInWeeks(litter.birth_date);
                const litterHealthTests = litter.health_tests ? litter.health_tests.split(",").map((t: string) => t.trim()) : [];

                return (
                  <div key={litter.id} className="flex flex-col rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-[var(--pawls-cream-50)] px-2.5 py-0.5 text-xs font-medium text-[var(--pawls-gold-500)]">
                        {litter.breed}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600">
                        {weeks} weeks old
                      </span>
                    </div>

                    <div className="mb-3 grid grid-cols-3 gap-3 rounded-xl bg-[var(--pawls-cream-50)]/50 p-3 text-center">
                      <div>
                        <div className="text-xs text-gray-500">Born</div>
                        <div className="text-sm font-semibold text-gray-900">{formatDate(litter.birth_date)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Available</div>
                        <div className="text-sm font-semibold text-gray-900">
                          {litter.available_count}/{litter.total_count}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Price</div>
                        <div className="text-sm font-semibold text-[var(--pawls-terracotta-500)]">{formatPrice(litter.price_cents)}</div>
                      </div>
                    </div>

                    {litter.description && (
                      <p className="mb-3 text-sm leading-relaxed text-gray-600">{litter.description}</p>
                    )}

                    {litterHealthTests.length > 0 && (
                      <div className="mb-3">
                        <p className="mb-1 text-xs font-semibold text-gray-500">Health Tests:</p>
                        <div className="flex flex-wrap gap-1">
                          {litterHealthTests.map((t: string) => (
                            <span key={t} className="inline-flex items-center rounded-full border border-green-100 bg-green-50 px-2 py-0.5 text-xs text-green-700">
                               {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-auto pt-3">
                      <a
                        href={`mailto:info@pawnder.app?subject=Inquiry about ${litter.breed} litter at ${breeder.name}&body=Hi ${breeder.name},%0D%0A%0D%0AI'm interested in your ${litter.breed} litter born ${formatDate(litter.birth_date)}.%0D%0A%0D%0A[Please introduce yourself and your experience with dogs]%0D%0A%0D%0AThank you!`}
                        className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-[var(--pawls-terracotta-500)] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--pawls-terracotta-500)]/20 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
                      >
                         Inquire About This Litter
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-10">
            <Link to="/breed" className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-[var(--pawls-terracotta-500)] transition-colors">
              ← Back to breeders
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
