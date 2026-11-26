import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { sql } from "../db";
import { t, DEFAULT_LANG, type Lang } from "../lib/i18n";
import { resolveRouteLang } from "../lib/i18n/route-lang";

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
  .handler(async ({ data, request }): Promise<RegisterBreederResult> => {
    // F3 (finding S1): a public INSERT is not an endpoint anyone may call. The
    // session decides who the breeder row belongs to; the client's own email is
    // only accepted when it IS the account email, so no one can register a
    // kennel in someone else's name. CSRF middleware is not authentication.
    const { requireUser } = await import("../lib/auth/authz");
    const auth = await requireUser(request);
    if (!auth.ok) return { success: false, error: "Please log in to register a kennel." };
    if (auth.user.role !== "admin" && data.email !== auth.user.email.trim().toLowerCase()) {
      return { success: false, error: "You can only register a kennel for your own account." };
    }
    try {
      // Check for duplicate email
      const [existing] = await sql()`
        SELECT id FROM breeders WHERE email = ${data.email}
      `;
      if (existing) {
        return { success: false, error: "A breeder with this email already exists." };
      }

      // The row is inserted PENDING: it is not discoverable until Pawls reviews
      // it. The success screen below says exactly that — it never claims the
      // kennel is listed.
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

// ── Route definition ─────────────────────────────────────────────────────────
import { seoHead } from "../lib/seo";

/** FR-first server messages: the four known outcomes are translated, anything
 * else is shown verbatim rather than invented. */
function localizeError(message: string, L: Lang): string {
  if (message === "Please log in to register a kennel.") return t("breedReg.errLogin", L);
  if (message === "You can only register a kennel for your own account.") return t("breedReg.errOwnAccount", L);
  if (message === "A breeder with this email already exists.") return t("breedReg.errDuplicate", L);
  return message;
}

export const Route = createFileRoute("/breed/register")({
  loader: async (): Promise<{ lang: Lang }> => {
    try {
      return { lang: await resolveRouteLang() };
    } catch {
      return { lang: DEFAULT_LANG };
    }
  },
  head: ({ loaderData }) => {
    const L: Lang = (loaderData as { lang?: Lang } | undefined)?.lang ?? DEFAULT_LANG;
    return seoHead({
      title: t("breedReg.title", L),
      description: t("breedReg.intro", L),
      path: "/breed/register",
    });
  },
  component: BreederRegisterPage,
});

const fieldClass =
  "mt-1.5 block w-full rounded-xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/20";

// ── Form component ───────────────────────────────────────────────────────────
function BreederRegisterPage() {
  const { lang: serverLang } = Route.useLoaderData() as { lang?: Lang };
  const L: Lang = serverLang ?? DEFAULT_LANG;

  const [form, setForm] = useState({
    name: "",
    email: "",
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

  // Restore the email the visitor used on the site, client-side only (never on
  // the server, where localStorage does not exist).
  useEffect(() => {
    const saved = localStorage.getItem("pawls_email");
    if (saved) setForm((prev) => (prev.email ? prev : { ...prev, email: saved }));
  }, []);

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
        setError(localizeError(res.error, L));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? localizeError(err.message, L) : t("breedReg.errGeneric", L));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success view ─────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="flex min-h-dvh flex-col">
        <main className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white">
          <section className="mx-auto max-w-2xl px-6 py-16 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--pawls-cream-100)]">
              <span className="text-4xl">📝</span>
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900">{t("breedReg.successTitle", L)}</h1>
            <p className="mt-3 text-lg text-gray-600">
              <strong>{form.name}</strong> {t("breedReg.successBody1", L)}
            </p>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-gray-500">
              {t("breedReg.successBody2", L)}
            </p>

            <div className="mt-10 space-y-3">
              <Link
                to="/breed/$breederId"
                params={{ breederId: String(result.breederId) }}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[var(--pawls-terracotta-700)]"
              >
                {t("breedReg.viewListing", L)}
              </Link>
              <br />
              <Link to="/breed" className="text-sm font-medium text-gray-500 hover:text-[var(--pawls-terracotta-500)] transition-colors">
                {t("breedReg.backDirectory", L)}
              </Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  // ── Registration form view ───────────────────────────────────────────
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white">
        <section className="mx-auto max-w-2xl px-6 py-12">
          {/* Hero */}
          <div className="mb-10 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              {t("breedReg.title", L)}
            </h1>
            <p className="mx-auto mt-3 max-w-md text-base text-gray-600">{t("breedReg.intro", L)}</p>
          </div>

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
                {t("breedReg.kennelName", L)} <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                value={form.name}
                onChange={handleChange}
                placeholder={t("breedReg.kennelPlaceholder", L)}
                className={fieldClass}
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-900">
                {t("breedReg.email", L)} <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={form.email}
                onChange={handleChange}
                placeholder="vous@exemple.fr"
                className={fieldClass}
              />
            </div>

            {/* Location */}
            <div>
              <label htmlFor="location" className="block text-sm font-semibold text-gray-900">
                {t("breedReg.location", L)} <span className="text-red-500">*</span>
              </label>
              <input
                id="location"
                name="location"
                type="text"
                required
                value={form.location}
                onChange={handleChange}
                placeholder={t("breedReg.locationPlaceholder", L)}
                className={fieldClass}
              />
              <p className="mt-1 text-xs text-gray-400">{t("breedReg.locationHint", L)}</p>
            </div>

            {/* Breed specialty */}
            <div>
              <label htmlFor="breed_specialty" className="block text-sm font-semibold text-gray-900">
                {t("breedReg.breedSpecialty", L)} <span className="text-red-500">*</span>
              </label>
              <input
                id="breed_specialty"
                name="breed_specialty"
                type="text"
                required
                value={form.breed_specialty}
                onChange={handleChange}
                placeholder={t("breedReg.breedPlaceholder", L)}
                className={fieldClass}
              />
            </div>

            {/* Years experience */}
            <div>
              <label htmlFor="years_experience" className="block text-sm font-semibold text-gray-900">
                {t("breedReg.years", L)}
              </label>
              <input
                id="years_experience"
                name="years_experience"
                type="number"
                min="0"
                max="100"
                value={form.years_experience}
                onChange={handleChange}
                className={fieldClass}
              />
            </div>

            {/* Health testing */}
            <div>
              <label htmlFor="health_testing" className="block text-sm font-semibold text-gray-900">
                {t("breedReg.health", L)}
              </label>
              <input
                id="health_testing"
                name="health_testing"
                type="text"
                value={form.health_testing}
                onChange={handleChange}
                placeholder={t("breedReg.healthPlaceholder", L)}
                className={fieldClass}
              />
              <p className="mt-1 text-xs text-gray-400">{t("breedReg.healthHint", L)}</p>
            </div>

            {/* Description / Bio */}
            <div>
              <label htmlFor="description" className="block text-sm font-semibold text-gray-900">
                {t("breedReg.about", L)} <span className="text-red-500">*</span>
              </label>
              <textarea
                id="description"
                name="description"
                required
                rows={4}
                value={form.description}
                onChange={handleChange}
                placeholder={t("breedReg.aboutPlaceholder", L)}
                className={`${fieldClass} resize-y`}
              />
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="phone" className="block text-sm font-semibold text-gray-900">
                {t("breedReg.phone", L)}
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                placeholder="+33 6 12 34 56 78"
                className={fieldClass}
              />
            </div>

            {/* Website */}
            <div>
              <label htmlFor="website" className="block text-sm font-semibold text-gray-900">
                {t("breedReg.website", L)}
              </label>
              <input
                id="website"
                name="website"
                type="url"
                value={form.website}
                onChange={handleChange}
                placeholder="https://votre-elevage.fr"
                className={fieldClass}
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3.5 text-sm font-semibold text-white shadow-md shadow-[var(--pawls-terracotta-500)]/20 transition-all hover:bg-[var(--pawls-terracotta-700)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? t("breedReg.submitting", L) : t("breedReg.submit", L)}
            </button>

            <p className="text-center text-xs text-gray-400">{t("breedReg.terms", L)}</p>
          </form>

          {/* Value prop footer */}
          <div className="mt-10 text-center">
            <p className="text-sm text-gray-500">
              {t("breedReg.already", L)}{" "}
              <Link to="/breed" className="font-medium text-[var(--pawls-terracotta-500)] hover:underline">
                {t("breedReg.browse", L)}
              </Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
