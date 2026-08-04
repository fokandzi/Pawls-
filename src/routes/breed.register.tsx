import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { sql } from "../db";
import { createBreedTables } from "../db/schema";
import { createMembershipCheckout } from "../db/payments";

// ── Ensure email column exists ──────────────────────────────────────────────
const ensureBreederEmailColumn = createServerFn({ method: "POST" }).handler(async () => {
  await sql()`
    ALTER TABLE breeders
    ADD COLUMN IF NOT EXISTS email TEXT
  `;
  await sql()`
    ALTER TABLE breeders
    ADD COLUMN IF NOT EXISTS phone TEXT
  `;
  return { success: true };
});

// ── Server function: register breeder ────────────────────────────────────────
type RegisterBreederInput = {
  name: string;
  email: string;
  location: string;
  breed_specialty: string;
  years_experience: number;
  health_testing: string;
  description: string;
  phone: string;
  website: string;
};

type RegisterBreederResult =
  | { success: true; breederId: number }
  | { success: false; error: string };

const registerBreeder = createServerFn({ method: "POST" })
  .validator((data: unknown): RegisterBreederInput => {
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid registration data");
    }
    const d = data as Record<string, unknown>;

    const name = String(d.name ?? "").trim();
    const email = String(d.email ?? "").trim().toLowerCase();
    const location = String(d.location ?? "").trim();
    const breed_specialty = String(d.breed_specialty ?? "").trim();
    const years_experience = Number(d.years_experience ?? 0);
    const health_testing = String(d.health_testing ?? "").trim();
    const description = String(d.description ?? "").trim();
    const phone = String(d.phone ?? "").trim();
    const website = String(d.website ?? "").trim();

    if (!name) throw new Error("Kennel name is required");
    if (!email) throw new Error("Email is required");
    if (!location) throw new Error("Location is required");
    if (!breed_specialty) throw new Error("Breed specialty is required");
    if (!description) throw new Error("Description is required");

    return { name, email, location, breed_specialty, years_experience, health_testing, description, phone, website };
  })
  .handler(async ({ data }): Promise<RegisterBreederResult> => {
    try {
      await createBreedTables();
      await ensureBreederEmailColumn();

      // Check for duplicate email
      const [existing] = await sql()`
        SELECT id FROM breeders WHERE email = ${data.email}
      `;
      if (existing) {
        return { success: false, error: "A breeder with this email already exists." };
      }

      const [breeder] = await sql()`
        INSERT INTO breeders (name, email, location, description, breed_specialty, verification_status, membership_tier, years_experience, health_testing, phone)
        VALUES (${data.name}, ${data.email}, ${data.location}, ${data.description}, ${data.breed_specialty}, 'pending', 'free', ${data.years_experience}, ${data.health_testing}, ${data.phone})
        RETURNING id
      `;

      return { success: true, breederId: Number(breeder.id) };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Database error";
      return { success: false, error: message };
    }
  });

// ── Server function: get breeder count for social proof ──────────────────────
const getBreederCount = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const [row] = await sql()`SELECT COUNT(*)::int AS count FROM breeders`;
    return { count: Number(row.count) };
  } catch {
    return { count: 0 };
  }
});

// ── Route definition ─────────────────────────────────────────────────────────
import { seoHead, SEO } from "../lib/seo";

export const Route = createFileRoute("/breed/register")({
  head: () => seoHead(SEO["breed/register"]),
  loader: () => getBreederCount(),
  component: BreederRegisterPage,
});

