import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { sql } from "../db";
import { createMatchTables, createVenuesTable, checkPlusStatus, checkSwipeAllowance } from "../db/schema";
import { withTimeout } from "../lib/timeout";
import { EmptyState } from "../lib/empty-state";
import { ensureDogProfilesSeeded } from "../db/dog-seed";
import { trackEvent } from "../lib/analytics";

// ── City-to-coordinates mapping for playdate midpoint calculation ────────────

const cityCoords: Record<string, { lat: number; lng: number }> = {
  "Paris 11e": { lat: 48.8580, lng: 2.3793 },
  "Paris 16e": { lat: 48.8637, lng: 2.2769 },
  "Paris 5e": { lat: 48.8461, lng: 2.3513 },
  "Paris 18e": { lat: 48.8922, lng: 2.3448 },
  Montreuil: { lat: 48.8638, lng: 2.4486 },
  "Boulogne-Billancourt": { lat: 48.8352, lng: 2.2409 },
  "Saint-Germain-en-Laye": { lat: 48.8989, lng: 2.0938 },
  Vincennes: { lat: 48.8478, lng: 2.4392 },
  Nanterre: { lat: 48.8923, lng: 2.2070 },
  "Issy-les-Moulineaux": { lat: 48.8246, lng: 2.2749 },
};

// ── Playdate venue type ──────────────────────────────────────────────────────

type PlaydateVenue = {
  id: number;
  name: string;
  type: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  description: string | null;
  dog_features: string[] | null;
  rating: number;
  distance_km: number;
};

// Seed data — used for auto-seeding when the database is empty
const seedProfiles = [
  {
    owner_name: "Sophie Dubois",
    dog_name: "Boris",
    breed: "Labrador Retriever",
    age: 3,
    size: "large",
    energy_level: "high",
    temperament: "friendly",
    bio: "Boris loves swimming in the Seine and playing fetch at Bois de Vincennes. He's a social butterfly who gets along with every dog he meets!",
    location: "Paris 11e",
  },
  {
    owner_name: "Damien Moreau",
    dog_name: "Luna",
    breed: "Corgi",
    age: 2,
    size: "small",
    energy_level: "medium",
    temperament: "playful",
    bio: "Luna has short legs but a huge personality! She loves chasing pigeons near the Eiffel Tower and snuggling on the couch after a long walk.",
    location: "Paris 16e",
  },
  {
    owner_name: "Emilie Bernard",
    dog_name: "Max",
    breed: "German Shepherd",
    age: 4,
    size: "large",
    energy_level: "high",
    temperament: "playful",
    bio: "Max is a working-line shepherd who needs an active playmate. He excels at agility and loves a good game of tug-of-war.",
    location: "Boulogne-Billancourt",
  },
  {
    owner_name: "Laurent Petit",
    dog_name: "Coco",
    breed: "French Bulldog",
    age: 5,
    size: "small",
    energy_level: "low",
    temperament: "calm",
    bio: "Coco is a laid-back Frenchie who enjoys short walks and long naps. Perfect café-terrasse companion — she just wants to be near you.",
    location: "Paris 5e",
  },
  {
    owner_name: "Manon Lefèvre",
    dog_name: "Nora",
    breed: "Border Collie",
    age: 2,
    size: "medium",
    energy_level: "high",
    temperament: "friendly",
    bio: "Nora is whip-smart and needs mental stimulation. She'd love a friend who can keep up with her frisbee obsession at Buttes-Chaumont!",
    location: "Paris 18e",
  },
  {
    owner_name: "Théo Girard",
    dog_name: "Ollie",
    breed: "Golden Retriever",
    age: 1,
    size: "large",
    energy_level: "medium",
    temperament: "friendly",
    bio: "Ollie is a big goofball puppy with endless enthusiasm. He's still learning his manners but has a heart of gold. Loves mud puddles.",
    location: "Montreuil",
  },
  {
    owner_name: "Fleur Marchand",
    dog_name: "Mila",
    breed: "Dachshund",
    age: 6,
    size: "small",
    energy_level: "medium",
    temperament: "shy",
    bio: "Mila is a sweet little sausage dog who takes a moment to warm up but is deeply loyal once she trusts you. Enjoys sunbathing along the Seine.",
    location: "Vincennes",
  },
  {
    owner_name: "Sandrine Leroy",
    dog_name: "Rex",
    breed: "Husky",
    age: 3,
    size: "large",
    energy_level: "high",
    temperament: "playful",
    bio: "Rex is a talkative husky who will tell you all about his day. He needs a running buddy who can handle his dramatic personality!",
    location: "Nanterre",
  },
  {
    owner_name: "Lise Mercier",
    dog_name: "Pippa",
    breed: "Cavalier King Charles Spaniel",
    age: 4,
    size: "small",
    energy_level: "low",
    temperament: "calm",
    bio: "Pippa is a gentle lapdog who loves nothing more than being carried around and meeting new friends. The sweetest girl you'll ever meet.",
    location: "Issy-les-Moulineaux",
  },
  {
    owner_name: "Noé Laurent",
    dog_name: "Kai",
    breed: "Australian Shepherd",
    age: 2,
    size: "medium",
    energy_level: "high",
    temperament: "playful",
    bio: "Kai is an athletic, smart Aussie who lives for frisbee and herding games. Looking for a high-energy playmate for weekend adventures in the Forêt de Saint-Germain!",
    location: "Saint-Germain-en-Laye",
  },
];

