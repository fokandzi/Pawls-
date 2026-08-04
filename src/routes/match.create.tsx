import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { trackEvent, identifyUser } from "../lib/analytics";
import { sql } from "../db";
import { createMatchTables, updateDogSocialLinks } from "../db/schema";

const createDogProfile = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null) throw new Error("Invalid data");
    const d = data as Record<string, unknown>;
    const required = ["ownerName", "dogName", "breed", "age", "size", "energyLevel", "temperament", "location"];
    for (const key of required) {
      if (typeof d[key] !== "string" || !(d[key] as string).trim()) {
        throw new Error(`${key} is required`);
      }
    }
    return {
      ownerName: (d.ownerName as string).trim(),
      dogName: (d.dogName as string).trim(),
      breed: (d.breed as string).trim(),
      age: parseInt(d.age as string, 10),
      size: (d.size as string).trim(),
      energyLevel: (d.energyLevel as string).trim(),
      temperament: (d.temperament as string).trim(),
      bio: typeof d.bio === "string" ? d.bio.trim() : "",
      location: (d.location as string).trim(),
      email: typeof d.email === "string" ? d.email.trim() : "",
      instagram: typeof d.instagram === "string" ? d.instagram.trim() : "",
      tiktok: typeof d.tiktok === "string" ? d.tiktok.trim() : "",
      twitter: typeof d.twitter === "string" ? d.twitter.trim() : "",
      youtube: typeof d.youtube === "string" ? d.youtube.trim() : "",
    };
  })
  .handler(async ({ data }) => {
    await createMatchTables();

    const [profile] = await sql()`
      INSERT INTO dog_profiles (owner_name, dog_name, breed, age, size, energy_level, temperament, bio, location, email, instagram, tiktok, twitter, youtube)
      VALUES (${data.ownerName}, ${data.dogName}, ${data.breed}, ${data.age}, ${data.size}, ${data.energyLevel}, ${data.temperament}, ${data.bio}, ${data.location}, ${data.email || null}, ${data.instagram || null}, ${data.tiktok || null}, ${data.twitter || null}, ${data.youtube || null})
      RETURNING id
    `;

    return { success: true, profileId: profile.id as number };
  });

import { seoHead, SEO } from "../lib/seo";

export const Route = createFileRoute("/match/create")({
  head: () => seoHead(SEO["match/create"]),
  component: CreateProfilePage,
});

const sizeEmojis: Record<string, string> = {
  small: "",
  medium: "",
  large: "",
};

