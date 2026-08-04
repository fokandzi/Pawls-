import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { sql } from "../db";
import { createConnectTables } from "../db/schema";
import { withTimeout } from "../lib/timeout";
import { EmptyState } from "../lib/empty-state";

// ── Types ────────────────────────────────────────────────────────────────────

type Group = {
  id: number;
  name: string;
  description: string;
  location: string;
  category: string;
  member_count: number;
  image_url: string | null;
};

type Event = {
  id: number;
  group_id: number;
  group_name: string;
  title: string;
  description: string;
  location: string;
  event_date: string;
  start_time: string;
  attendee_count: number;
  image_url: string | null;
};

// ── Seed data ────────────────────────────────────────────────────────────────

type GroupSeed = {
  name: string;
  description: string;
  location: string;
  category: string;
  member_count: number;
  events: {
    title: string;
    description: string;
    location: string;
    event_date: string;
    start_time: string;
    attendee_count: number;
  }[];
};

const seedGroups: GroupSeed[] = [
  {
    name: "Paris Dog Walkers",
    description:
      "The largest dog community in Paris! We organise weekly walks through Paris's most beautiful parks, café meetups, and seasonal parties for dogs and their humans. All breeds and sizes are welcome — from Chihuahuas to Great Danes.",
    location: "Paris",
    category: "social",
    member_count: 234,
    events: [
      {
        title: "Bois de Vincennes Sunday Stroll",
        description:
          "Our classic Sunday morning walk through the Bois de Vincennes. Meet at the Lac Daumesnil at 10am. Coffee and dog treats provided! Off-leash in the designated dog areas after the group walk.",
        location: "Bois de Vincennes, Paris 12e",
        event_date: "2026-08-02",
        start_time: "10:00",
        attendee_count: 34,
      },
      {
        title: "Seine-Side Doggy Apéro",
        description:
          "Evening social for dog owners at a dog-friendly terrace along the Canal Saint-Martin. First drink on us for new members!",
        location: "Quai de Valmy, Paris 10e",
        event_date: "2026-08-15",
        start_time: "18:00",
        attendee_count: 22,
      },
    ],
  },
  {
    name: "Puppy Social Paris",
    description:
      "Dedicated to puppies under 12 months — a safe, supervised environment for socialization. We partner with a local trainer who runs the sessions and offers tips on puppy development, bite inhibition, and basic commands.",
    location: "Paris",
    category: "playgroup",
    member_count: 156,
    events: [
      {
        title: "Puppy Socialisation Hour",
        description:
          "Structured play session for puppies aged 3–12 months. Small groups, fully supervised by a certified trainer. Vaccination records required — please bring proof!",
        location: "Parc Montsouris Dog Area, Paris 14e",
        event_date: "2026-08-01",
        start_time: "09:30",
        attendee_count: 12,
      },
    ],
  },
  {
    name: "Paris Hiking Hounds",
    description:
      "For dogs who love the outdoors as much as their owners! We do monthly hikes in the countryside around Paris — from the Forêt de Fontainebleau to the hills of the Vallée de Chevreuse. Medium to large dogs preferred due to trail difficulty.",
    location: "Île-de-France",
    category: "outdoor",
    member_count: 189,
    events: [
      {
        title: "Fontainebleau Forest Trail",
        description:
          "A 12 km loop through the legendary Forêt de Fontainebleau. Moderate difficulty — some rocky sections. Bring water for you and your pup! Meeting point: Gare de Fontainebleau-Avon at 8am for carpooling.",
        location: "Forêt de Fontainebleau",
        event_date: "2026-08-08",
        start_time: "08:00",
        attendee_count: 28,
      },
    ],
  },
  {
    name: "Corgi Club Paris",
    description:
      "A community for Corgi lovers in the Paris region. Monthly meetups at Paris parks, breed-specific advice, and plenty of short-legged camaraderie. All corgis welcome — Pembrokes, Cardigans, and mixes!",
    location: "Paris",
    category: "breed-specific",
    member_count: 98,
    events: [
      {
        title: "Corgi Coffee Morning",
        description:
          "Bring your corgi to this dog-friendly café in the Marais for a relaxed morning meetup. Special playpen area set up. Cappuccino for you, puppuccino for them!",
        location: "Le Café des Chiens, Paris 11e",
        event_date: "2026-08-05",
        start_time: "10:30",
        attendee_count: 16,
      },
    ],
  },
  {
    name: "Agility Paris Club",
    description:
      "The Île-de-France region's premier dog agility community. We run weekly training sessions at various locations and host quarterly competitions. All skill levels welcome — from complete beginners to national champions. Equipment provided.",
    location: "Multiple locations",
    category: "sport",
    member_count: 312,
    events: [
      {
        title: "Beginner Agility Workshop",
        description:
          "Never tried agility? This is your chance! 2-hour workshop covering tunnels, jumps, and weave poles. Dogs must be at least 1 year old. Led by national-level competitor Camille Dubois.",
        location: "Centre Canin de Vincennes",
        event_date: "2026-08-09",
        start_time: "13:00",
        attendee_count: 20,
      },
      {
        title: "Summer Agility Competition",
        description:
          "Our quarterly club competition — three courses (novice, intermediate, advanced). Rosettes for top 3 in each category. Spectators welcome! Entry €5 per dog, free for club members.",
        location: "Parc des Sports, Saint-Cloud",
        event_date: "2026-08-22",
        start_time: "09:00",
        attendee_count: 45,
      },
    ],
  },
  {
    name: "Golden Hour Paris",
    description:
      "A photography-meets-dogs walking group! We meet at golden hour (sunrise or sunset) at photogenic spots around Paris. Professional and hobbyist photographers welcome — or just come for the walk. Great photos of your dog guaranteed with the Eiffel Tower or Sacré-Cœur as backdrop!",
    location: "Paris",
    category: "walking",
    member_count: 145,
    events: [
      {
        title: "Sunset Shoot at Buttes-Chaumont",
        description:
          "Golden hour walk and photoshoot at the Parc des Buttes-Chaumont. Bring your camera or just your phone — we'll help you get that perfect shot of your dog with the temple and Paris skyline in golden light. Meeting at the main entrance at 19:30.",
        location: "Parc des Buttes-Chaumont, Paris 19e",
        event_date: "2026-08-03",
        start_time: "19:30",
        attendee_count: 19,
      },
    ],
  },
  {
    name: "Berner Club Paris",
    description:
      "For lovers of the Bernese Mountain Dog in the Île-de-France region. We organise breed walks, health seminars, and social events. A supportive community for both experienced Berner owners and those considering the breed.",
    location: "Île-de-France",
    category: "breed-specific",
    member_count: 67,
    events: [
      {
        title: "Berner Walk & BBQ",
        description:
          "Annual summer Berner gathering! A gentle 5 km walk suitable for Berners of all ages through the Parc de Saint-Cloud, followed by a BBQ. Great opportunity to connect with other Berner families.",
        location: "Parc de Saint-Cloud",
        event_date: "2026-08-16",
        start_time: "11:00",
        attendee_count: 31,
      },
    ],
  },
  {
    name: "Rescue Dog Support Paris",
    description:
      "A community for adopters of rescue dogs — whether from France or abroad. Share experiences, get training advice, and meet other rescue dog parents who understand the unique joys and challenges. Non-judgmental, 100% supportive.",
    location: "Multiple locations",
    category: "support",
    member_count: 423,
    events: [
      {
        title: "Reactive Dog Pack Walk",
        description:
          "A structured, trainer-led walk for dogs who struggle with reactivity. Strict protocols: spaced walking, no on-leash greetings, muzzle-friendly. A safe space to practice calm behaviour. Led by certified behaviourist Marie Laurent.",
        location: "Parc de Bercy, Paris 12e",
        event_date: "2026-08-07",
        start_time: "09:00",
        attendee_count: 10,
      },
      {
        title: "Rescue Dog Picnic",
        description:
          "Casual picnic meetup for rescue dog families. No pressure, no judgment — just good company. Bring a blanket, snacks, and your rescue pup. Fenced area so dogs can be off-leash if comfortable.",
        location: "Jardin du Luxembourg, Paris 6e",
        event_date: "2026-08-20",
        start_time: "12:00",
        attendee_count: 25,
      },
    ],
  },
];

