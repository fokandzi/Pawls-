import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { AppHeader, AppFooter } from "../lib/app-header";
import { seoHead } from "../lib/seo";
import { t, DEFAULT_LANG, normalizeLang, type Lang } from "../lib/i18n";
import { LangToggle } from "../lib/lang-toggle";
import { useEffect, useState } from "react";

/**
 * /match/create — dog profile creation.
 *
 * FR-first (batch D2): the launch audit flagged this route as 100% English for
 * FR users while the FR dictionary keys already existed. The language is
 * resolved SERVER-SIDE from the session (users.preferred_language, FR default)
 * and every visible string now comes from the i18n dictionary.
 */

const resolveMatchCreateLang = createServerFn({ method: "GET" }).handler(async ({ request }) => {
  const { resolveRequestLang } = await import("../lib/i18n/route-lang");
  return resolveRequestLang(request);
});

export const Route = createFileRoute("/match/create")({
  head: () =>
    seoHead({
      title: t("create.title", DEFAULT_LANG),
      description: t("create.subtitle", DEFAULT_LANG),
      path: "/match/create",
    }),
  loader: () => resolveMatchCreateLang(),
  component: CreateProfilePage,
});

const inputClass =
  "w-full rounded-lg border border-[var(--pawls-cream-200)] bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30";
const labelClass = "mb-1 block text-sm font-semibold text-gray-700";
const hintClass = "text-xs font-normal text-gray-400";