type DogProfile = {
  id: number;
  owner_name: string;
  dog_name: string;
  breed: string;
  age: number;
  size: string;
  energy_level: string;
  temperament: string;
  bio: string | null;
  photo_url: string | null;
  location: string;
  email: string | null;
  instagram: string | null;
  tiktok: string | null;
  twitter: string | null;
  youtube: string | null;
};

type MatchResult = {
  matched: boolean;
  matchId?: number;
  matchedDogName?: string;
  matchedBreed?: string;
};

const sizeEmoji: Record<string, string> = {
  small: "",
  medium: "",
  large: "",
};

const energyBadge: Record<string, { bg: string; text: string; label: string }> = {
  low: { bg: "bg-blue-100", text: "text-blue-700", label: "Low Energy" },
  medium: { bg: "bg-[var(--pawls-cream-100)]", text: "text-[var(--pawls-gold-500)]", label: "Medium Energy" },
  high: { bg: "bg-red-100", text: "text-red-700", label: "High Energy" },
};

const sizeLabel: Record<string, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

const getProfilesToSwipe = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null || !("profileId" in data)) {
      throw new Error("profileId is required");
    }
    return { profileId: (data as { profileId: number }).profileId };
  })
  .handler(async ({ data }) => {
    try {
      await createMatchTables();
      await ensureDogProfilesSeeded();
      console.info("[match] dog profile schema and seed ready");

      const profiles = await sql()`
      SELECT dp.* FROM dog_profiles dp
      WHERE dp.id != ${data.profileId}
        AND dp.id NOT IN (
          SELECT target_profile_id FROM swipes WHERE swiper_profile_id = ${data.profileId}
        )
      ORDER BY dp.created_at DESC
    `;

      return (profiles as DogProfile[]).map((p) => ({
        ...p,
        created_at: undefined,
      }));
    } catch (error) {
      console.error("[match] failed to prepare or load dog profiles", error);
      throw error;
    }
  });