// ── Category config ──────────────────────────────────────────────────────────

const categoryConfig: Record<string, { label: string; emoji: string; bg: string; text: string }> = {
  social: { label: "Social", emoji: "", bg: "bg-pink-100", text: "text-pink-700" },
  playgroup: { label: "Playgroup", emoji: "", bg: "bg-emerald-100", text: "text-emerald-700" },
  outdoor: { label: "Outdoor", emoji: "", bg: "bg-green-100", text: "text-green-700" },
  sport: { label: "Sport", emoji: "", bg: "bg-orange-100", text: "text-orange-700" },
  walking: { label: "Walking", emoji: "", bg: "bg-sky-100", text: "text-sky-700" },
  "breed-specific": { label: "Breed", emoji: "", bg: "bg-purple-100", text: "text-purple-700" },
  support: { label: "Support", emoji: "", bg: "bg-blue-100", text: "text-blue-700" },
};

// ── Server functions ─────────────────────────────────────────────────────────

const getConnectData = createServerFn({ method: "POST" }).handler(async () => {
  await createConnectTables();

  // Auto-seed if no groups exist
  const [groupCount] = await sql()`SELECT COUNT(*)::int AS count FROM connect_groups`;
  if (Number(groupCount.count) === 0) {
    for (const g of seedGroups) {
      const [group] = await sql()`
        INSERT INTO connect_groups (name, description, location, category, member_count)
        VALUES (${g.name}, ${g.description}, ${g.location}, ${g.category}, ${g.member_count})
        RETURNING id
      `;
      if (group) {
        for (const e of g.events) {
          await sql()`
            INSERT INTO events (group_id, title, description, location, event_date, start_time, attendee_count)
            VALUES (${group.id}, ${e.title}, ${e.description}, ${e.location}, ${e.event_date}, ${e.start_time}, ${e.attendee_count})
          `;
        }
      }
    }
  }

  const groups = (await sql()`
    SELECT id, name, description, location, category, member_count, image_url
    FROM connect_groups
    ORDER BY member_count DESC
  `) as Group[];

  const events = (await sql()`
    SELECT e.id, e.group_id, g.name AS group_name, e.title, e.description, e.location,
           e.event_date::text, e.start_time::text, e.attendee_count, e.image_url
    FROM events e
    JOIN connect_groups g ON e.group_id = g.id
    ORDER BY e.event_date ASC, e.start_time ASC
  `) as Event[];

  return { groups, events };
});

