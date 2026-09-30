import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { sql } from "../db";
import { createBookingTables } from "../db/schema";

// ── Types ────────────────────────────────────────────────────────────────────

type Provider = {
  id: number;
  name: string;
  category: string;
  description: string;
  location: string;
  image_url: string | null;
  rating: number;
  review_count: number;
};

type Service = {
  id: number;
  name: string;
  price_cents: number;
  duration_minutes: number;
};

// ── Category config ──────────────────────────────────────────────────────────

const categoryConfig: Record<
  string,
  { label: string; bg: string; text: string; emoji: string }
> = {
  walker: { label: "Walker", bg: "bg-emerald-100", text: "text-emerald-700", emoji: "" },
  groomer: { label: "Groomer", bg: "bg-purple-100", text: "text-purple-700", emoji: "" },
  sitter: { label: "Sitter", bg: "bg-sky-100", text: "text-sky-700", emoji: "" },
  trainer: { label: "Trainer", bg: "bg-[var(--pawls-cream-100)]", text: "text-[var(--pawls-gold-500)]", emoji: "" },
  vet: { label: "Vet", bg: "bg-rose-100", text: "text-rose-700", emoji: "" },
};

function renderStars(rating: number) {
  const full = Math.floor(rating);
  const stars = [];
  for (let i = 0; i < full; i++) stars.push("");
  return stars.join("");
}

function formatEur(cents: number) {
  return `€${(cents / 100).toFixed(2)}`;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function maxDateStr() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}


// ── Route ────────────────────────────────────────────────────────────────────

import { seoHead, seoProvider } from "../lib/seo";

const getProviderDetail = createServerFn({ method: "GET" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null || !("providerId" in data)) throw new Error("providerId is required");
    const providerId = Number((data as { providerId: unknown }).providerId);
    if (!Number.isInteger(providerId) || providerId < 1) throw new Error("providerId must be a positive integer");
    return { providerId };
  })
  .handler(async ({ data, request }) => {
    try {
      await createBookingTables();
      // REAL-ONLY clause, identical to /book and to the /book/register counter
      // (src/lib/provider-core.ts): an unowned legacy "approved" row (or one
      // owned by a test account) is not public supply and has no bookable page.
      const [provider] = await sql()`SELECT p.id, p.name, p.category, p.description, p.location, p.image_url, p.rating, p.review_count FROM providers p JOIN users u ON u.id = p.owner_user_id WHERE p.id = ${data.providerId} AND p.is_demo = false AND p.approval_status = 'approved' AND p.owner_user_id IS NOT NULL AND u.is_test = false`;
      if (!provider) return { provider: null, services: [], error: "Provider not found" };
      const services = await sql()`SELECT id, name, price_cents, duration_minutes FROM services WHERE provider_id = ${data.providerId} ORDER BY name`;
      // The customer books ONE OF THEIR OWN DOGS (batch D1). The offer below is
      // convenience only: /api/bookings re-checks ownership server-side and
      // refuses a dog that is not on the caller's account.
      let dogs: { id: number; dog_name: string }[] = [];
      let signedIn = false;
      try {
        const { getSessionUser } = await import("../lib/auth/session");
        const user = request ? await getSessionUser(request) : null;
        if (user) {
          signedIn = true;
          dogs = (await sql()`SELECT id, dog_name FROM dog_profiles WHERE user_id = ${user.id} AND is_demo = false ORDER BY id LIMIT 20`) as unknown as { id: number; dog_name: string }[];
        }
      } catch { dogs = []; }
      return { provider: provider as Provider, services, dogs, signedIn, error: null };
    } catch { return { provider: null, services: [], dogs: [], signedIn: false, error: "Database not connected" }; }
  });

export const Route = createFileRoute("/book/$providerId")({
  head: ({ loaderData }) => {
    const d = loaderData as { provider: { name: string; category: string } | null };
    if (d?.provider) {
      return seoHead(seoProvider(d.provider.name, d.provider.category));
    }
    return seoHead({ title: "Provider — Pawls", description: "View dog service provider details on Pawls.", path: "/book" });
  },
  loader: ({ params }) => getProviderDetail({ data: { providerId: params.providerId } }),
  component: ProviderDetailPage,
});

// ── Component ────────────────────────────────────────────────────────────────