// ── Form component ───────────────────────────────────────────────────────────
function BreederRegisterPage() {
  const { count } = Route.useLoaderData();
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    email: localStorage.getItem("pawls_email") || "",
    location: "",
    breed_specialty: "",
    years_experience: 0,
    health_testing: "",
    description: "",
    phone: "",
    website: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ breederId: number } | null>(null);

  // Persist email to localStorage
  useEffect(() => {
    if (form.email) localStorage.setItem("pawls_email", form.email);
  }, [form.email]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "years_experience" ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await registerBreeder({ data: form });
      if (res.success) {
        setResult({ breederId: res.breederId });
      } else {
        setError(res.error);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpgrade = async (tier: "plus" | "premium", priceCents: number) => {
    if (!result) return;
    try {
      const checkout = await createMembershipCheckout({
        data: { breederId: result.breederId, tier, priceCents },
      });
      if ("url" in checkout && checkout.url) {
        window.location.href = checkout.url;
      } else if ("error" in checkout) {
        alert(checkout.error || "Payment setup failed. You can upgrade later from your dashboard.");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Checkout failed. You can upgrade later.");
    }
  };

  // ── Success view ─────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader active="breed" />

        <main className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white">
          <section className="mx-auto max-w-2xl px-6 py-16 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
              <span className="text-4xl"></span>
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900">You're listed!</h1>
            <p className="mt-3 text-lg text-gray-600">
              <strong>{form.name}</strong> is now on Pawls. Dog owners in {form.location || "your area"} can discover your kennel.
            </p>

            {/* Free tier info */}
            <div className="mt-8 rounded-2xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)] p-6 text-left">
              <h2 className="text-lg font-bold text-gray-900"> You're on the Free plan</h2>
              <ul className="mt-3 space-y-2 text-sm text-gray-600">
                <li> Basic breeder listing</li>
                <li> 1 active litter</li>
                <li> Standard visibility in search</li>
              </ul>
            </div>

            {/* Upgrade prompt */}
            <div className="mt-8">
              <h2 className="text-xl font-bold text-gray-900"> Upgrade to get discovered faster</h2>
              <p className="mt-2 text-gray-600">
                Premium and Plus breeders get featured placement, more litters, and the verified badge.
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {/* Plus card */}
                <div className="rounded-2xl border-2 border-[var(--pawls-cream-200)] bg-white p-6 shadow-sm">
                  <div className="mb-2">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700"> Plus</span>
                  </div>
                  <div className="text-3xl font-extrabold text-gray-900">€25<span className="text-sm font-normal text-gray-500">/mo</span></div>
                  <ul className="mt-4 space-y-2 text-left text-sm text-gray-600">
                    <li> Highlighted in search</li>
                    <li> Up to 3 active litters</li>
                    <li> Health test badges</li>
                    <li> Priority support</li>
                  </ul>
                  <button
                    onClick={() => handleUpgrade("plus", 2500)}
                    className="mt-5 w-full rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[var(--pawls-terracotta-700)]"
                  >
                    Upgrade to Plus — €25/mo
                  </button>
                </div>

                {/* Premium card */}
                <div className="rounded-2xl border-2 border-yellow-400 bg-white p-6 shadow-sm ring-2 ring-yellow-200">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-700">⭐ Premium</span>
                    <span className="rounded-full bg-gradient-to-r from-[var(--pawls-cream-50)]0 to-[var(--pawls-terracotta-500)] px-2 py-0.5 text-[10px] font-bold text-white">BEST VALUE</span>
                  </div>
                  <div className="text-3xl font-extrabold text-gray-900">€40<span className="text-sm font-normal text-gray-500">/mo</span></div>
                  <ul className="mt-4 space-y-2 text-left text-sm text-gray-600">
                    <li> Everything in Plus</li>
                    <li> Featured on /breed page</li>
                    <li> Unlimited litters</li>
                    <li> ⭐ Verified badge</li>
                    <li> Homepage features</li>
                  </ul>
                  <button
                    onClick={() => handleUpgrade("premium", 4000)}
                    className="mt-5 w-full rounded-full bg-gradient-to-r from-yellow-500 to-[var(--pawls-gold-500)] px-6 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:from-yellow-600 hover:to-[var(--pawls-gold-500)]"
                  >
                    Upgrade to Premium — €40/mo
                  </button>
                </div>
              </div>

              <p className="mt-4 text-sm text-gray-400">
                You can also upgrade later from your breeder profile page.
              </p>
            </div>

            <div className="mt-10 space-y-3">
              <Link
                to="/breed/$breederId"
                params={{ breederId: String(result.breederId) }}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[var(--pawls-terracotta-700)]"
              >
                View your listing →
              </Link>
              <br />
              <Link to="/breed" className="text-sm font-medium text-gray-500 hover:text-[var(--pawls-terracotta-500)] transition-colors">
                ← Back to breeder directory
              </Link>
            </div>
          </section>
        </main>

        <AppFooter />
      </div>
    );
  }

  // ── Registration form view ───────────────────────────────────────────
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader active="breed" />

      <main className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white">
        <section className="mx-auto max-w-2xl px-6 py-12">
          {/* Hero */}
          <div className="mb-10 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Join as a Breeder
            </h1>
            <p className="mx-auto mt-3 max-w-md text-base text-gray-600">
              Get discovered by dog owners in Paris and across Île-de-France. List your kennel, showcase your litters, and connect with families looking for healthy, ethically-bred puppies.
            </p>
          </div>

          {/* Social proof */}
          {count > 0 && (
            <div className="mb-8 rounded-2xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/50 p-4 text-center">
              <p className="text-sm font-medium text-[var(--pawls-ink-700)]">
                 Join <strong>{count}</strong> breeder{count !== 1 ? "s" : ""} already on Pawls
              </p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-8 shadow-sm">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            {/* Kennel name */}
            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-gray-900">
                Kennel Name <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                value={form.name}
                onChange={handleChange}
                placeholder="e.g., Labradors d'Île-de-France"
                className="mt-1.5 block w-full rounded-xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/20"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-900">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className="mt-1.5 block w-full rounded-xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/20"
              />
            </div>

            {/* Location */}
            <div>
              <label htmlFor="location" className="block text-sm font-semibold text-gray-900">
                Location <span className="text-red-500">*</span>
              </label>
              <input
                id="location"
                name="location"
                type="text"
                required
                value={form.location}
                onChange={handleChange}
                placeholder="e.g., Rambouillet, Yvelines"
                className="mt-1.5 block w-full rounded-xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/20"
              />
              <p className="mt-1 text-xs text-gray-400">City and department — helps owners find breeders near them</p>
            </div>

            {/* Breed specialty */}
            <div>
              <label htmlFor="breed_specialty" className="block text-sm font-semibold text-gray-900">
                Breed Specialty <span className="text-red-500">*</span>
              </label>
              <input
                id="breed_specialty"
                name="breed_specialty"
                type="text"
                required
                value={form.breed_specialty}
                onChange={handleChange}
                placeholder="e.g., Labrador Retriever, French Bulldog"
                className="mt-1.5 block w-full rounded-xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/20"
              />
            </div>

            {/* Years experience */}
            <div>
              <label htmlFor="years_experience" className="block text-sm font-semibold text-gray-900">
                Years of Experience
              </label>
              <input
                id="years_experience"
                name="years_experience"
                type="number"
                min="0"
                max="100"
                value={form.years_experience}
                onChange={handleChange}
                className="mt-1.5 block w-full rounded-xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/20"
              />
            </div>

            {/* Health testing */}
            <div>
              <label htmlFor="health_testing" className="block text-sm font-semibold text-gray-900">
                Health Testing Certifications
              </label>
              <input
                id="health_testing"
                name="health_testing"
                type="text"
                value={form.health_testing}
                onChange={handleChange}
                placeholder="e.g., OFA Hip, Elbow, CERF Eye Exam, DNA Panel"
                className="mt-1.5 block w-full rounded-xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/20"
              />
              <p className="mt-1 text-xs text-gray-400">List the health tests you perform on your breeding dogs</p>
            </div>

            {/* Description / Bio */}
            <div>
              <label htmlFor="description" className="block text-sm font-semibold text-gray-900">
                About Your Kennel <span className="text-red-500">*</span>
              </label>
              <textarea
                id="description"
                name="description"
                required
                rows={4}
                value={form.description}
                onChange={handleChange}
                placeholder="Tell owners about your breeding philosophy, experience, and what makes your kennel special..."
                className="mt-1.5 block w-full rounded-xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/20 resize-y"
              />
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="phone" className="block text-sm font-semibold text-gray-900">
                Phone Number
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                placeholder="+33 6 12 34 56 78"
                className="mt-1.5 block w-full rounded-xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/20"
              />
            </div>

            {/* Website */}
            <div>
              <label htmlFor="website" className="block text-sm font-semibold text-gray-900">
                Website (optional)
              </label>
              <input
                id="website"
                name="website"
                type="url"
                value={form.website}
                onChange={handleChange}
                placeholder="https://your-kennel.com"
                className="mt-1.5 block w-full rounded-xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/20"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3.5 text-sm font-semibold text-white shadow-md shadow-[var(--pawls-terracotta-500)]/20 transition-all hover:bg-[var(--pawls-terracotta-700)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating your listing..." : "Create My Breeder Listing — Free"}
            </button>

            <p className="text-center text-xs text-gray-400">
              By registering, you agree to Pawls' breeder standards. Your listing goes live immediately.
            </p>
          </form>

          {/* Value prop footer */}
          <div className="mt-10 text-center">
            <p className="text-sm text-gray-500">
              Already registered?{" "}
              <Link to="/breed" className="font-medium text-[var(--pawls-terracotta-500)] hover:underline">
                Browse the breeder directory →
              </Link>
            </p>
          </div>
        </section>
      </main>

      <AppFooter />
    </div>
  );
}
