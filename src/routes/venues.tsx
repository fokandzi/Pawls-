import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { sql } from "../db";
import { createVenuesTable } from "../db/schema";
import { EmptyState } from "../lib/empty-state";

// ── Types ────────────────────────────────────────────────────────────────────

type Venue = {
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
  image_url: string | null;
};

// ── Seed data ────────────────────────────────────────────────────────────────

const seedVenues = [
  {
    name: "Bois de Vincennes",
    type: "park",
    address: "Route de la Pyramide, 75012 Paris",
    city: "Paris",
    lat: 48.8288,
    lng: 2.4324,
    description: "Paris's largest park — over 995 hectares of woodland, lakes, and open fields. Features a huge off-leash dog area and dedicated dog-friendly zones. A true paradise for dogs who love to explore and swim.",
    dog_features: ["off-leash area", "swimming", "wooded trails", "open space", "walking paths"],
    rating: 4.9,
  },
  {
    name: "Bois de Boulogne",
    type: "park",
    address: "Bois de Boulogne, 75016 Paris",
    city: "Paris",
    lat: 48.8647,
    lng: 2.2513,
    description: "The second-largest park in Paris with endless walking trails and the beautiful Lac Inférieur. Dogs love the wooded paths and open meadows. Several off-leash areas and dog-friendly zones throughout the park.",
    dog_features: ["off-leash area", "wooded trails", "walking paths", "swimming"],
    rating: 4.8,
  },
  {
    name: "Parc des Buttes-Chaumont",
    type: "park",
    address: "1 Rue Botzaris, 75019 Paris",
    city: "Paris",
    lat: 48.8807,
    lng: 2.3834,
    description: "One of Paris's most beautiful parks with dramatic cliffs, a temple-topped island, and a waterfall. Dogs are welcome on-leash and there's a popular off-leash section near the north entrance. A stunning setting for walks.",
    dog_features: ["off-leash area", "walking paths", "fenced sections", "water access"],
    rating: 4.7,
  },
  {
    name: "Parc Montsouris",
    type: "park",
    address: "2 Rue Gazan, 75014 Paris",
    city: "Paris",
    lat: 48.8229,
    lng: 2.3370,
    description: "A serene English-style park in the 14th arrondissement with a lake, waterfalls, and wide lawns. Dogs are allowed on-leash and there's a designated off-leash area. Popular with local dog owners for morning walks.",
    dog_features: ["off-leash area", "walking paths", "water access", "open space"],
    rating: 4.6,
  },
  {
    name: "Jardin du Luxembourg",
    type: "park",
    address: "Rue de Médicis, 75006 Paris",
    city: "Paris",
    lat: 48.8462,
    lng: 2.3371,
    description: "The iconic Luxembourg Gardens — dogs are allowed on-leash in the outer paths and there's a small dog-friendly area near the Observatoire entrance. Stunning setting for a refined Parisian stroll with your pup.",
    dog_features: ["walking paths", "fenced", "water access"],
    rating: 4.5,
  },
  {
    name: "Café de Flore",
    type: "cafe",
    address: "172 Boulevard Saint-Germain, 75006 Paris",
    city: "Paris",
    lat: 48.8540,
    lng: 2.3326,
    description: "Legendary Saint-Germain-des-Prés café with a dog-friendly terrace. Dogs are warmly welcomed with water bowls at the outdoor tables. Perfect for people-watching with your four-legged friend in true Parisian style.",
    dog_features: ["water bowls", "outdoor seating", "dog treats"],
    rating: 4.6,
  },
  {
    name: "Le Comptoir Général",
    type: "cafe",
    address: "80 Quai de Jemmapes, 75010 Paris",
    city: "Paris",
    lat: 48.8717,
    lng: 2.3658,
    description: "Eclectic riverside café-bar along the Canal Saint-Martin with a sprawling dog-friendly terrace. Dogs are celebrated here — expect water bowls, treats, and plenty of attention from the artsy crowd. Great for weekend brunch.",
    dog_features: ["water bowls", "dog treats", "outdoor seating", "indoor seating"],
    rating: 4.5,
  },
  {
    name: "Café Oberkampf",
    type: "cafe",
    address: "104 Rue Oberkampf, 75011 Paris",
    city: "Paris",
    lat: 48.8653,
    lng: 2.3765,
    description: "Trendy, laid-back café in the lively Oberkampf neighbourhood. Super dog-friendly with a dedicated 'dog corner' inside and a sunny terrace. Staff bring water and homemade dog biscuits. Regular neighbourhood dog meet-ups.",
    dog_features: ["water bowls", "dog treats", "indoor seating", "outdoor seating"],
    rating: 4.7,
  },
  {
    name: "Le Café des Chiens",
    type: "cafe",
    address: "19 Rue Jean-Pierre Timbaud, 75011 Paris",
    city: "Paris",
    lat: 48.8650,
    lng: 2.3705,
    description: "Paris's premier dedicated dog café in the 11e! A fully indoor-outdoor space designed for dogs and their humans. Features a secure indoor play area, homemade dog cakes, and a boutique. Puppy socials every Saturday morning.",
    dog_features: ["indoor seating", "dog treats", "fenced", "dog menu", "outdoor seating"],
    rating: 4.8,
  },
  {
    name: "Le Dernier Bar",
    type: "bar",
    address: "45 Rue de Lourmel, 75015 Paris",
    city: "Paris",
    lat: 48.8471,
    lng: 2.2862,
    description: "Beloved neighbourhood bar in the 15e with a famously dog-welcoming attitude. The owners have two resident dogs and every canine visitor gets a warm welcome. Great craft cocktails and a perfect post-park pit stop.",
    dog_features: ["water bowls", "dog treats", "indoor seating", "outdoor seating"],
    rating: 4.5,
  },
  {
    name: "Forêt de Fontainebleau",
    type: "trail",
    address: "Forêt de Fontainebleau, 77300 Fontainebleau",
    city: "Fontainebleau",
    lat: 48.4020,
    lng: 2.7014,
    description: "A magnificent 25,000-hectare forest just 45 minutes from Paris. Endless trails through ancient woods, sandstone boulders, and hidden clearings. Dogs can be off-leash in most areas — a true adventure paradise for outdoor-loving pups.",
    dog_features: ["off-leash area", "wooded trails", "open space", "walking paths", "swimming"],
    rating: 4.9,
  },
  {
    name: "Parc de Saint-Cloud",
    type: "park",
    address: "1 Avenue de la Grille d'Honneur, 92210 Saint-Cloud",
    city: "Saint-Cloud",
    lat: 48.8380,
    lng: 2.1890,
    description: "A stunning national domain just west of Paris with manicured gardens, wild woods, and breathtaking views over the Seine. Dogs are welcome on-leash throughout and there are designated off-leash zones. A royal experience for you and your dog.",
    dog_features: ["off-leash area", "walking paths", "wooded trails", "open space"],
    rating: 4.7,
  },
];