function ProviderDetailPage() {
  const { provider, services, dogs, signedIn, error } = Route.useLoaderData();
  const [bookingService, setBookingService] = useState<Service | null>(null);
  const [form, setForm] = useState({ customerName: "", customerEmail: "", date: "", time: "" });
  const [dogId, setDogId] = useState("");
  const [daySlots, setDaySlots] = useState<string[]>([]);
  const [availabilitySet, setAvailabilitySet] = useState<boolean | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [bookingResult, setBookingResult] = useState<{
    id: number; provider_name: string; service_name: string; date: string; time: string;
  } | null>(null);
  function openBooking(service: Service) {
    setBookingService(service);
    setForm({ customerName: "", customerEmail: "", date: "", time: "" });
    setDogId(dogs && dogs.length ? String(dogs[0].id) : "");
    setDaySlots([]);
    setAvailabilitySet(null);
    setFormError("");
    setBookingResult(null);
    setSubmitting(false);
  }
  function closeBooking() {
    setBookingService(null);
    setFormError("");
  }
  function updateField(field: string, value: string) {
    if (field === "date") void loadSlots(value);
    setForm((prev) => ({ ...prev, [field]: value }));
  }
  // Slots come from the provider's PUBLISHED availability (migration 009). A day
  // with no window offers no slot at all — we never show invented times.
  async function loadSlots(date: string) {
    if (!provider || !date) return;
    setSlotsLoading(true);
    try {
      const res = await fetch(`/api/bookings/availability?providerId=${provider.id}&date=${date}`, {
        headers: { Accept: "application/json" },
      });
      const body = (await res.json()) as { ok: boolean; availabilitySet?: boolean; slots?: string[] };
      setAvailabilitySet(body.ok ? body.availabilitySet === true : false);
      setDaySlots(body.ok ? body.slots ?? [] : []);
    } catch {
      setAvailabilitySet(false);
      setDaySlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!bookingService || !provider) return;
    if (!form.customerName.trim() || !form.customerEmail.trim() || !form.date || !form.time) {
      setFormError("All fields are required.");
      return;
    }
    if (!dogId) {
      setFormError("Choose one of your dogs for this booking.");
      return;
    }
    setSubmitting(true);
    try {
      // Same endpoint the regression exercises: every rule (real-only provider,
      // availability window, dog ownership, slot guard) is enforced server-side.
      const res = await fetch("/api/bookings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          providerId: provider.id,
          serviceId: bookingService.id,
          dogId: Number(dogId),
          customerName: form.customerName.trim(),
          customerEmail: form.customerEmail.trim(),
          date: form.date,
          time: form.time,
        }),
      });
      const body = (await res.json()) as { ok: boolean; message?: string; messageFr?: string; booking?: { id: number } };
      if (res.ok && body.ok && body.booking) {
        setBookingResult({
          id: body.booking.id,
          provider_name: provider.name,
          service_name: bookingService.name,
          date: form.date,
          time: form.time,
        });
        void loadSlots(form.date);
      } else if (res.status === 409 && body.messageFr) {
        setFormError(body.messageFr);
        void loadSlots(form.date);
      } else if (res.status === 401) {
        setFormError("Please log in to book a service.");
      } else {
        setFormError(body.messageFr || body.message || "Something went wrong. Please try again.");
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }
  // ── Error states ───────────────────────────────────────────────────────────

  if (error === "db_error") {
    return (
      <section className="flex flex-1 items-center justify-center bg-white px-6 py-20">
        <div className="flex flex-col items-center rounded-2xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/50 px-6 py-20 text-center">
          <span className="text-5xl">⚠️</span>
          <h2 className="mt-4 text-2xl font-bold text-gray-900">Couldn’t load this provider</h2>
          <p className="mt-2 max-w-md text-gray-600">We had trouble loading the booking details. Please try again.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-6 inline-flex items-center gap-1 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--pawls-terracotta-500)]/20 transition-colors hover:bg-[var(--pawls-terracotta-700)]">
            Retry
          </button>
          <Link to="/book" className="mt-3 text-sm font-medium text-gray-500 hover:text-[var(--pawls-terracotta-500)]">← Back to all providers</Link>
        </div>
      </section>
    );
  }

  if (error === "Provider not found" || !provider) {
    return (
      <section className="flex flex-1 items-center justify-center bg-white px-6 py-20">
        <div className="flex flex-col items-center rounded-2xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/50 px-6 py-20 text-center">
          <span className="text-5xl"></span>
          <h2 className="mt-4 text-2xl font-bold text-gray-900">Provider not found</h2>
          <p className="mt-2 max-w-md text-gray-600">
            We couldn't find that service provider. They may have moved or the link might be incorrect.
          </p>
          <Link to="/book" className="mt-6 inline-flex items-center gap-1 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--pawls-terracotta-500)]/20 transition-colors hover:bg-[var(--pawls-terracotta-700)]">
            ← Back to all providers
          </Link>
        </div>
      </section>
    );
  }

  // ── Normal render ──────────────────────────────────────────────────────────

  const cfg = categoryConfig[provider.category] ?? {
    label: provider.category, bg: "bg-gray-100", text: "text-gray-600", emoji: "",
  };

  return (
    <>
      {/* Back link */}
      <div className="bg-[var(--pawls-cream-50)] px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <Link to="/book" className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-[var(--pawls-terracotta-500)] transition-colors">
            ← Back to all providers
          </Link>
        </div>
      </div>

      {/* Provider header */}
      <section className="bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 pb-10 pt-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--pawls-cream-100)] text-5xl shadow-sm">
              {provider.image_url ? <img src={provider.image_url} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.src = "/logo-full.png"; }} /> : cfg.emoji}
            </div>
            <div className="flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
                  {cfg.label}
                </span>
                <span className="text-sm text-gray-400"> {provider.location}</span>
              </div>
              <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">{provider.name}</h1>
              {/* P0 Data: ratings only from real reviews (none exist yet). */}
              {Number(provider.review_count) > 0 && (
              <div className="mt-2 flex items-center gap-1">
                <span className="text-lg font-medium text-[var(--pawls-cream-50)]0">{renderStars(provider.rating)}</span>
                <span className="text-lg font-semibold text-gray-700">{Number(provider.rating).toFixed(1)}</span>
                <span className="text-sm text-gray-400">({provider.review_count} reviews)</span>
              </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="bg-white px-6 pb-10">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-5 text-xl font-bold text-gray-900">Services</h2>
          {services.length === 0 ? (
            <p className="text-gray-500 italic">No services listed yet.</p>
          ) : (
            <div className="grid gap-3">
              {services.map((service) => (
                <div key={service.id} className="flex flex-col items-start gap-4 rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-5 shadow-sm transition-all hover:border-[var(--pawls-cream-200)] hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-gray-900">{service.name}</h3>
                    <p className="mt-1 text-sm text-gray-500">{formatDuration(service.duration_minutes)}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-lg font-bold text-[var(--pawls-terracotta-500)]">{formatEur(service.price_cents)}</span>
                    <button type="button" onClick={() => openBooking(service)} className="inline-flex items-center rounded-full bg-[var(--pawls-terracotta-500)] px-5 py-2 text-sm font-semibold text-white shadow-md shadow-[var(--pawls-terracotta-500)]/20 transition-colors hover:bg-[var(--pawls-terracotta-700)]">
                      Book
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* About */}
      <section className="bg-[var(--pawls-cream-50)]/50 px-6 pb-20 pt-10">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-4 text-xl font-bold text-gray-900">About</h2>
          <p className="leading-relaxed text-gray-700">{provider.description}</p>
        </div>
      </section>

      {/* ── Booking modal ──────────────────────────────────────────────────── */}
      {bookingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget && !submitting) closeBooking(); }}>
          <div className="w-full max-w-md rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6 shadow-2xl">
            {bookingResult ? (
              <div className="text-center">
                <div className="mb-3 text-5xl"></div>
                <h3 className="text-xl font-bold text-gray-900">Booking submitted — awaiting payment</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Your slot is held. Payments are not enabled yet, so nothing has been charged and the booking is not
                  confirmed. You can cancel it free of charge from My bookings.
                </p>
                <div className="mt-4 space-y-2 rounded-xl bg-[var(--pawls-cream-50)] p-4 text-left text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Provider</span><span className="font-semibold text-gray-900">{bookingResult.provider_name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Service</span><span className="font-semibold text-gray-900">{bookingResult.service_name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Date</span><span className="font-semibold text-gray-900">{bookingResult.date}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Time</span><span className="font-semibold text-gray-900">{bookingResult.time}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Booking ID</span><span className="font-mono text-xs font-semibold text-gray-700">#{bookingResult.id}</span></div>
                </div>
                <div className="mt-5 flex flex-col gap-2">
                  <Link to="/book/my-bookings" className="inline-flex items-center justify-center rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--pawls-terracotta-500)]/20 transition-colors hover:bg-[var(--pawls-terracotta-700)]">
                    My bookings
                  </Link>
                  <button type="button" onClick={closeBooking} className="rounded-full border border-[var(--pawls-cream-200)] bg-white px-6 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-[var(--pawls-cream-50)]">
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">Book: {bookingService.name}</h3>
                  <button type="button" onClick={closeBooking} disabled={submitting} className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-[var(--pawls-cream-50)] px-4 py-3 text-sm">
                  <span className="text-gray-500">Price:</span>
                  <span className="font-bold text-[var(--pawls-terracotta-500)]">{formatEur(bookingService.price_cents)}</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-500">{formatDuration(bookingService.duration_minutes)}</span>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Your name</label>
                    <input type="text" required value={form.customerName} onChange={(e) => updateField("customerName", e.target.value)} placeholder="Jane Doe" disabled={submitting} className="w-full rounded-xl border border-[var(--pawls-cream-200)] bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30 disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Your email</label>
                    <input type="email" required value={form.customerEmail} onChange={(e) => updateField("customerEmail", e.target.value)} placeholder="jane@example.com" disabled={submitting} className="w-full rounded-xl border border-[var(--pawls-cream-200)] bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30 disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Your dog</label>
                    {dogs && dogs.length > 0 ? (
                      <select required value={dogId} onChange={(e) => setDogId(e.target.value)} disabled={submitting} className="w-full rounded-xl border border-[var(--pawls-cream-200)] bg-white px-4 py-2.5 text-gray-900 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30 disabled:opacity-50">
                        {dogs.map((d) => (<option key={d.id} value={d.id}>{d.dog_name}</option>))}
                      </select>
                    ) : (
                      <p className="rounded-xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)] px-4 py-3 text-sm text-gray-700">
                        {signedIn ? (
                          <>Add a dog to your profile first — a booking is always tied to one of your own dogs. <Link to="/match/create" className="font-semibold text-[var(--pawls-terracotta-500)] underline">Add a dog</Link></>
                        ) : (
                          <>Log in to book — bookings are tied to your account and to one of your own dogs. <Link to="/login" className="font-semibold text-[var(--pawls-terracotta-500)] underline">Log in</Link></>
                        )}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
                    <input type="date" required value={form.date} onChange={(e) => updateField("date", e.target.value)} min={todayStr()} max={maxDateStr()} disabled={submitting} className="w-full rounded-xl border border-[var(--pawls-cream-200)] bg-white px-4 py-2.5 text-gray-900 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30 disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Time</label>
                    <select required value={form.time} onChange={(e) => updateField("time", e.target.value)} disabled={submitting} className="w-full rounded-xl border border-[var(--pawls-cream-200)] bg-white px-4 py-2.5 text-gray-900 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30 disabled:opacity-50">
                      <option value="">Select a time</option>
                      {daySlots.map((slot) => (<option key={slot} value={slot}>{slot}</option>))}
                    </select>
                    <p className="mt-1 text-xs text-gray-400">
                      {!form.date
                        ? "Pick a date to see the slots this provider actually published."
                        : slotsLoading
                          ? "Loading the provider's slots…"
                          : availabilitySet === false
                            ? "This provider has not published availability yet, so no slot can be booked."
                            : daySlots.length === 0
                              ? "No free slot left on that day."
                              : "Slots inside the provider's published availability (30-minute steps)."}
                    </p>
                  </div>
                  {formError && (<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>)}
                  <button type="submit" disabled={submitting || !form.time || !dogId} className="w-full rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3 text-sm font-semibold text-white shadow-md shadow-[var(--pawls-terracotta-500)]/20 transition-colors hover:bg-[var(--pawls-terracotta-700)] disabled:cursor-not-allowed disabled:opacity-70">
                    {submitting ? "Confirming…" : "Request this slot"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
