/**
 * /book/register — provider application (P1 batch C: honest + authenticated).
 *
 * What changed in batch C (launch audit 2026-09-28, finding #7):
 *   - No manufactured social proof: the provider counter counts REAL providers
 *     only (approved, non-demo, owner-bound, owned by a non-test user) via
 *     GET /api/providers/count. When that is 0 the page says so honestly.
 *   - No false claims on submit: the previous success screen told providers they
 *     were "live on Pawls", promised a 12% commission, a provider dashboard,
 *     automatic payouts and that "owners can find you" — none of which exists.
 *     The new state says the application is submitted and UNDER REVIEW.
 *   - Login required: the application is POSTed to /api/providers/register with
 *     the session cookie; owner_user_id is derived server-side (401 when logged
 *     out), the POST is CSRF-checked and rate limited (5/hour per IP), and the
 *     row is created as approval_status = 'pending'. Failures are reported
 *     honestly — never a fabricated success.
 *   - providers.email/phone/website are formal schema (migration 008) instead of
 *     per-request runtime DDL.
 *
 * FR-first (batch D2): the language is resolved SERVER-SIDE from the session's
 * `users.preferred_language` (FR default, see ../lib/i18n/route-lang) so the
 * served HTML is already in the visitor's language, and EVERY user-facing string
 * — labels, placeholders, hero, categories — comes from the i18n dictionary.
 * Truthfulness: no "vérifié"/verified claim anywhere; an application is reviewed
 * and approved by Pawls before a listing is published.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { countRealProviders } from "../lib/provider-core";
import { t, DEFAULT_LANG, normalizeLang, type Lang } from "../lib/i18n";
import { LangToggle } from "../lib/lang-toggle";

// ── Server function: REAL provider count (never a raw COUNT(*)) + FR-first lang ─
const getRealProviderCount = createServerFn({ method: "GET" }).handler(async ({ request }) => {
  const { resolveRequestLang } = await import("../lib/i18n/route-lang");
  const lang = await resolveRequestLang(request);
  try {
    return { count: await countRealProviders(), lang };
  } catch {
    // Unknown is not zero: the page then shows no number at all.
    return { count: null as number | null, lang };
  }
});

type RegisterResponse = {
  ok?: boolean;
  providerId?: number;
  error?: string;
  message?: string;
  messageFr?: string;
};

// ── Category config (values must match PROVIDER_CATEGORIES server-side) ──────
const categories = [
  { value: "walker", labelKey: "provider.cat.walker", descKey: "provider.cat.walkerDesc" },
  { value: "groomer", labelKey: "provider.cat.groomer", descKey: "provider.cat.groomerDesc" },
  { value: "sitter", labelKey: "provider.cat.sitter", descKey: "provider.cat.sitterDesc" },
  { value: "trainer", labelKey: "provider.cat.trainer", descKey: "provider.cat.trainerDesc" },
  { value: "vet", labelKey: "provider.cat.vet", descKey: "provider.cat.vetDesc" },
];

import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/book/register")({
  head: ({ loaderData }) => {
    const L: Lang = (loaderData as { lang?: Lang } | undefined)?.lang ?? DEFAULT_LANG;
    return seoHead({
      title: t("register.seoTitle", L),
      description: t("register.seoDesc", L),
      path: "/book/register",
    });
  },
  loader: () => getRealProviderCount(),
  component: ProviderRegisterPage,
});

function ProviderRegisterPage() {
  const { count, lang: serverLang } = Route.useLoaderData();

  const [lang, setLang] = useState<Lang>(serverLang ?? DEFAULT_LANG);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
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

  // Session truth comes from the server (cookie -> DB), never from localStorage.
  // The persisted language is re-read here so a language switch is reflected
  // without a full page load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/auth/me", { headers: { accept: "application/json" } });
        const me = await res.json();
        if (cancelled) return;
        if (me?.user) {
          setLoggedIn(true);
          setLang(normalizeLang(me.user.preferred_language, serverLang ?? DEFAULT_LANG));
          if (typeof me.user.email === "string") {
            setForm((prev) => (prev.email ? prev : { ...prev, email: String(me.user.email) }));
          }
        } else {
          setLoggedIn(false);
        }
      } catch {
        if (!cancelled) setLoggedIn(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serverLang]);

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
      const res = await fetch("/api/providers/register", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...form, services }),
      });
      const data = (await res.json().catch(() => ({}))) as RegisterResponse;
      if (res.ok && data.ok && typeof data.providerId === "number") {
        setResult({ providerId: data.providerId });
        return;
      }
      // Honest failure: the server's own message, in the visitor's language.
      const message = lang === "fr" ? data.messageFr ?? data.message : data.message ?? data.messageFr;
      if (res.status === 401) {
        setLoggedIn(false);
        setError(message ?? t("provider.loginRequired", lang));
      } else if (res.status === 429) {
        setError(message ?? t("provider.rateLimited", lang));
      } else {
        setError(message ?? t("provider.errorGeneric", lang));
      }
    } catch {
      setError(t("provider.errorGeneric", lang));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Submitted / under-review view (honest — nothing is live yet) ─────────
  if (result) {
    return (
      <div className="flex min-h-dvh flex-col">
        <main className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white">
          <section className="mx-auto max-w-2xl px-6 py-16 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--pawls-cream-100)]">
              <span className="text-4xl">📝</span>
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900">{t("provider.pendingTitle", lang)}</h1>
            <p className="mt-3 text-lg text-gray-600">{t("provider.pendingBody", lang)}</p>

            <div className="mt-8 rounded-2xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)] p-6 text-left">
              <h2 className="text-lg font-bold text-gray-900">{t("provider.pendingStatusTitle", lang)}</h2>
              <ul className="mt-3 space-y-2 text-sm text-gray-600">
                <li>{t("provider.pendingStatusLine1", lang)}</li>
                <li>{t("provider.pendingStatusLine2", lang)}</li>
                <li>{t("provider.pendingStatusLine3", lang)}</li>
              </ul>
              <p className="mt-3 text-xs text-gray-500">
                {t("provider.applicationRef", lang)} #{result.providerId}
              </p>
            </div>

            <div className="mt-10 space-y-3">
              <Link
                to="/book"
                className="inline-flex items-center gap-1 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[var(--pawls-terracotta-700)]"
              >
                {t("provider.backToBook", lang)}
              </Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  // ── Application form ─────────────────────────────────────────────────────
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white">
        <section className="mx-auto max-w-2xl px-6 py-12">
          {/* Hero */}
          <div className="mb-10 text-center">
            <div className="mb-4 flex justify-end">
              <LangToggle lang={lang} next="/book/register" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              {t("provider.form.heading", lang)}
            </h1>
            <p className="mx-auto mt-3 max-w-md text-base text-gray-600">
              {t("provider.form.sub", lang)}
            </p>
          </div>

          {/* Real supply counter — real provider rows only, honest when zero */}
          {typeof count === "number" &&
            (count > 0 ? (
              <div className="mb-8 rounded-2xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/50 p-4 text-center">
                <p className="text-sm font-medium text-[var(--pawls-ink-700)]">
                  {count === 1
                    ? t("provider.form.counterOne", lang)
                    : t("provider.form.counterMany", lang).split("{count}").join(String(count))}
                </p>
              </div>
            ) : (
              <div className="mb-8 rounded-2xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/50 p-4 text-center">
                <p className="text-sm font-medium text-[var(--pawls-ink-700)]">{t("provider.counterNone", lang)}</p>
              </div>
            ))}

          {/* Login required — applications are bound to a real account */}
          {loggedIn === false && (
            <div className="mb-6 rounded-2xl border border-[var(--pawls-terracotta-500)]/30 bg-[var(--pawls-cream-50)] p-5 text-left">
              <h2 className="text-base font-bold text-gray-900">{t("provider.loginRequiredTitle", lang)}</h2>
              <p className="mt-1 text-sm text-gray-600">{t("provider.loginRequired", lang)}</p>
              <Link
                to="/login"
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-5 py-2 text-sm font-semibold text-white"
              >
                {t("match.logIn", lang)}
              </Link>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-8 shadow-sm">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>
            )}

            {/* Business name */}
            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-gray-900">
                {t("provider.form.businessName", lang)} <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                value={form.name}
                onChange={handleChange}
                placeholder={t("provider.form.businessNamePlaceholder", lang)}
                className="mt-1.5 block w-full rounded-xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/20"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-900">
                {t("provider.form.email", lang)} <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={form.email}
                onChange={handleChange}
                placeholder={t("provider.form.emailPlaceholder", lang)}
                className="mt-1.5 block w-full rounded-xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/20"
              />
            </div>

            {/* Category */}
            <div>
              <label htmlFor="category" className="block text-sm font-semibold text-gray-900">
                {t("provider.form.category", lang)} <span className="text-red-500">*</span>
              </label>
              <select
                id="category"
                name="category"
                required
                value={form.category}
                onChange={handleChange}
                className="mt-1.5 block w-full rounded-xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-4 py-3 text-sm text-gray-900 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/20"
              >
                <option value="">{t("provider.form.categoryPlaceholder", lang)}</option>
                {categories.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {t(cat.labelKey, lang)} — {t(cat.descKey, lang)}
                  </option>
                ))}
              </select>
            </div>

            {/* Location */}
            <div>
              <label htmlFor="location" className="block text-sm font-semibold text-gray-900">
                {t("provider.form.location", lang)} <span className="text-red-500">*</span>
              </label>
              <input
                id="location"
                name="location"
                type="text"
                required
                value={form.location}
                onChange={handleChange}
                placeholder={t("provider.form.locationPlaceholder", lang)}
                className="mt-1.5 block w-full rounded-xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/20"
              />
              <p className="mt-1 text-xs text-gray-400">{t("provider.form.locationHint", lang)}</p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-semibold text-gray-900">
                {t("provider.form.description", lang)} <span className="text-red-500">*</span>
              </label>
              <textarea
                id="description"
                name="description"
                required
                rows={4}
                value={form.description}
                onChange={handleChange}
                placeholder={t("provider.form.descriptionPlaceholder", lang)}
                className="mt-1.5 block w-full rounded-xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/20 resize-y"
              />
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="phone" className="block text-sm font-semibold text-gray-900">
                {t("provider.form.phone", lang)}
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
                {t("provider.form.website", lang)}
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
                  {t("provider.form.servicesHeading", lang)} <span className="text-red-500">*</span>
                </h3>
                <button
                  type="button"
                  onClick={addService}
                  className="rounded-full bg-[var(--pawls-terracotta-500)] px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-[var(--pawls-terracotta-700)]"
                >
                  {t("provider.form.addService", lang)}
                </button>
              </div>

              {services.map((service, index) => (
                <div key={index} className="mb-3 rounded-xl border border-[var(--pawls-cream-200)] bg-white p-4 last:mb-0">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-500">{t("provider.form.serviceN", lang).split("{n}").join(String(index + 1))}</span>
                    {services.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeService(index)}
                        className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
                      >
                        {t("provider.form.remove", lang)}
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {/* Service name */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-600">{t("provider.form.serviceName", lang)}</label>
                      <input
                        type="text"
                        required
                        value={service.name}
                        onChange={(e) => handleServiceChange(index, "name", e.target.value)}
                        placeholder={t("provider.form.serviceNamePlaceholder", lang)}
                        className="mt-1 block w-full rounded-lg border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-1 focus:ring-[var(--pawls-terracotta-500)]/20"
                      />
                    </div>

                    {/* Price + Duration row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600">{t("provider.form.priceEuro", lang)}</label>
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
                          placeholder={t("provider.form.pricePlaceholder", lang)}
                          className="mt-1 block w-full rounded-lg border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/30 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-1 focus:ring-[var(--pawls-terracotta-500)]/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600">{t("provider.form.durationMin", lang)}</label>
                        <input
                          type="number"
                          required
                          min="5"
                          step="5"
                          value={service.duration_minutes || ""}
                          onChange={(e) => handleServiceChange(index, "duration_minutes", parseInt(e.target.value) || 0)}
                          placeholder={t("provider.form.durationPlaceholder", lang)}
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
              {submitting ? t("provider.submitting", lang) : t("provider.submit", lang)}
            </button>

            <p className="text-center text-xs text-gray-400">{t("provider.termsNote", lang)}</p>
          </form>

          {/* Footer */}
          <div className="mt-10 text-center">
            <p className="text-sm text-gray-500">
              <Link to="/book" className="font-medium text-[var(--pawls-terracotta-500)] hover:underline">
                {t("provider.browseProviders", lang)}
              </Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