const recordSwipe = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null) throw new Error("Invalid data");
    const d = data as Record<string, unknown>;
    if (!d.swiperProfileId || !d.targetProfileId || !d.direction) {
      throw new Error("swiperProfileId, targetProfileId, and direction are required");
    }
    return {
      swiperProfileId: d.swiperProfileId as number,
      targetProfileId: d.targetProfileId as number,
      direction: d.direction as string,
    };
  })
  .handler(async ({ data }) => {
    await createMatchTables();

    // Record the swipe
    await sql()`
      INSERT INTO swipes (swiper_profile_id, target_profile_id, direction)
      VALUES (${data.swiperProfileId}, ${data.targetProfileId}, ${data.direction})
      ON CONFLICT (swiper_profile_id, target_profile_id) DO NOTHING
    `;

    let matchResult: MatchResult = { matched: false };

    // If swiped right, check if the other dog also swiped right on us
    if (data.direction === "right") {
      const [theirSwipe] = await sql()`
        SELECT direction FROM swipes
        WHERE swiper_profile_id = ${data.targetProfileId}
          AND target_profile_id = ${data.swiperProfileId}
          AND direction = 'right'
      `;

      if (theirSwipe) {
        // It's a match! Ensure profile_id_1 < profile_id_2 for consistency
        const [p1, p2] = [data.swiperProfileId, data.targetProfileId].sort((a, b) => a - b);

        await sql()`
          INSERT INTO matches (profile_id_1, profile_id_2)
          VALUES (${p1}, ${p2})
          ON CONFLICT (profile_id_1, profile_id_2) DO NOTHING
        `;

        // Get the match ID and the matched dog's name
        const [matchRow] = await sql()`
          SELECT id FROM matches WHERE profile_id_1 = ${p1} AND profile_id_2 = ${p2}
        `;
        const [matchedDog] = await sql()`
          SELECT dog_name, breed FROM dog_profiles WHERE id = ${data.targetProfileId}
        `;

        matchResult = {
          matched: true,
          matchId: (matchRow as any)?.id,
          matchedDogName: (matchedDog as any)?.dog_name ?? "Unknown",
          matchedBreed: (matchedDog as any)?.breed ?? "",
        };
      }
    }

    return matchResult;
  });

const getPlaydateVenues = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null) throw new Error("Invalid data");
    const d = data as Record<string, unknown>;
    if (!d.profileId1 || !d.profileId2) {
      throw new Error("profileId1 and profileId2 are required");
    }
    return {
      profileId1: d.profileId1 as number,
      profileId2: d.profileId2 as number,
    };
  })
  .handler(async ({ data }) => {
    await createVenuesTable();

    // Get both profiles' locations
    const [p1] = await sql()`SELECT location FROM dog_profiles WHERE id = ${data.profileId1}`;
    const [p2] = await sql()`SELECT location FROM dog_profiles WHERE id = ${data.profileId2}`;

    if (!p1 || !p2) return { venues: [] as PlaydateVenue[] };

    const loc1 = (p1 as any).location as string;
    const loc2 = (p2 as any).location as string;

    const c1 = cityCoords[loc1];
    const c2 = cityCoords[loc2];

    // Calculate midpoint
    let midLat: number, midLng: number;
    if (c1 && c2) {
      midLat = (c1.lat + c2.lat) / 2;
      midLng = (c1.lng + c2.lng) / 2;
    } else if (c1) {
      midLat = c1.lat;
      midLng = c1.lng;
    } else if (c2) {
      midLat = c2.lat;
      midLng = c2.lng;
    } else {
      // Default to Paris center
      midLat = 48.8566;
      midLng = 2.3522;
    }

    // Get all venues, calculate distance from midpoint, return top 3
    const allVenues = await sql()`
      SELECT id, name, type, address, city, lat, lng, description, dog_features, rating
      FROM venues
    `;

    const venues = (allVenues as any[]).map((v) => {
      const dLat = (Number(v.lat) - midLat) * 111.32;
      const dLng = (Number(v.lng) - midLng) * (111.32 * Math.cos((midLat * Math.PI) / 180));
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      return {
        id: v.id,
        name: v.name,
        type: v.type,
        address: v.address,
        city: v.city,
        lat: Number(v.lat),
        lng: Number(v.lng),
        description: v.description,
        dog_features: v.dog_features,
        rating: Number(v.rating),
        distance_km: Math.round(dist * 10) / 10,
      };
    });

    venues.sort((a, b) => a.distance_km - b.distance_km);
    return { venues: venues.slice(0, 3) as PlaydateVenue[] };
  });

import { seoHead, SEO } from "../lib/seo";

export const Route = createFileRoute("/match")({
  head: () => seoHead(SEO.match),
  component: MatchPage,
});

function MatchPage() {
  const routerState = useRouterState();
  const isExactMatch = routerState.location.pathname === "/match";

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <AppHeader active="match" />

      {isExactMatch ? <SwipeUI /> : <Outlet />}

      {/* Footer */}
      <AppFooter />
    </div>
  );
}

