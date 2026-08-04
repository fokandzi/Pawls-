import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { sql } from "../db";
import { createBookingTables } from "../db/schema";

// ── Ensure email column exists ──────────────────────────────────────────────
const ensureProviderEmailColumn = createServerFn({ method: "POST" }).handler(async () => {
  await sql()`
    ALTER TABLE providers
    ADD COLUMN IF NOT EXISTS email TEXT
  `;
  await sql()`
    ALTER TABLE providers
    ADD COLUMN IF NOT EXISTS phone TEXT
  `;
  await sql()`
    ALTER TABLE providers
    ADD COLUMN IF NOT EXISTS website TEXT
  `;
  return { success: true };
});

// ── Server function: register provider ───────────────────────────────────────
type RegisterProviderInput = {
  name: string;
  email: string;
  category: string;
  location: string;
  description: string;
  phone: string;
  website: string;
  services: { name: string; price_cents: number; duration_minutes: number }[];
};

type RegisterProviderResult =
  | { success: true; providerId: number }
  | { success: false; error: string };

const registerProvider = createServerFn({ method: "POST" })
  .validator((data: unknown): RegisterProviderInput => {
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid registration data");
    }
    const d = data as Record<string, unknown>;

    const name = String(d.name ?? "").trim();
    const email = String(d.email ?? "").trim().toLowerCase();
    const category = String(d.category ?? "").trim();
    const location = String(d.location ?? "").trim();
    const description = String(d.description ?? "").trim();
    const phone = String(d.phone ?? "").trim();
    const website = String(d.website ?? "").trim();
    const services = Array.isArray(d.services) ? d.services as RegisterProviderInput["services"] : [];

    if (!name) throw new Error("Business name is required");
    if (!email) throw new Error("Email is required");
    if (!category) throw new Error("Service category is required");
    if (!location) throw new Error("Location is required");
    if (!description) throw new Error("Description is required");
    if (services.length === 0) throw new Error("At least one service is required");

    for (const s of services) {
      if (!s.name?.trim()) throw new Error("Each service must have a name");
      if (!s.price_cents || s.price_cents <= 0) throw new Error("Each service must have a valid price");
      if (!s.duration_minutes || s.duration_minutes <= 0) throw new Error("Each service must have a valid duration");
    }

    return { name, email, category, location, description, phone, website, services };
  })
  .handler(async ({ data }): Promise<RegisterProviderResult> => {
    try {
      await createBookingTables();
      await ensureProviderEmailColumn();

      // Check for duplicate email
      const [existing] = await sql()`
        SELECT id FROM providers WHERE email = ${data.email}
      `;
      if (existing) {
        return { success: false, error: "A provider with this email already exists." };
      }

      const [provider] = await sql()`
        INSERT INTO providers (name, email, category, description, location, phone, website)
        VALUES (${data.name}, ${data.email}, ${data.category}, ${data.description}, ${data.location}, ${data.phone}, ${data.website})
        RETURNING id
      `;

      const providerId = Number(provider.id);

      // Insert services
      for (const s of data.services) {
        await sql()`
          INSERT INTO services (provider_id, name, price_cents, duration_minutes)
          VALUES (${providerId}, ${s.name}, ${s.price_cents}, ${s.duration_minutes})
        `;
      }

      return { success: true, providerId };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Database error";
      return { success: false, error: message };
    }
  });

// ── Server function: get provider count for social proof ─────────────────────
const getProviderCount = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const [row] = await sql()`SELECT COUNT(*)::int AS count FROM providers`;
    return { count: Number(row.count) };
  } catch {
    return { count: 0 };
  }
});

// ── Category config ──────────────────────────────────────────────────────────
const categories = [
  { value: "walker", label: " Dog Walker", description: "Walking and exercise services" },
  { value: "groomer", label: " Groomer", description: "Grooming, washing, and styling" },
  { value: "sitter", label: "Sitter", description: "Daycare and overnight sitting" },
  { value: "trainer", label: " Trainer", description: "Training, classes, and behaviour" },
  { value: "vet", label: " Vet", description: "Veterinary care and check-ups" },
];

