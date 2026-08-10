import { createFileRoute } from "@tanstack/react-router";
import { seoHead, SEO } from "../lib/seo";

export const Route = createFileRoute("/match/create")({
  head: () => seoHead(SEO["match/create"]),
  component: CreateProfilePage,
});

const inputClass =
  "w-full rounded-lg border border-[var(--pawls-cream-200)] bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30";
const labelClass = "mb-1 block text-sm font-semibold text-gray-700";

function CreateProfilePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}

      {/* Form */}
      <section className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-12">
        <div className="mx-auto max-w-lg">
          <div className="mb-8 text-center">
            <span className="text-5xl">🐶</span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900">
              Create your dog's profile
            </h1>
            <p className="mt-2 text-gray-600">
              Tell us about your pup so they can find the perfect playmate.
            </p>
          </div>

          <form
            action="/match/create"
            method="POST"
            className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-6 shadow-sm"
          >
            <div className="space-y-4">
              {/* Owner Name */}
              <div>
                <label className={labelClass}>Your Name</label>
                <input
                  type="text"
                  name="ownerName"
                  required
                  placeholder="e.g. Sophie Dubois"
                  className={inputClass}
                />
              </div>

              {/* Dog Name */}
              <div>
                <label className={labelClass}>Dog's Name</label>
                <input
                  type="text"
                  name="dogName"
                  required
                  placeholder="e.g. Boris"
                  className={inputClass}
                />
              </div>

              {/* Breed */}
              <div>
                <label className={labelClass}>Breed</label>
                <input
                  type="text"
                  name="breed"
                  required
                  placeholder="e.g. Labrador Retriever"
                  className={inputClass}
                />
              </div>

              {/* Age */}
              <div>
                <label className={labelClass}>Age (years)</label>
                <input
                  type="number"
                  name="age"
                  required
                  min={0}
                  max={30}
                  placeholder="e.g. 3"
                  className={inputClass}
                />
              </div>

              {/* Size */}
              <div>
                <label className={labelClass}>Size</label>
                <select name="size" required className={inputClass} defaultValue="medium">
                  <option value="small">🐕 Small (0–10 kg)</option>
                  <option value="medium">🐕 Medium (10–25 kg)</option>
                  <option value="large">🐕 Large (25+ kg)</option>
                </select>
              </div>

              {/* Energy Level */}
              <div>
                <label className={labelClass}>Energy Level</label>
                <select name="energyLevel" required className={inputClass} defaultValue="medium">
                  <option value="low">🦴 Low — Couch potato</option>
                  <option value="medium">🦴 Medium — Daily walks</option>
                  <option value="high">🦴 High — Always on the go</option>
                </select>
              </div>

              {/* Temperament */}
              <div>
                <label className={labelClass}>Temperament</label>
                <input
                  type="text"
                  name="temperament"
                  required
                  placeholder="e.g. friendly, playful, shy, calm"
                  className={inputClass}
                />
              </div>

              {/* Bio */}
              <div>
                <label className={labelClass}>
                  Bio <span className="text-xs font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  name="bio"
                  placeholder="Tell other owners a bit about your dog..."
                  rows={3}
                  className={inputClass}
                />
              </div>

              {/* Location */}
              <div>
                <label className={labelClass}>Location</label>
                <input
                  type="text"
                  name="location"
                  required
                  placeholder="e.g. Paris 11e"
                  className={inputClass}
                />
              </div>

              {/* Email (optional) */}
              <div>
                <label className={labelClass}>
                  Your Email{" "}
                  <span className="text-xs font-normal text-gray-400">(for Plus access)</span>
                </label>
                <input
                  type="email"
                  name="email"
                  placeholder="e.g. sophie@email.com"
                  className={inputClass}
                />
              </div>

              {/* Social Media Links (optional) */}
              <fieldset className="rounded-lg border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/50 p-4">
                <legend className="px-2 text-sm font-semibold text-gray-700">
                  📱 Social Media Links{" "}
                  <span className="text-xs font-normal text-gray-400">(optional)</span>
                </legend>
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
              🐾 Create Profile & Start Matching
            </button>
          </form>
        </div>
      </section>

      {/* Footer */}
    </div>
  );
}