function SwipeUI() {
  const [profileId, setProfileId] = useState<number | null>(null);
  const [profiles, setProfiles] = useState<DogProfile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swiping, setSwiping] = useState<"left" | "right" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [matchOverlay, setMatchOverlay] = useState<MatchResult | null>(null);
  const [isPlus, setIsPlus] = useState(false);
  const [playdateStep, setPlaydateStep] = useState<"match" | "playdate" | null>(null);
  const [playdateVenues, setPlaydateVenues] = useState<PlaydateVenue[]>([]);
  const [playdateLoading, setPlaydateLoading] = useState(false);
  const [matchedTargetId, setMatchedTargetId] = useState<number | null>(null);

  // Load profile ID and Plus status from localStorage on mount (client only)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("pawnder-profile-id");
      if (stored) {
        const id = parseInt(stored, 10);
        if (!isNaN(id)) {
          setProfileId(id);
        }
      }
      // Check Plus status via server using stored email
      const userEmail = localStorage.getItem("userEmail");
      if (userEmail) {
        checkPlusStatus({ data: { email: userEmail } })
          .then((res) => setIsPlus(res.hasPlus))
          .catch(() => setIsPlus(false))
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }
  }, []);

  // Fetch profiles when profileId is available
  useEffect(() => {
    if (profileId === null) return;

    const fetchProfiles = async () => {
      setLoading(true);
      try {
        const result = await withTimeout(getProfilesToSwipe({ data: { profileId } }), 8000, "Profile loading");
        setProfiles(result);
      } catch (err: any) {
        setError(err.message?.includes("timed out") ? "Taking longer than expected — please try again." : (err.message || "Failed to load profiles"));
      } finally {
        setLoading(false);
      }
    };

    fetchProfiles();
  }, [profileId]);

  const handleSwipe = useCallback(
    async (direction: "left" | "right") => {
      if (profileId === null || currentIndex >= profiles.length) return;

      const target = profiles[currentIndex];
      if (!isPlus) {
        const allowance = await checkSwipeAllowance({ data: { profileId } });
        if (!allowance.allowed) {
          trackEvent("third_swipe_free");
          trackEvent("paywall_shown");
          setError("You've used your 3 free swipes today. Upgrade to Pawls Plus for unlimited swipes.");
          return;
        }
      }
      setSwiping(direction);
      if (typeof window !== "undefined" && !localStorage.getItem("pawls-first-swipe")) {
        localStorage.setItem("pawls-first-swipe", "true");
        trackEvent("first_swipe");
      }

      try {
        const result = await recordSwipe({
          data: {
            swiperProfileId: profileId,
            targetProfileId: target.id,
            direction,
          },
        });

        // Wait for animation
        await new Promise((r) => setTimeout(r, 400));

        if (result.matched) {
          trackEvent("match_created");
          setMatchOverlay(result);
          setMatchedTargetId(target.id);
          setPlaydateStep("match");
          // Auto-dismiss overlay after 3 seconds → now we go to playdate step
          setTimeout(() => {
            setPlaydateStep("playdate");
            setPlaydateLoading(true);
            // Fetch nearby venues
            getPlaydateVenues({
              data: { profileId1: profileId, profileId2: target.id },
            })
              .then((res) => {
                setPlaydateVenues(res.venues);
                setPlaydateLoading(false);
              })
              .catch(() => {
                setPlaydateLoading(false);
              });
          }, 3000);
        } else {
          setCurrentIndex((i) => i + 1);
        }
      } catch (err: any) {
        setError(err.message || "Something went wrong");
      } finally {
        setSwiping(null);
      }
    },
    [profileId, currentIndex, profiles],
  );

  // Loading state
  if (loading) {
    return (
      <section className="flex flex-1 items-center justify-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-20">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[var(--pawls-cream-200)] border-t-[var(--pawls-terracotta-500)]" />
          <p className="text-gray-600">Loading profiles...</p>
        </div>
      </section>
    );
  }

  // No profile created yet
  if (profileId === null) {
    return (
      <section className="flex flex-1 items-center justify-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-20">
        <div className="max-w-sm text-center">
          <span className="text-6xl"></span>
          <h2 className="mt-4 text-2xl font-bold text-gray-900">
            Create your dog's profile
          </h2>
          <p className="mt-2 text-gray-600">
            Set up a profile for your pup to start finding compatible playmates nearby.
          </p>
          <Link
            to="/match/create"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
          >
             Create Profile
          </Link>
        </div>
      </section>
    );
  }

  // Error state
  if (error) {
    return (
      <section className="flex flex-1 items-center justify-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-20"><EmptyState emoji="" title="Couldn’t load profiles" description={error} /></section>
    );
  }

  // No more profiles to show
  if (currentIndex >= profiles.length) {
    return (
      <section className="flex flex-1 items-center justify-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-20">
        <div className="max-w-sm text-center">
          <span className="text-6xl"></span>
          <h2 className="mt-4 text-2xl font-bold text-gray-900">
            No more dogs in your area
          </h2>
          <p className="mt-2 text-gray-600">
            Check back soon — new playmates join every day!
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Link
              to="/match/matches"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
            >
               View Your Matches
            </Link>
            <button
              onClick={() => {
                setCurrentIndex(0);
                setProfiles([]);
                // Re-fetch
                getProfilesToSwipe({ data: { profileId: profileId! } }).then((p) => {
                  setProfiles(p);
                  setCurrentIndex(0);
                });
              }}
              className="text-sm font-medium text-[var(--pawls-terracotta-500)] transition-colors hover:text-[var(--pawls-terracotta-700)]"
            >
               Refresh
            </button>
          </div>
        </div>
      </section>
    );
  }

  const current = profiles[currentIndex];
  const energyCfg = energyBadge[current.energy_level] ?? energyBadge.medium;

  return (
    <section className="relative flex flex-1 flex-col items-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-8">
      {/* Match / Playdate Overlay */}
      {matchOverlay && playdateStep && (
        <div className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8 backdrop-blur-sm">
          {playdateStep === "match" ? (
            /* Step 1: Match celebration */
            <div className="mx-auto mt-12 w-full max-w-sm animate-bounce rounded-2xl border-4 border-[var(--pawls-terracotta-500)] bg-white p-8 text-center shadow-2xl">
              <div className="text-6xl"></div>
              <div className="mt-4 text-5xl"></div>
              <h2 className="mt-4 text-3xl font-extrabold text-[var(--pawls-terracotta-500)]">
                It's a match!
              </h2>
              <p className="mt-3 text-lg text-gray-700">
                <strong>{matchOverlay.matchedDogName}</strong>
                {matchOverlay.matchedBreed ? ` (${matchOverlay.matchedBreed})` : ""}
              </p>
              <p className="mt-2 text-gray-600">
                Your dogs could be best friends! 
              </p>
              <div className="mt-4 flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--pawls-cream-200)] border-t-[var(--pawls-terracotta-500)]" />
                <p className="text-xs text-gray-400">Finding nearby venues...</p>
              </div>
            </div>
          ) : (
            /* Step 2: Playdate suggestions */
            <div className="mx-auto mt-8 w-full max-w-md rounded-2xl border-2 border-[var(--pawls-cream-200)] bg-white p-6 shadow-2xl">
              <div className="mb-1 text-center">
                <span className="text-4xl"></span>
              </div>
              <h2 className="text-center text-xl font-extrabold text-gray-900">
                Arrange a Playdate!
              </h2>
              <p className="mt-1 text-center text-sm text-gray-500">
                Here are some great dog-friendly spots between you and{" "}
                <strong>{matchOverlay.matchedDogName}</strong>.
              </p>

              {playdateLoading ? (
                <div className="mt-6 flex justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--pawls-cream-200)] border-t-[var(--pawls-terracotta-500)]" />
                </div>
              ) : playdateVenues.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {playdateVenues.map((venue) => {
                    const typeEmoji: Record<string, string> = {
                      cafe: "", park: "", beach: "", trail: "", bar: "",
                    };
                    const featureEmojiMap: Record<string, string> = {
                      "off-leash area": "",
                      "water bowls": "",
                      "dog treats": "",
                      "fenced": "",
                      "indoor seating": "",
                      "outdoor seating": "",
                      "dog menu": "",
                      "swimming": "",
                      "fenced sections": "",
                      "walking paths": "",
                      "agility equipment": "",
                      "wooded trails": "",
                      "water access": "",
                      "open space": "",
                    };
                    const features = venue.dog_features ?? [];
                    return (
                      <div
                        key={venue.id}
                        className="rounded-xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-4 transition-colors hover:bg-[var(--pawls-cream-50)]"
                      >
                        <div className="mb-2 flex items-start justify-between">
                          <div>
                            <h3 className="font-bold text-gray-900">
                              {typeEmoji[venue.type] ?? ""} {venue.name}
                            </h3>
                            <p className="text-xs text-gray-500">{venue.city} · {venue.distance_km} km away</p>
                          </div>
                          <span className="rounded-full bg-[var(--pawls-cream-100)] px-2 py-0.5 text-xs font-semibold text-[var(--pawls-gold-500)]">
                             {venue.rating.toFixed(1)}
                          </span>
                        </div>
                        {features.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-1">
                            {features.slice(0, 3).map((f) => (
                              <span
                                key={f}
                                className="inline-flex items-center gap-0.5 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-[var(--pawls-gold-500)]"
                              >
                                {featureEmojiMap[f] ?? ""} {f}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-xs italic text-[var(--pawls-terracotta-500)]">
                          Perfect for a first playdate!
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 text-center text-sm text-gray-400">
                  No venues found in between — check the full map!
                </p>
              )}

              <div className="mt-5 flex flex-col gap-2">
                <Link
                  to="/venues"
                  className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
                >
                   View all venues on map
                </Link>
                {/* ── Messaging buttons ── */}
                {matchOverlay.matchId ? (
                  isPlus ? (
                    <Link
                      to="/match/messages/$matchId"
                      params={{ matchId: String(matchOverlay.matchId) }}
                      className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-colors hover:bg-emerald-700"
                    >
                       Send a message!
                    </Link>
                  ) : (
                    <Link
                      to="/plus"
                      className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-gradient-to-r from-[var(--pawls-gold-400)] to-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[var(--pawls-cream-50)]0/25 transition-all hover:from-[var(--pawls-cream-50)]0 hover:to-[var(--pawls-terracotta-700)]"
                    >
                       Unlock messaging with Plus
                    </Link>
                  )
                ) : null}
                {/* ── Referral invite CTA ── */}
                <Link
                  to="/invite"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[var(--pawls-cream-100)] to-[var(--pawls-cream-50)] px-6 py-2.5 text-sm font-semibold text-[var(--pawls-terracotta-500)] transition-all hover:from-[var(--pawls-cream-200)] hover:to-[var(--pawls-cream-100)] hover:shadow-md border border-[var(--pawls-cream-200)]"
                >
                   Bring your other dog friends to Pawls → get a free month of Plus
                </Link>
                <button
                  onClick={() => {
                    setMatchOverlay(null);
                    setPlaydateStep(null);
                    setPlaydateVenues([]);
                    setMatchedTargetId(null);
                    setCurrentIndex((i) => i + 1);
                  }}
                  className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-50"
                >
                  Continue swiping →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progress indicator */}
      <p className="mb-4 text-sm text-gray-400">
        {currentIndex + 1} of {profiles.length}
      </p>

      {/* Card */}
      <div
        className={`w-full max-w-sm transition-transform duration-300 ${
          swiping === "left"
            ? "-translate-x-[120%] rotate-[-12deg] opacity-0"
            : swiping === "right"
              ? "translate-x-[120%] rotate-[12deg] opacity-0"
              : ""
        }`}
      >
        <div className="overflow-hidden rounded-2xl border border-[var(--pawls-cream-100)] bg-white shadow-lg">
          {/* Photo */}
          <div className="relative flex h-56 items-center justify-center overflow-hidden bg-gradient-to-br from-[var(--pawls-cream-100)] to-[var(--pawls-cream-50)]">
            <img
              src={`/dogs/${current.dog_name.toLowerCase()}.jpg`}
              alt={current.dog_name}
              className="h-full w-full object-cover"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.style.display = "none";
                const fallback = img.parentElement?.querySelector(".emoji-fallback");
                if (fallback) fallback.classList.remove("hidden");
              }}
            />
            <span className="emoji-fallback hidden text-8xl">
              {sizeEmoji[current.size] ?? ""}
            </span>
          </div>

          {/* Dog info */}
          <div className="p-5">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {current.dog_name}
                </h2>
                <p className="text-sm text-gray-500">{current.breed}</p>
              </div>
              <span className="text-2xl font-bold text-[var(--pawls-terracotta-500)]">
                {current.age}y
              </span>
            </div>

            {/* Plus Member badge */}
            {isPlus && (
              <div className="mb-3">
                <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[var(--pawls-gold-400)] to-[var(--pawls-terracotta-500)] px-3 py-1 text-xs font-semibold text-white shadow-sm">
                   Plus Member
                </span>
              </div>
            )}

            {/* Badges */}
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pawls-cream-50)] px-2.5 py-1 text-xs font-medium text-[var(--pawls-gold-500)]">
                {sizeEmoji[current.size]} {sizeLabel[current.size] ?? current.size}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${energyCfg.bg} ${energyCfg.text}`}
              >
                {energyCfg.label}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                {current.temperament}
              </span>
            </div>

            {/* Location */}
            <p className="mb-2 text-sm text-gray-500"> {current.location}</p>

            {/* Bio */}
            {current.bio && (
              <p className="mt-2 text-sm leading-relaxed text-gray-700">
                {current.bio}
              </p>
            )}

            {/* Owner */}
            <p className="mt-3 text-xs text-gray-400">
              Owner: {current.owner_name}
            </p>

            {/* Social Media Links — Plus-gated */}
            {(current.instagram || current.tiktok || current.twitter || current.youtube) && (
              <div className="mt-3 border-t border-[var(--pawls-cream-100)] pt-3">
                <p className="mb-2 text-xs font-semibold text-gray-500"> Social Media</p>
                {isPlus ? (
                  <div className="flex items-center gap-3">
                    {current.instagram && (
                      <a
                        href={current.instagram.startsWith("http") ? current.instagram : `https://${current.instagram}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-pink-400 to-purple-500 text-lg text-white shadow-sm transition-transform hover:scale-110"
                        title="Instagram"
                      >
                        
                      </a>
                    )}
                    {current.tiktok && (
                      <a
                        href={current.tiktok.startsWith("http") ? current.tiktok : `https://${current.tiktok}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-lg text-white shadow-sm transition-transform hover:scale-110"
                        title="TikTok"
                      >
                        
                      </a>
                    )}
                    {current.twitter && (
                      <a
                        href={current.twitter.startsWith("http") ? current.twitter : `https://${current.twitter}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-400 text-lg text-white shadow-sm transition-transform hover:scale-110"
                        title="Twitter"
                      >
                        
                      </a>
                    )}
                    {current.youtube && (
                      <a
                        href={current.youtube.startsWith("http") ? current.youtube : `https://${current.youtube}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-lg text-white shadow-sm transition-transform hover:scale-110"
                        title="YouTube"
                      >
                        ▶
                      </a>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-3 opacity-40">
                      {current.instagram && (
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-300 text-lg text-white">
                          
                        </span>
                      )}
                      {current.tiktok && (
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-300 text-lg text-white">
                          
                        </span>
                      )}
                      {current.twitter && (
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-300 text-lg text-white">
                          
                        </span>
                      )}
                      {current.youtube && (
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-300 text-lg text-white">
                          ▶
                        </span>
                      )}
                    </div>
                    <Link
                      to="/plus"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--pawls-terracotta-500)] transition-colors hover:text-[var(--pawls-terracotta-700)]"
                    >
                       Upgrade to Plus to connect on social media
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-8 flex items-center gap-8">
        <button
          onClick={() => handleSwipe("left")}
          disabled={swiping !== null}
          className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-300 bg-white text-3xl text-red-400 shadow-md transition-all hover:scale-110 hover:border-red-400 hover:bg-red-50 hover:shadow-lg disabled:pointer-events-none disabled:opacity-50"
          aria-label="Pass"
        >
          
        </button>
        <button
          onClick={() => handleSwipe("right")}
          disabled={swiping !== null}
          className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-300 bg-white text-3xl text-emerald-400 shadow-md transition-all hover:scale-110 hover:border-emerald-400 hover:bg-emerald-50 hover:shadow-lg disabled:pointer-events-none disabled:opacity-50"
          aria-label="Like"
        >
          
        </button>
      </div>

      {/* Navigation hint */}
      <div className="mt-4 flex gap-4 text-sm">
        <Link
          to="/match/matches"
          className="text-gray-400 transition-colors hover:text-[var(--pawls-terracotta-500)]"
        >
          View matches →
        </Link>
      </div>
    </section>
  );
}