function CreateProfilePage() {
  const loaderLang = Route.useLoaderData() as Lang;
  const search = (Route.useSearch() as any) ?? {};
  const verified = String(search?.verified ?? "") === "1";
  const [lang, setLang] = useState<Lang>(loaderLang);

  // Follow a persisted language change (the toggle posts /api/match/lang).
  useEffect(() => {
    let cancelled = false;
    fetch("/auth/me", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then((r) => r.json())
      .then((me) => {
        if (cancelled || !me?.user) return;
        const next = normalizeLang(me.user.preferred_language);
        if (next !== lang) setLang(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader active="match" lang={lang} />
      {verified && (
        <div className="bg-green-50 px-6 py-3 text-center text-sm font-medium text-green-700">
          {t("create.verifiedBanner", lang)}
        </div>
      )}

      {/* Form */}
      <section className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-12">
        <div className="mx-auto max-w-lg">
          <div className="mb-8 text-center">
            <span className="text-5xl">🐶</span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900">{t("create.heading", lang)}</h1>
            <p className="mt-2 text-gray-600">{t("create.subtitle", lang)}</p>
            <div className="mt-3 flex justify-center">
              <LangToggle lang={lang} next="/match/create" />
            </div>
          </div>

          <form
            action="/match/create"
            method="POST"
            encType="multipart/form-data"
            className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-6 shadow-sm"
          >
            <div className="space-y-4">
              {/* Owner Name */}
              <div>
                <label className={labelClass}>{t("create.ownerName", lang)}</label>
                <input
                  type="text"
                  name="ownerName"
                  required
                  placeholder={t("create.ownerPlaceholder", lang)}
                  className={inputClass}
                />
              </div>

              {/* Dog Name */}
              <div>
                <label className={labelClass}>{t("create.dogName", lang)}</label>
                <input
                  type="text"
                  name="dogName"
                  required
                  placeholder={t("create.dogPlaceholder", lang)}
                  className={inputClass}
                />
              </div>

              {/* Breed */}
              <div>
                <label className={labelClass}>{t("create.breed", lang)}</label>
                <input
                  type="text"
                  name="breed"
                  required
                  placeholder={t("create.breedPlaceholder", lang)}
                  className={inputClass}
                />
              </div>

              {/* Age */}
              <div>
                <label className={labelClass}>{t("create.age", lang)}</label>
                <input
                  type="number"
                  name="age"
                  required
                  min={0}
                  max={30}
                  placeholder={t("create.agePlaceholder", lang)}
                  className={inputClass}
                />
              </div>

              {/* Size */}
              <div>
                <label className={labelClass}>{t("create.size", lang)}</label>
                <select name="size" required className={inputClass} defaultValue="medium">
                  <option value="small">{t("create.sizeSmall", lang)}</option>
                  <option value="medium">{t("create.sizeMedium", lang)}</option>
                  <option value="large">{t("create.sizeLarge", lang)}</option>
                </select>
              </div>

              {/* Energy Level */}
              <div>
                <label className={labelClass}>{t("create.energy", lang)}</label>
                <select name="energyLevel" required className={inputClass} defaultValue="medium">
                  <option value="low">{t("create.energyLow", lang)}</option>
                  <option value="medium">{t("create.energyMedium", lang)}</option>
                  <option value="high">{t("create.energyHigh", lang)}</option>
                </select>
              </div>

              {/* Temperament */}
              <div>
                <label className={labelClass}>{t("create.temperament", lang)}</label>
                <input
                  type="text"
                  name="temperament"
                  required
                  placeholder={t("create.temperamentPlaceholder", lang)}
                  className={inputClass}
                />
              </div>

              {/* Bio */}
              <div>
                <label className={labelClass}>
                  {t("create.bio", lang)} <span className={hintClass}>{t("create.optional", lang)}</span>
                </label>
                <textarea
                  name="bio"
                  placeholder={t("create.bioPlaceholder", lang)}
                  rows={3}
                  className={inputClass}
                />
              </div>

              {/* Dog Photo */}
              <div>
                <label className={labelClass}>
                  🐾 {t("photo.label", lang)} <span className={hintClass}>{t("create.optional", lang)}</span>
                </label>
                <input
                  type="file"
                  name="photo"
                  accept="image/jpeg,image/png,image/webp"
                  className={`${inputClass} cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--pawls-terracotta-500)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white file:transition-colors hover:file:bg-[var(--pawls-terracotta-700)]`}
                />
                <p className="mt-1.5 text-xs text-gray-500">{t("create.photoHint", lang)}</p>
              </div>

              {/* Location */}
              <div>
                <label className={labelClass}>{t("create.location", lang)}</label>
                <input
                  type="text"
                  name="location"
                  required
                  placeholder={t("create.locationPlaceholder", lang)}
                  className={inputClass}
                />
              </div>

              {/* Email (optional) */}
              <div>
                <label className={labelClass}>
                  {t("create.email", lang)} <span className={hintClass}>{t("create.emailHint", lang)}</span>
                </label>
                <input
                  type="email"
                  name="email"
                  placeholder={t("create.emailPlaceholder", lang)}
                  className={inputClass}
                />
              </div>

              {/* Social Media Links (optional) */}
              <fieldset className="rounded-lg border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/50 p-4">
                <legend className="px-2 text-sm font-semibold text-gray-700">📱 {t("create.social", lang)}</legend>
                <div className="space-y-3 pt-1">
                  {/* Instagram */}
                  <div className="flex items-center gap-3">
                    <span className="flex-shrink-0 text-xl">📷</span>
                    <input
                      type="url"
                      name="instagram"
                      placeholder="instagram.com/yourdog"
                      className="flex-1 rounded-lg border border-[var(--pawls-cream-200)] bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
                    />
                  </div>
                  {/* TikTok */}
                  <div className="flex items-center gap-3">
                    <span className="flex-shrink-0 text-xl">🎵</span>
                    <input
                      type="url"
                      name="tiktok"
                      placeholder="tiktok.com/@yourdog"
                      className="flex-1 rounded-lg border border-[var(--pawls-cream-200)] bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
                    />
                  </div>
                  {/* Twitter */}
                  <div className="flex items-center gap-3">
                    <span className="flex-shrink-0 text-xl">🐦</span>
                    <input
                      type="url"
                      name="twitter"
                      placeholder="twitter.com/yourdog"
                      className="flex-1 rounded-lg border border-[var(--pawls-cream-200)] bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
                    />
                  </div>
                  {/* YouTube */}
                  <div className="flex items-center gap-3">
                    <span className="flex-shrink-0 text-xl">▶</span>
                    <input
                      type="url"
                      name="youtube"
                      placeholder="youtube.com/@yourdog"
                      className="flex-1 rounded-lg border border-[var(--pawls-cream-200)] bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
                    />
                  </div>
                </div>
              </fieldset>
            </div>

            <button
              type="submit"
              className="mt-6 w-full rounded-full bg-[var(--pawls-terracotta-500)] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors duration-200 hover:bg-[var(--pawls-terracotta-700)]"
            >
              {t("create.submit", lang)}
            </button>
          </form>
        </div>
      </section>

      <AppFooter lang={lang} />
    </div>
  );
}