function CreateProfilePage() {
  const router = useRouter();
  const [form, setForm] = useState({
    ownerName: "",
    dogName: "",
    breed: "",
    age: "",
    size: "medium",
    energyLevel: "medium",
    temperament: "",
    bio: "",
    location: "",
    email: "",
    instagram: "",
    tiktok: "",
    twitter: "",
    youtube: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await createDogProfile({ data: form });
      if (result.success && result.profileId) {
        if (typeof window !== "undefined") {
          localStorage.setItem("pawnder-profile-id", String(result.profileId));
          trackEvent("profile_created");
          if (form.email) {
            identifyUser(form.email);
            localStorage.setItem("pawnder-email", form.email);
            localStorage.setItem("userEmail", form.email);
          }
        }
        router.navigate({ to: "/match" });
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <AppHeader active="match" />

      {/* Form */}
      <section className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-12">
        <div className="mx-auto max-w-lg">
          <div className="mb-8 text-center">
            <span className="text-5xl">{sizeEmojis[form.size] || ""}</span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900">
              Create your dog's profile
            </h1>
            <p className="mt-2 text-gray-600">
              Tell us about your pup so they can find the perfect playmate.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-6 shadow-sm"
          >
            <div className="space-y-4">
              {/* Owner Name */}
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Your Name
                </label>
                <input
                  type="text"
                  required
                  value={form.ownerName}
                  onChange={(e) => update("ownerName", e.target.value)}
                  placeholder="e.g. Sophie Dubois"
                  className="w-full rounded-lg border border-[var(--pawls-cream-200)] bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
                />
              </div>

              {/* Dog Name */}
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Dog's Name
                </label>
                <input
                  type="text"
                  required
                  value={form.dogName}
                  onChange={(e) => update("dogName", e.target.value)}
                  placeholder="e.g. Boris"
                  className="w-full rounded-lg border border-[var(--pawls-cream-200)] bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
                />
              </div>

              {/* Breed */}
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Breed
                </label>
                <input
                  type="text"
                  required
                  value={form.breed}
                  onChange={(e) => update("breed", e.target.value)}
                  placeholder="e.g. Labrador Retriever"
                  className="w-full rounded-lg border border-[var(--pawls-cream-200)] bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
                />
              </div>

              {/* Age */}
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Age (years)
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  max={30}
                  value={form.age}
                  onChange={(e) => update("age", e.target.value)}
                  placeholder="e.g. 3"
                  className="w-full rounded-lg border border-[var(--pawls-cream-200)] bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
                />
              </div>

              {/* Size */}
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Size
                </label>
                <select
                  required
                  value={form.size}
                  onChange={(e) => update("size", e.target.value)}
                  className="w-full rounded-lg border border-[var(--pawls-cream-200)] bg-white px-4 py-2.5 text-gray-900 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
                >
                  <option value="small"> Small (0–10 kg)</option>
                  <option value="medium"> Medium (10–25 kg)</option>
                  <option value="large"> Large (25+ kg)</option>
                </select>
              </div>

              {/* Energy Level */}
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Energy Level
                </label>
                <select
                  required
                  value={form.energyLevel}
                  onChange={(e) => update("energyLevel", e.target.value)}
                  className="w-full rounded-lg border border-[var(--pawls-cream-200)] bg-white px-4 py-2.5 text-gray-900 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
                >
                  <option value="low"> Low — Couch potato</option>
                  <option value="medium"> Medium — Daily walks</option>
                  <option value="high">High — Always on the go</option>
                </select>
              </div>

              {/* Temperament */}
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Temperament
                </label>
                <input
                  type="text"
                  required
                  value={form.temperament}
                  onChange={(e) => update("temperament", e.target.value)}
                  placeholder="e.g. friendly, playful, shy, calm"
                  className="w-full rounded-lg border border-[var(--pawls-cream-200)] bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
                />
              </div>

              {/* Bio */}
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Bio (optional)
                </label>
                <textarea
                  value={form.bio}
                  onChange={(e) => update("bio", e.target.value)}
                  placeholder="Tell other owners a bit about your dog..."
                  rows={3}
                  className="w-full rounded-lg border border-[var(--pawls-cream-200)] bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
                />
              </div>

              {/* Location */}
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Location
                </label>
                <input
                  type="text"
                  required
                  value={form.location}
                  onChange={(e) => update("location", e.target.value)}
                  placeholder="e.g. Paris 11e"
                  className="w-full rounded-lg border border-[var(--pawls-cream-200)] bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
                />
              </div>

              {/* Email (optional) */}
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Your Email{" "}
                  <span className="text-xs font-normal text-gray-400">(for Plus access)</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="e.g. sophie@email.com"
                  className="w-full rounded-lg border border-[var(--pawls-cream-200)] bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
                />
              </div>

              {/* Social Media Links (optional) */}
              <fieldset className="rounded-lg border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/50 p-4">
                <legend className="px-2 text-sm font-semibold text-gray-700">
                   Social Media Links{" "}
                  <span className="text-xs font-normal text-gray-400">(optional)</span>
                </legend>
                <div className="space-y-3 pt-1">
                  {/* Instagram */}
                  <div className="flex items-center gap-3">
                    <span className="flex-shrink-0 text-xl"></span>
                    <input
                      type="url"
                      value={form.instagram}
                      onChange={(e) => update("instagram", e.target.value)}
                      placeholder="instagram.com/yourdog"
                      className="flex-1 rounded-lg border border-[var(--pawls-cream-200)] bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
                    />
                  </div>
                  {/* TikTok */}
                  <div className="flex items-center gap-3">
                    <span className="flex-shrink-0 text-xl"></span>
                    <input
                      type="url"
                      value={form.tiktok}
                      onChange={(e) => update("tiktok", e.target.value)}
                      placeholder="tiktok.com/@yourdog"
                      className="flex-1 rounded-lg border border-[var(--pawls-cream-200)] bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
                    />
                  </div>
                  {/* Twitter */}
                  <div className="flex items-center gap-3">
                    <span className="flex-shrink-0 text-xl"></span>
                    <input
                      type="url"
                      value={form.twitter}
                      onChange={(e) => update("twitter", e.target.value)}
                      placeholder="twitter.com/yourdog"
                      className="flex-1 rounded-lg border border-[var(--pawls-cream-200)] bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
                    />
                  </div>
                  {/* YouTube */}
                  <div className="flex items-center gap-3">
                    <span className="flex-shrink-0 text-xl">▶</span>
                    <input
                      type="url"
                      value={form.youtube}
                      onChange={(e) => update("youtube", e.target.value)}
                      placeholder="youtube.com/@yourdog"
                      className="flex-1 rounded-lg border border-[var(--pawls-cream-200)] bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
                    />
                  </div>
                </div>
              </fieldset>
            </div>

            {error && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full rounded-full bg-[var(--pawls-terracotta-500)] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors duration-200 hover:bg-[var(--pawls-terracotta-700)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Creating..." : " Create Profile & Start Matching"}
            </button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <AppFooter />
    </div>
  );
}
