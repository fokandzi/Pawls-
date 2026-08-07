import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { sql } from "../db";
import { createMatchTables } from "../db/schema";
import { parisDogProfiles } from "../db/dog-seed";

type MatchRow = {
  id: number;
  profile_id_1: number;
  profile_id_2: number;
  created_at: string;
  dog1_name: string;
  dog1_breed: string;
  dog1_size: string;
  dog2_name: string;
  dog2_breed: string;
  dog2_size: string;
};

const getMatches = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null || !("profileId" in data)) {
      throw new Error("profileId is required");
    }
    return { profileId: (data as { profileId: number }).profileId };
  })
  .handler(async ({ data }) => {
    await createMatchTables();

    const rows = await sql()`
      SELECT
        m.id,
        m.profile_id_1,
        m.profile_id_2,
        m.created_at,
        dp1.dog_name AS dog1_name,
        dp1.breed AS dog1_breed,
        dp1.size AS dog1_size,
        dp2.dog_name AS dog2_name,
        dp2.breed AS dog2_breed,
        dp2.size AS dog2_size
      FROM matches m
      JOIN dog_profiles dp1 ON m.profile_id_1 = dp1.id
      JOIN dog_profiles dp2 ON m.profile_id_2 = dp2.id
      WHERE m.profile_id_1 = ${data.profileId} OR m.profile_id_2 = ${data.profileId}
      ORDER BY m.created_at DESC
    `;

    return (rows as any[]).map((r) => ({
      ...r,
      created_at: String(r.created_at),
    })) as MatchRow[];
  });

import { seoHead, SEO } from "../lib/seo";

export const Route = createFileRoute("/match/matches")({
  head: () => seoHead(SEO["match/matches"]),
  component: MatchesPage,
});

const sizeEmoji: Record<string, string> = {
  small: "",
  medium: "",
  large: "",
};

// ── Local matches from localStorage ──────────────────────────────────────────
// "View Your Matches" checks pawls-likes against pawls-swipes: a dog you liked
// (pawls-likes) that is also in your swipe history (pawls-swipes) counts as a
// match. This works for anonymous users and when the database is unreachable.

type LocalMatch = {
  id: number;
  name: string;
  breed: string;
  size: string;
  emoji: string;
  imgSrc: string;
};

function readLocalMatches(): LocalMatch[] {
  if (typeof window === "undefined") return [];
  try {
    const likes: unknown = JSON.parse(window.localStorage.getItem("pawls-likes") || "[]");
    const swipes: unknown = JSON.parse(window.localStorage.getItem("pawls-swipes") || "[]");
    if (!Array.isArray(likes) || !Array.isArray(swipes)) return [];
    const matchedIds = likes.filter(
      (n): n is number => typeof n === "number" && swipes.includes(n)
    );
    const byId: Record<number, (typeof parisDogProfiles)[number]> = {};
    parisDogProfiles.forEach((p, i) => {
      byId[1000 + i] = p;
    });
    return matchedIds
      .map((id) => {
        const p = byId[id];
        if (!p) return null;
        return {
          id,
          name: p[1],
          breed: p[2],
          size: p[4],
          emoji: sizeEmoji[p[4]] ?? "",
          imgSrc: `https://placedog.net/500/500?id=${id - 999}`,
        };
      })
      .filter((d): d is LocalMatch => d !== null);
  } catch {
    return [];
  }
}