// ── Route definition ─────────────────────────────────────────────────────────

import { seoHead, SEO } from "../lib/seo";

export const Route = createFileRoute("/connect")({
  head: () => seoHead(SEO.connect),
  loader: () => withTimeout(getConnectData(), 8000, "Community data").catch(() => ({ groups: [], events: [], error: "Could not load community data" })),
  component: ConnectPage,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h, 10);
  const minute = m;
  if (hour === 0) return `12:${minute} AM`;
  if (hour < 12) return `${hour}:${minute} AM`;
  if (hour === 12) return `12:${minute} PM`;
  return `${hour - 12}:${minute} PM`;
}

// ── Component ────────────────────────────────────────────────────────────────

function ConnectPage() {
  const data = Route.useLoaderData();
  const routerState = useRouterState();
  const isExactConnect = routerState.location.pathname === "/connect";

  const [activeTab, setActiveTab] = useState<"groups" | "events">("groups");

  // Handle loading/error states at render
  const groups: Group[] = (data as any)?.groups ?? [];
  const events: Event[] = (data as any)?.events ?? [];
  const dataError = (data as any)?.error as string | undefined;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <AppHeader active="connect" />

      {isExactConnect ? (
        <>
          {/* Hero */}
          <section className="bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 pb-12 pt-8 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Connect with Dog People
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-base text-gray-600">
              Join local groups, find events, and build a community around your best friend. From puppy playdates to breed-specific clubs — there's a pack for everyone.
            </p>
          </section>

          {/* Tab switcher */}
          <div className="mx-auto mb-8 flex max-w-6xl items-center justify-center gap-2 px-6">
            <button
              onClick={() => setActiveTab("groups")}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                activeTab === "groups"
                  ? "bg-[var(--pawls-terracotta-500)] text-white shadow-md"
                  : "bg-[var(--pawls-cream-50)] text-gray-600 hover:bg-[var(--pawls-cream-100)]"
              }`}
            >
               Groups
            </button>
            <button
              onClick={() => setActiveTab("events")}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                activeTab === "events"
                  ? "bg-[var(--pawls-terracotta-500)] text-white shadow-md"
                  : "bg-[var(--pawls-cream-50)] text-gray-600 hover:bg-[var(--pawls-cream-100)]"
              }`}
            >
               Events
            </button>
          </div>

          {/* Groups Tab */}
          {activeTab === "groups" && (
            <section className="mx-auto max-w-6xl px-6 pb-20">
              {dataError ? (
                <EmptyState emoji="" title="Could not load community" description={dataError} />
              ) : groups.length === 0 ? (
                <EmptyState emoji="" title="No groups yet" description="Groups are being set up. Check back soon!" />
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {groups.map((g) => {
                    const cat = categoryConfig[g.category] ?? {
                      label: g.category,
                      emoji: "",
                      bg: "bg-gray-100",
                      text: "text-gray-600",
                    };
                    // Find events for this group
                    const groupEvents = events.filter((e) => e.group_id === g.id);

                    return (
                      <div
                        key={g.id}
                        className="group overflow-hidden rounded-2xl border border-[var(--pawls-cream-100)] bg-white shadow-sm transition-shadow hover:shadow-lg"
                      >
                        {/* Banner */}
                        <div className="flex h-32 items-center justify-center bg-gradient-to-br from-[var(--pawls-cream-100)] to-[var(--pawls-cream-50)]">
                          <span className="text-5xl">{cat.emoji}</span>
                        </div>

                        {/* Content */}
                        <div className="p-5">
                          <div className="mb-3 flex items-start justify-between gap-2">
                            <h3 className="text-lg font-bold text-gray-900">{g.name}</h3>
                            <span
                              className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cat.bg} ${cat.text}`}
                            >
                              {cat.label}
                            </span>
                          </div>

                          <p className="mb-3 text-sm leading-relaxed text-gray-600 line-clamp-3">
                            {g.description}
                          </p>

                          <div className="mb-3 flex items-center gap-4 text-xs text-gray-500">
                            <span> {g.location}</span>
                            <span> {g.member_count} members</span>
                          </div>

                          {/* Upcoming events for this group */}
                          {groupEvents.length > 0 && (
                            <div className="rounded-lg bg-[var(--pawls-cream-50)] p-3">
                              <p className="mb-2 text-xs font-semibold text-[var(--pawls-terracotta-500)]">
                                 Upcoming
                              </p>
                              {groupEvents.slice(0, 2).map((ev) => (
                                <div key={ev.id} className="mb-1 text-xs text-gray-600">
                                  <span className="font-medium">{ev.title}</span> —{" "}
                                  {formatDate(ev.event_date)} at {formatTime(ev.start_time)}
                                  <span className="ml-1 text-gray-400">
                                    ({ev.attendee_count} going)
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Events Tab */}
          {activeTab === "events" && (
            <section className="mx-auto max-w-6xl px-6 pb-20">
              {dataError ? (
                <EmptyState emoji="" title="Could not load community" description={dataError} />
              ) : events.length === 0 ? (
                <div className="py-20 text-center">
                  <span className="text-5xl"></span>
                  <h2 className="mt-4 text-xl font-bold text-gray-900">No events yet</h2>
                  <p className="mt-2 text-gray-600">Events are being planned. Check back soon!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {events.map((ev) => {
                    const group = groups.find((g) => g.id === ev.group_id);
                    const cat = group
                      ? categoryConfig[group.category] ?? {
                          label: group.category,
                          emoji: "",
                          bg: "bg-gray-100",
                          text: "text-gray-600",
                        }
                      : { label: "", emoji: "", bg: "bg-gray-100", text: "text-gray-600" };

                    return (
                      <div
                        key={ev.id}
                        className="overflow-hidden rounded-xl border border-[var(--pawls-cream-100)] bg-white shadow-sm transition-shadow hover:shadow-md"
                      >
                        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                          {/* Date badge */}
                          <div className="flex shrink-0 flex-col items-center rounded-xl bg-[var(--pawls-terracotta-500)] px-4 py-3 text-white sm:w-20">
                            <span className="text-xs font-semibold uppercase opacity-80">
                              {new Date(ev.event_date).toLocaleDateString("en-GB", {
                                month: "short",
                              })}
                            </span>
                            <span className="text-2xl font-extrabold leading-tight">
                              {new Date(ev.event_date).getDate()}
                            </span>
                            <span className="text-xs opacity-80">
                              {formatTime(ev.start_time)}
                            </span>
                          </div>

                          {/* Event details */}
                          <div className="flex-1 min-w-0">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-bold text-gray-900">{ev.title}</h3>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cat.bg} ${cat.text}`}
                              >
                                {cat.emoji} {cat.label}
                              </span>
                            </div>
                            <p className="mb-2 text-sm text-gray-600">
                              Hosted by <span className="font-medium text-[var(--pawls-terracotta-500)]">{ev.group_name}</span>
                            </p>
                            <p className="mb-3 text-sm leading-relaxed text-gray-600 line-clamp-2">
                              {ev.description}
                            </p>
                            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                              <span> {ev.location}</span>
                              <span> {ev.attendee_count} attending</span>
                            </div>
                          </div>

                          {/* CTA */}
                          <div className="shrink-0">
                            <button className="rounded-full bg-[var(--pawls-terracotta-500)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--pawls-terracotta-700)]">
                              Join Event
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </>
      ) : (
        <Outlet />
      )}

      {/* Footer */}
      <AppFooter />
    </div>
  );
}
