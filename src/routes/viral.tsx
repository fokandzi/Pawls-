import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { getTrendingDogs } from "../db/schema";
import { seoHead, SEO } from "../lib/seo";
import { EmptyState } from "../lib/empty-state";

type TrendingDog = {
  id: number;
  dog_name: string;
  breed: string;
  photo_url: string | null;
  location: string;
  owner_name: string;
  instagram: string | null;
  tiktok: string | null;
  twitter: string | null;
  youtube: string | null;
  swipe_count: number;
};

const rankEmojis = ["", "", ""];

function rankBadge(index: number) {
  if (index < 3) {
    return (
      <span className="absolute -left-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm shadow-md ring-2 ring-[var(--pawls-gold-400)]">
        {rankEmojis[index]}
      </span>
    );
  }
  return (
    <span className="absolute -left-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--pawls-cream-100)] text-xs font-bold text-[var(--pawls-gold-500)] shadow-sm ring-1 ring-[var(--pawls-cream-200)]">
      {index + 1}
    </span>
  );
}

export const Route = createFileRoute("/viral")({
  head: () => seoHead(SEO.viral),
  loader: async () => {
    try {
      return { dogs: await getTrendingDogs(), error: "" };
    } catch (err: any) {
      return { dogs: [], error: err?.message || "Failed to load trending dogs" };
    }
  },
  component: ViralPage,
});

function ViralPage() {
  const { dogs, error } = Route.useLoaderData();
  const [selectedDog, setSelectedDog] = useState<TrendingDog | null>(null);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <AppHeader active="viral" />

      {/* Hero */}
      <section className="bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 pb-8 pt-12 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
           Viral Paws
        </h1>
        <p className="mt-3 text-lg text-gray-600">
          Demo feed — the viral leaderboard is coming soon
        </p>

        {/* Plus upsell banner */}
        <Link
          to="/plus"
          className="mx-auto mt-6 inline-flex max-w-md items-center gap-2 rounded-full bg-gradient-to-r from-[var(--pawls-gold-400)] to-[var(--pawls-terracotta-500)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--pawls-cream-50)]0/25 transition-all hover:from-[var(--pawls-cream-50)]0 hover:to-[var(--pawls-terracotta-700)] hover:shadow-xl hover:scale-105"
        >
           Pawls Plus — coming soon →
        </Link>
      </section>

      {/* Content */}
      <section className="flex-1 bg-white px-6 pb-20">
        <div className="mx-auto max-w-6xl">
          {/* Loading */}
          {false && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[var(--pawls-cream-200)] border-t-[var(--pawls-terracotta-500)]" />
              <p className="text-gray-500">Loading trending dogs...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <EmptyState emoji="" title="Couldn't load trending dogs" description={error} />
          )}

          {/* Empty state */}
          {!error && dogs.length === 0 && (
            <EmptyState emoji="" title="No trending dogs yet" description="Be the first to make your dog go viral!" action={{ label: " Create Profile", to: "/match/create" }} />
          )}

          {/* Dog grid */}
          {!error && dogs.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {dogs.map((dog, i) => (
                <button
                  key={dog.id}
                  onClick={() => setSelectedDog(dog)}
                  className="group relative overflow-hidden rounded-xl border border-[var(--pawls-cream-100)] bg-white shadow-sm transition-all hover:shadow-lg hover:border-amber-300 hover:-translate-y-1 text-left"
                >
                  {/* Photo */}
                  <div className="relative flex h-40 items-center justify-center overflow-hidden bg-gradient-to-br from-[var(--pawls-cream-100)] to-[var(--pawls-cream-50)] sm:h-48">
                    <span className="absolute inset-0 flex items-center justify-center text-6xl">🐶</span>
                    {dog.photo_url ? (
                      <img
                        src={dog.photo_url}
                        alt={dog.dog_name}
                        className="relative z-10 h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : null}
                    {/* Rank badge */}
                    {rankBadge(i)}
                    {/* Swipe count */}
                    <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">
                       {dog.swipe_count}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <h3 className="font-bold text-gray-900 truncate">{dog.dog_name}</h3>
                    <p className="text-xs text-gray-500 truncate">{dog.breed}</p>
                    <p className="mt-1 text-xs text-gray-400 truncate"> {dog.location}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Dog detail modal */}
      {selectedDog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
          onClick={() => setSelectedDog(null)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setSelectedDog(null)}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-gray-900"
            >
              
            </button>

            {/* Photo */}
            <div className="relative flex h-56 items-center justify-center overflow-hidden bg-gradient-to-br from-[var(--pawls-cream-100)] to-[var(--pawls-cream-50)]">
              <span className="absolute inset-0 flex items-center justify-center text-8xl">🐶</span>
              {selectedDog.photo_url ? (
                <img
                  src={selectedDog.photo_url}
                  alt={selectedDog.dog_name}
                  className="relative z-10 h-full w-full object-cover"
                />
              ) : null}
              <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-3 py-1 text-sm font-bold text-white backdrop-blur-sm">
                 {selectedDog.swipe_count} likes
              </span>
            </div>

            {/* Details */}
            <div className="p-6">
              <h2 className="text-2xl font-extrabold text-gray-900">{selectedDog.dog_name}</h2>
              <p className="text-gray-500">{selectedDog.breed}</p>
              <p className="mt-2 text-sm text-gray-600"> {selectedDog.location}</p>
              <p className="text-sm text-gray-500">Owner: {selectedDog.owner_name}</p>

              {/* Social links */}
              {(selectedDog.instagram || selectedDog.tiktok || selectedDog.twitter || selectedDog.youtube) && (
                <div className="mt-4 border-t border-[var(--pawls-cream-100)] pt-4">
                  <p className="mb-2 text-xs font-semibold text-gray-500"> Social Media</p>
                  <div className="flex items-center gap-3">
                    {selectedDog.instagram && (
                      <a
                        href={selectedDog.instagram.startsWith("http") ? selectedDog.instagram : `https://${selectedDog.instagram}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-pink-400 to-purple-500 text-lg text-white shadow-sm transition-transform hover:scale-110"
                        title="Instagram"
                      >
                        
                      </a>
                    )}
                    {selectedDog.tiktok && (
                      <a
                        href={selectedDog.tiktok.startsWith("http") ? selectedDog.tiktok : `https://${selectedDog.tiktok}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-lg text-white shadow-sm transition-transform hover:scale-110"
                        title="TikTok"
                      >
                        
                      </a>
                    )}
                    {selectedDog.twitter && (
                      <a
                        href={selectedDog.twitter.startsWith("http") ? selectedDog.twitter : `https://${selectedDog.twitter}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-400 text-lg text-white shadow-sm transition-transform hover:scale-110"
                        title="Twitter"
                      >
                        
                      </a>
                    )}
                    {selectedDog.youtube && (
                      <a
                        href={selectedDog.youtube.startsWith("http") ? selectedDog.youtube : `https://${selectedDog.youtube}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-lg text-white shadow-sm transition-transform hover:scale-110"
                        title="YouTube"
                      >
                        ▶
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 flex flex-col gap-2">
                <Link
                  to="/match"
                  className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
                >
                   Swipe on more dogs
                </Link>
                <Link
                  to="/plus"
                  className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-gradient-to-r from-[var(--pawls-gold-400)] to-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[var(--pawls-cream-50)]0/25 transition-all hover:from-[var(--pawls-cream-50)]0 hover:to-[var(--pawls-terracotta-700)]"
                >
                   Pawls Plus — coming soon
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <AppFooter />
    </div>
  );
}