function MatchesPage() {
  const [profileId, setProfileId] = useState<number | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isPlus, setIsPlus] = useState(false);
  const [localMatches, setLocalMatches] = useState<LocalMatch[]>([]);

  useEffect(() => {
    setLocalMatches(readLocalMatches());
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("pawnder-profile-id");
      if (stored) {
        const id = parseInt(stored, 10);
        if (!isNaN(id)) {
          setProfileId(id);
        }
      }
      if (localStorage.getItem("pawnder-plus") === "true") {
        setIsPlus(true);
      }
    }
  }, []);

  useEffect(() => {
    if (profileId === null) {
      setLoading(false);
      return;
    }

    const fetchMatches = async () => {
      setLoading(true);
      try {
        const result = await getMatches({ data: { profileId } });
        setMatches(result);
      } catch (err: any) {
        setError(err.message || "Failed to load matches");
      } finally {
        setLoading(false);
      }
    };

    fetchMatches();
  }, [profileId]);

  function formatDate(dateStr: string) {
    try {
      return new Date(dateStr).toLocaleDateString("en-NL", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  // Get the "other" dog for a given match
  function getOtherDog(match: MatchRow): {
    name: string;
    breed: string;
    size: string;
    emoji: string;
    imgSrc: string;
  } {
    if (match.profile_id_1 === profileId) {
      return {
        name: match.dog2_name,
        breed: match.dog2_breed,
        size: match.dog2_size,
        emoji: sizeEmoji[match.dog2_size] ?? "",
        imgSrc: `/dogs/${match.dog2_name.toLowerCase()}.jpg`,
      };
    }
    return {
      name: match.dog1_name,
      breed: match.dog1_breed,
      size: match.dog1_size,
      emoji: sizeEmoji[match.dog1_size] ?? "",
      imgSrc: `/dogs/${match.dog1_name.toLowerCase()}.jpg`,
    };
  }

  return (
    <>
      <AppHeader active="match" />
      <section className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <span className="text-5xl"></span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900">
            Your Matches
          </h1>
          <p className="mt-2 text-gray-600">
            These pups want to be friends with your dog!
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--pawls-cream-200)] border-t-[var(--pawls-terracotta-500)]" />
          </div>
        ) : (
          <>
            {/* Local matches (stored in this browser) — work anonymously & without a database */}
            {localMatches.length > 0 && (
              <div className={profileId && matches.length > 0 ? "mb-10" : ""}>
                <div className="space-y-4">
                  {localMatches.map((other) => (
                    <div
                      key={`local-${other.id}`}
                      className="flex items-center gap-4 rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--pawls-cream-50)]">
                        <img
                          src={other.imgSrc}
                          alt={other.name}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            img.style.display = "none";
                            const fallback = img.parentElement?.querySelector(".emoji-fallback");
                            if (fallback) fallback.classList.remove("hidden");
                          }}
                        />
                        <span className="emoji-fallback hidden text-4xl">
                          {other.emoji}
                        </span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900">
                          {other.name}
                        </h3>
                        <p className="text-sm text-gray-500">{other.breed}</p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          Matched in this browser
                        </p>
                      </div>
                      <Link
                        to="/match"
                        className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-[var(--pawls-terracotta-500)] px-4 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[var(--pawls-terracotta-500)]/20 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
                      >
                        Keep swiping →
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {error && localMatches.length === 0 ? (
              <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/50 px-6 py-12 text-center">
                <span className="text-5xl"></span>
                <h2 className="mt-4 text-xl font-bold text-gray-900">Coming soon</h2>
                <p className="mt-2 text-gray-600">{error}</p>
              </div>
            ) : !profileId && localMatches.length === 0 ? (
              <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/50 px-6 py-12 text-center">
                <span className="text-5xl"></span>
                <h2 className="mt-4 text-xl font-bold text-gray-900">No profile yet</h2>
                <p className="mt-2 text-gray-600">
                  Create your dog's profile to start matching!
                </p>
                <Link
                  to="/match/create"
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
                >
                   Create Profile
                </Link>
              </div>
            ) : profileId && matches.length === 0 && localMatches.length === 0 ? (
              <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/50 px-6 py-12 text-center">
                <span className="text-5xl"></span>
                <h2 className="mt-4 text-xl font-bold text-gray-900">No matches yet</h2>
                <p className="mt-2 text-gray-600">
                  Keep swiping to find your dog's perfect playmate!
                </p>
                <Link
                  to="/match"
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
                >
                  ← Back to swiping
                </Link>
              </div>
            ) : profileId && matches.length > 0 ? (
              <div className="space-y-4">
                {matches.map((match) => {
                  const other = getOtherDog(match);
                  return (
                    <div
                      key={match.id}
                      className="flex items-center gap-4 rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--pawls-cream-50)]">
                        <img
                          src={other.imgSrc}
                          alt={other.name}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            img.style.display = "none";
                            const fallback = img.parentElement?.querySelector(".emoji-fallback");
                            if (fallback) fallback.classList.remove("hidden");
                          }}
                        />
                        <span className="emoji-fallback hidden text-4xl">
                          {other.emoji}
                        </span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900">
                          {other.name}
                        </h3>
                        <p className="text-sm text-gray-500">{other.breed}</p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          Matched on {formatDate(match.created_at)}
                        </p>
                      </div>
                      {isPlus ? (
                        <Link
                          to="/match/messages/$matchId"
                          params={{ matchId: String(match.id) }}
                          className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-[var(--pawls-terracotta-500)] px-4 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[var(--pawls-terracotta-500)]/20 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
                        >
                           Message
                        </Link>
                      ) : (
                        <Link
                          to="/plus"
                          className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[var(--pawls-gold-400)] to-[var(--pawls-terracotta-500)] px-4 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[var(--pawls-gold-400)]/25 transition-all hover:from-[var(--pawls-cream-50)]0 hover:to-[var(--pawls-terracotta-700)]"
                        >
                           Message —  Plus only
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </>
        )}

        <div className="mt-8 text-center">
          <Link
            to="/match"
            className="text-sm font-medium text-[var(--pawls-terracotta-500)] transition-colors hover:text-[var(--pawls-terracotta-700)]"
          >
            ← Back to swiping
          </Link>
        </div>
      </div>
      </section>
      <AppFooter />
    </>
  );
}