// ── Type config ──────────────────────────────────────────────────────────────

const typeConfig: Record<string, { label: string; emoji: string; bg: string; text: string; border: string }> = {
  cafe: { label: "Café", emoji: "", bg: "bg-[var(--pawls-cream-100)]", text: "text-[var(--pawls-gold-500)]", border: "border-amber-300" },
  park: { label: "Park", emoji: "", bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-300" },
  beach: { label: "Beach", emoji: "", bg: "bg-sky-100", text: "text-sky-700", border: "border-sky-300" },
  trail: { label: "Trail", emoji: "", bg: "bg-green-100", text: "text-green-700", border: "border-green-300" },
  bar: { label: "Bar", emoji: "", bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-300" },
};

const featureEmoji: Record<string, string> = {
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

// ── Server functions ─────────────────────────────────────────────────────────

const getVenues = createServerFn({ method: "POST" }).handler(async () => {
  try {
    await createVenuesTable();

    // Auto-seed if empty
    const [countRow] = await sql()`SELECT COUNT(*)::int AS count FROM venues`;
    if (Number(countRow.count) === 0) {
      for (const v of seedVenues) {
        await sql()`
          INSERT INTO venues (name, type, address, city, lat, lng, description, dog_features, rating)
          VALUES (${v.name}, ${v.type}, ${v.address}, ${v.city}, ${v.lat}, ${v.lng}, ${v.description}, ${v.dog_features}, ${v.rating})
        `;
      }
    }

    const rows = await sql()`
      SELECT id, name, type, address, city, lat, lng, description, dog_features, rating, image_url
      FROM venues
      ORDER BY 
        CASE type WHEN 'park' THEN 1 WHEN 'beach' THEN 2 WHEN 'trail' THEN 3 WHEN 'cafe' THEN 4 WHEN 'bar' THEN 5 ELSE 6 END,
        rating DESC
    `;
    return { venues: rows as Venue[], error: null };
  } catch {
    return { venues: null, error: "Database not connected" };
  }
});

// ── Route ────────────────────────────────────────────────────────────────────

import { seoHead, SEO } from "../lib/seo";

export const Route = createFileRoute("/venues")({
  head: () => seoHead(SEO.venues),
  loader: () => getVenues(),
  component: VenuesPage,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderStars(rating: number) {
  const full = Math.floor(rating);
  const stars = [];
  for (let i = 0; i < full; i++) stars.push("");
  if (rating - full >= 0.5) stars.push("");
  return stars.join("");
}

// ── Component ────────────────────────────────────────────────────────────────

function VenuesPage() {
  const data = Route.useLoaderData();
  const venues: Venue[] = (data as any)?.venues ?? [];
  const error = (data as any)?.error ?? null;

  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  const cities = [...new Set(venues.map((v) => v.city))].sort();
  const types = [...new Set(venues.map((v) => v.type))].sort();

  const filteredVenues = venues.filter((v) => {
    if (typeFilter && v.type !== typeFilter) return false;
    if (cityFilter && v.city !== cityFilter) return false;
    return true;
  });

  // Initialize Leaflet map (client-only)
  useEffect(() => {
    if (typeof window === "undefined" || !mapRef.current) return;
    if (mapInstanceRef.current) {
      // Already initialized — update markers
      return;
    }

    const L = (window as any).L;
    if (!L) return;

    const map = L.map(mapRef.current).setView([48.8566, 2.3522], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Sync markers with filtered venues
  useEffect(() => {
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;

    // Clear existing markers
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    if (filteredVenues.length === 0) return;

    const bounds = L.latLngBounds();

    filteredVenues.forEach((v) => {
      const cfg = typeConfig[v.type] ?? { label: v.type, emoji: "", bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-300" };
      const marker = L.marker([v.lat, v.lng])
        .addTo(map)
        .bindPopup(
          `<div style="font-family:sans-serif;max-width:200px">
            <strong>${cfg.emoji} ${v.name}</strong><br/>
            <small>${cfg.label} · ${v.city}</small><br/>
            <small style="color:#f59e0b">${renderStars(v.rating)} ${Number(v.rating).toFixed(1)}</small>
          </div>`
        );
      markersRef.current.push(marker);
      bounds.extend([v.lat, v.lng]);
    });

    map.fitBounds(bounds, { padding: [30, 30] });
  }, [filteredVenues]);

  const scrollToVenue = (venue: Venue) => {
    const map = mapInstanceRef.current;
    if (map) {
      map.setView([venue.lat, venue.lng], 15, { animate: true });
      // Open popup
      setTimeout(() => {
        const marker = markersRef.current.find((m) => {
          const pos = m.getLatLng();
          return pos.lat === venue.lat && pos.lng === venue.lng;
        });
        if (marker) marker.openPopup();
      }, 300);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <AppHeader active="venues" />

      {/* Hero */}
      <section className="bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 pb-12 pt-8 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
          Dog-Friendly Places Near You 
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-base text-gray-600">
          Discover parks, cafés, beaches, and trails that welcome your four-legged friend with open paws.
        </p>
      </section>

      {error || !venues || venues.length === 0 ? (
        <section className="bg-white px-6 pb-20">
          <div className="mx-auto max-w-6xl">
            <EmptyState
              title="No venues available yet"
              description="Check back soon to discover dog-friendly parks, cafés, beaches, and trails near you."
            />
          </div>
        </section>
      ) : (
        <>
          {/* Map */}
          <section className="bg-white px-6 pb-8">
            <div className="mx-auto max-w-6xl">
              <div
                ref={mapRef}
                className="h-[400px] w-full overflow-hidden rounded-2xl border border-[var(--pawls-cream-200)] shadow-md"
                style={{ zIndex: 1 }}
              />
            </div>
          </section>

          {/* Filters */}
          <section className="bg-white px-6 pb-8">
            <div className="mx-auto max-w-6xl">
              <div className="flex flex-wrap items-center gap-4">
                {/* Type filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Type</span>
                  <div className="flex flex-wrap gap-2">
                    {types.map((t) => {
                      const cfg = typeConfig[t] ?? { label: t, emoji: "" };
                      return (
                        <button
                          key={t}
                          onClick={() => setTypeFilter(typeFilter === t ? null : t)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                            typeFilter === t
                              ? "bg-[var(--pawls-terracotta-500)] text-white shadow-sm"
                              : "bg-[var(--pawls-cream-50)] text-gray-600 hover:bg-[var(--pawls-cream-100)]"
                          }`}
                        >
                          {cfg.emoji} {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* City filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">City</span>
                  <div className="flex flex-wrap gap-2">
                    {cities.map((c) => (
                      <button
                        key={c}
                        onClick={() => setCityFilter(cityFilter === c ? null : c)}
                        className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                          cityFilter === c
                            ? "bg-[var(--pawls-terracotta-500)] text-white shadow-sm"
                            : "bg-[var(--pawls-cream-50)] text-gray-600 hover:bg-[var(--pawls-cream-100)]"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Clear */}
                {(typeFilter || cityFilter) && (
                  <button
                    onClick={() => {
                      setTypeFilter(null);
                      setCityFilter(null);
                    }}
                    className="text-sm font-medium text-[var(--pawls-terracotta-500)] hover:text-[var(--pawls-terracotta-700)] underline underline-offset-2"
                  >
                    Clear filters
                  </button>
                )}
              </div>
              <p className="mt-3 text-sm text-gray-400">
                Showing {filteredVenues.length} of {venues.length} venues
              </p>
            </div>
          </section>

          {/* Venue cards */}
          <section className="bg-white px-6 pb-20">
            <div className="mx-auto max-w-6xl">
              {filteredVenues.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/50 px-6 py-16 text-center">
                  <span className="text-5xl"></span>
                  <h3 className="mt-4 text-xl font-bold text-gray-900">No venues match your filters</h3>
                  <p className="mt-2 text-gray-600">Try adjusting your filters to see more results.</p>
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredVenues.map((venue) => {
                    const cfg = typeConfig[venue.type] ?? {
                      label: venue.type,
                      emoji: "",
                      bg: "bg-gray-100",
                      text: "text-gray-600",
                      border: "border-gray-300",
                    };
                    const features = venue.dog_features ?? [];

                    return (
                      <div
                        key={venue.id}
                        onClick={() => scrollToVenue(venue)}
                        className="group cursor-pointer overflow-hidden rounded-2xl border border-[var(--pawls-cream-100)] bg-white shadow-sm transition-all hover:border-amber-300 hover:shadow-md"
                      >
                        {/* Card image */}
                        <div className="flex h-40 items-center justify-center bg-gradient-to-br from-[var(--pawls-cream-100)] to-[var(--pawls-cream-50)]">
                          <span className="text-6xl">{cfg.emoji}</span>
                        </div>

                        {/* Card content */}
                        <div className="p-5">
                          <div className="mb-3 flex items-start justify-between">
                            <div>
                              <h3 className="text-lg font-bold text-gray-900 group-hover:text-[var(--pawls-terracotta-500)] transition-colors">
                                {venue.name}
                              </h3>
                              <p className="text-xs text-gray-500">{venue.address}</p>
                            </div>
                          </div>

                          {/* Type badge + rating */}
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text} ${cfg.border}`}
                            >
                              {cfg.emoji} {cfg.label}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pawls-cream-50)] px-2 py-0.5 text-xs font-medium text-[var(--pawls-gold-500)]">
                               {venue.city}
                            </span>
                            <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--pawls-cream-50)]0">
                              {renderStars(venue.rating)} {Number(venue.rating).toFixed(1)}
                            </span>
                          </div>

                          {/* Description */}
                          {venue.description && (
                            <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-gray-600">
                              {venue.description}
                            </p>
                          )}

                          {/* Dog features */}
                          {features.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {features.map((f) => (
                                <span
                                  key={f}
                                  className="inline-flex items-center gap-1 rounded-full bg-[var(--pawls-cream-50)] px-2 py-0.5 text-xs font-medium text-[var(--pawls-gold-500)]"
                                >
                                  {featureEmoji[f] ?? ""} {f}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Click hint */}
                          <div className="mt-3 flex items-center gap-1 text-xs font-medium text-[var(--pawls-terracotta-500)] opacity-0 transition-opacity group-hover:opacity-100">
                            Click to view on map →
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* Footer */}
      <AppFooter />
    </div>
  );
}