// ── Route definition ─────────────────────────────────────────────────────────
import { seoHead, SEO } from "../lib/seo";

export const Route = createFileRoute("/book/register")({
  head: () => seoHead(SEO["book/register"]),
  loader: () => getProviderCount(),
  component: ProviderRegisterPage,
});

// ── Form component ───────────────────────────────────────────────────────────
function ProviderRegisterPage() {
  const { count } = Route.useLoaderData();
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    email: localStorage.getItem("pawls_email") || "",
    category: "",
    location: "",
    description: "",
    phone: "",
    website: "",
  });

  const [services, setServices] = useState([{ name: "", price_cents: 0, duration_minutes: 30 }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ providerId: number } | null>(null);

  // Persist email to localStorage
  useEffect(() => {
    if (form.email) localStorage.setItem("pawls_email", form.email);
  }, [form.email]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleServiceChange = (index: number, field: string, value: string | number) => {
    setServices((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addService = () => {
    setServices((prev) => [...prev, { name: "", price_cents: 0, duration_minutes: 30 }]);
  };

  const removeService = (index: number) => {
    setServices((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await registerProvider({
        data: { ...form, services },
      });
      if (res.success) {
        setResult({ providerId: res.providerId });
      } else {
        setError(res.error);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success view ─────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader active="book" />

        <main className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white">
          <section className="mx-auto max-w-2xl px-6 py-16 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
              <span className="text-4xl"></span>
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900">You're live on Pawls!</h1>
            <p className="mt-3 text-lg text-gray-600">
              <strong>{form.name}</strong> is now listed. Dog owners can discover and book your services.
            </p>

            {/* Commission info */}
            <div className="mt-8 rounded-2xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)] p-6 text-left">
              <h2 className="text-lg font-bold text-gray-900"> How bookings work</h2>
              <ul className="mt-3 space-y-2 text-sm text-gray-600">
                <li>
                  <strong>12% commission</strong> — Pawls takes 12% on each completed booking. You keep 88%.
                </li>
                <li>
                  <strong>Instant booking</strong> — Owners can book your services directly through the app. No back-and-forth.
                </li>
                <li>
                  <strong>You set your schedule</strong> — Manage availability and services from your provider dashboard.
                </li>
                <li>
                  <strong>Automatic payouts</strong> — Payments are processed via Stripe and sent to your connected account.
                </li>
              </ul>
            </div>

            {/* What's next */}
            <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-6 text-left">
              <h2 className="text-lg font-bold text-gray-900"> What's next?</h2>
              <ol className="mt-3 list-inside list-decimal space-y-2 text-sm text-gray-600">
                <li>Your listing is live — owners can find you on the{" "}
                  <Link to="/book" className="font-medium text-[var(--pawls-terracotta-500)] hover:underline">services page</Link>
                </li>
                <li>Add more services from your provider profile</li>
                <li>Share your provider page link to get your first bookings</li>
                <li>Respond promptly to booking requests to build your reputation</li>
              </ol>
            </div>

            <div className="mt-10 space-y-3">
              <Link
                to="/book/$providerId"
                params={{ providerId: String(result.providerId) }}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[var(--pawls-terracotta-700)]"
              >
                View your listing →
              </Link>
              <br />
              <Link to="/book" className="text-sm font-medium text-gray-500 hover:text-[var(--pawls-terracotta-500)] transition-colors">
                ← Back to service directory
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
      <AppHeader active="book" />

      <main className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white">
        <section className="mx-auto max-w-2xl px-6 py-12">
          {/* Hero */}
          <div className="mb-10 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              List Your Dog Business
            </h1>
            <p className="mx-auto mt-3 max-w-md text-base text-gray-600">
              Get discovered by dog owners in Paris and across Île-de-France. List your services, take bookings, and grow your business — all with zero upfront cost.
            </p>
          </div>

          {/* Social proof */}
          {count > 0 && (
            <div className="mb-8 rounded-2xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/50 p-4 text-center">
              <p className="text-sm font-medium text-[var(--pawls-ink-700)]">
                 Join <strong>{count}</strong> provider{count !== 1 ? "s" : ""} already on Pawls
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

            {/* Business name */}
            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-gray-900">
                Business Name <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                value={form.name}
                onChange={handleChange}
                placeholder="e.g., Paws & Polish Grooming"
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

            {/* Category */}
            <div>
              <label htmlFor="category" className="block text-sm font-semibold text-gray-900">
                Service Category <span className="text-red-500">*</span>
              </label>
              <select
                id="category"
                name="category"
                required
                value={form.category}
                onChange={handleChange}
                className="mt-1.5 block w-full rounded-xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-4 py-3 text-sm text-gray-900 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/20"
              >
                <option value="">Select a category...</option>
                {categories.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label} — {cat.description}
                  </option>
                ))}
              </select>
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
                placeholder="e.g., Paris 11e, or Montreuil, Seine-Saint-Denis"
                className="mt-1.5 block w-full rounded-xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/20"
              />
              <p className="mt-1 text-xs text-gray-400">City and area — helps owners find services near them</p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-semibold text-gray-900">
                About Your Business <span className="text-red-500">*</span>
              </label>
              <textarea
                id="description"
                name="description"
                required
                rows={4}
                value={form.description}
                onChange={handleChange}
                placeholder="Tell owners about your experience, approach, and what makes your service special..."
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
                placeholder="https://your-business.com"
                className="mt-1.5 block w-full rounded-xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/20"
              />
            </div>

            {/* Services section */}
            <div className="rounded-xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/30 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">
                  Services You Offer <span className="text-red-500">*</span>
                </h3>
                <button
                  type="button"
                  onClick={addService}
                  className="rounded-full bg-[var(--pawls-terracotta-500)] px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-[var(--pawls-terracotta-700)]"
                >
                  + Add Service
                </button>
              </div>

              {services.map((service, index) => (
                <div
                  key={index}
                  className="mb-3 rounded-xl border border-[var(--pawls-cream-200)] bg-white p-4 last:mb-0"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-500">Service #{index + 1}</span>
                    {services.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeService(index)}
                        className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {/* Service name */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-600">
                        Service Name
                      </label>
                      <input
                        type="text"
                        required
                        value={service.name}
                        onChange={(e) => handleServiceChange(index, "name", e.target.value)}
                        placeholder="e.g., 60-minute Walk, Full Groom, Daycare"
                        className="mt-1 block w-full rounded-lg border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-1 focus:ring-[var(--pawls-terracotta-500)]/20"
                      />
                    </div>

                    {/* Price + Duration row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600">
                          Price (€)
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          step="0.01"
                          value={service.price_cents > 0 ? (service.price_cents / 100).toString() : ""}
                          onChange={(e) => {
                            const euros = parseFloat(e.target.value) || 0;
                            handleServiceChange(index, "price_cents", Math.round(euros * 100));
                          }}
                          placeholder="e.g., 25.00"
                          className="mt-1 block w-full rounded-lg border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-1 focus:ring-[var(--pawls-terracotta-500)]/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600">
                          Duration (min)
                        </label>
                        <input
                          type="number"
                          required
                          min="5"
                          step="5"
                          value={service.duration_minutes || ""}
                          onChange={(e) => handleServiceChange(index, "duration_minutes", parseInt(e.target.value) || 0)}
                          placeholder="e.g., 60"
                          className="mt-1 block w-full rounded-lg border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-1 focus:ring-[var(--pawls-terracotta-500)]/20"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3.5 text-sm font-semibold text-white shadow-md shadow-[var(--pawls-terracotta-500)]/20 transition-all hover:bg-[var(--pawls-terracotta-700)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating your listing..." : "List My Business — Free"}
            </button>

            <p className="text-center text-xs text-gray-400">
              By registering, you agree to Pawls' provider terms and 12% commission on bookings. No upfront costs — you only pay when you earn.
            </p>
          </form>

          {/* Value prop footer */}
          <div className="mt-10 text-center">
            <p className="text-sm text-gray-500">
              Already registered?{" "}
              <Link to="/book" className="font-medium text-[var(--pawls-terracotta-500)] hover:underline">
                Browse service providers →
              </Link>
            </p>
          </div>
        </section>
      </main>

      <AppFooter />
    </div>
  );
}
