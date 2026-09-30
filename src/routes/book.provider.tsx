import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { seoHead } from "../lib/seo";

/**
 * /book/provider — the provider's own space (batch D1, minimum viable).
 *
 * Everything on this page is owner-bound and server-decided: the loader resolves
 * the provider from the SESSION, and every action posts to a native endpoint that
 * re-checks ownership (403 otherwise). The page never shows another provider's
 * bookings, and it never reports an action as done when the server refused it.
 *
 * Scope notes (batch D2 does FR copy + dashboard polish):
 *   - availability, services (edit + deactivate) and incoming bookings;
 *   - "mark complete" only works on a PAID booking (payments are off, so a
 *     brand-new booking cannot be completed yet — the page says so honestly).
 */

type BookingRow = {
  id: number;
  provider_id: number;
  provider_name: string;
  service_id: number;
  service_name: string | null;
  dog_id: number | null;
  dog_name: string | null;
  customer_name: string;
  customer_email: string;
  booking_date: string;
  start_time: string;
  status: string;
  payment_status: string;
  cancellation_status: string;
  price_cents: number | null;
  currency: string;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};

type ServiceRow = {
  id: number;
  name: string;
  price_cents: number;
  duration_minutes: number;
  is_active: boolean | null;
};

type WindowRow = { day_of_week: number; start_time: string; end_time: string };

type LoaderData =
  | { authed: false }
  | {
      authed: true;
      providerId: number | null;
      providerName: string | null;
      approvalStatus: string | null;
      bookings: BookingRow[];
      services: ServiceRow[];
      availability: WindowRow[];
    };

const getProviderDashboard = createServerFn({ method: "GET" }).handler(async ({ request }): Promise<LoaderData> => {
  const { requireUser } = await import("../lib/auth/authz");
  const auth = await requireUser(request);
  if (!auth.ok) return { authed: false };
  const { getOwnedProvider, providerBookings, ownedServices, providerAvailability } = await import("../lib/booking-core");
  try {
    const owned = await getOwnedProvider(auth.user.id);
    if (!owned) {
      return { authed: true, providerId: null, providerName: null, approvalStatus: null, bookings: [], services: [], availability: [] };
    }
    const incoming = await providerBookings(auth.user.id);
    return {
      authed: true,
      providerId: incoming.providerId ?? Number(owned.id),
      providerName: incoming.providerName ?? owned.name,
      approvalStatus: owned.approval_status,
      bookings: incoming.bookings,
      services: (await ownedServices(auth.user.id)) as unknown as ServiceRow[],
      availability: await providerAvailability(incoming.providerId ?? Number(owned.id)),
    };
  } catch (err) {
    console.error("[provider-dashboard] load failed", err);
    return { authed: true, providerId: null, providerName: null, approvalStatus: null, bookings: [], services: [], availability: [] };
  }
});

export const Route = createFileRoute("/book/provider")({
  head: () => seoHead({ title: "Provider space — Pawls", description: "Manage your Pawls services, availability and bookings.", path: "/book/provider" }),
  loader: () => getProviderDashboard(),
  component: ProviderDashboardPage,
});

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  failed: "Payment failed",
};

const NOTICE: Record<string, { ok: boolean; text: string }> = {
  availability_saved: { ok: true, text: "Availability saved — these are now the only bookable slots." },
  service_updated: { ok: true, text: "Service updated." },
  service_deactivated: { ok: true, text: "Service deactivated — it can no longer be booked." },
  booking_completed: { ok: true, text: "Booking marked complete." },
  booking_cancelled: { ok: true, text: "Booking cancelled." },
  NOT_PAID: { ok: false, text: "Only a paid booking can be completed. Payments are not enabled yet, so this booking stays 'awaiting payment'." },
  ALREADY_COMPLETED: { ok: false, text: "This booking is already completed." },
  FORBIDDEN: { ok: false, text: "That booking or service is not yours." },
  NOT_CANCELLABLE: { ok: false, text: "This booking can no longer be cancelled." },
  REFUND_REQUIRED: { ok: false, text: "This booking is paid: it must be refunded, not cancelled (refunds are not available yet)." },
  AVAILABILITY_TIME_INVALID: { ok: false, text: "Times must use the HH:MM 24-hour format." },
  AVAILABILITY_WINDOW_TOO_SHORT: { ok: false, text: "A window must be at least 30 minutes long." },
  AVAILABILITY_DUPLICATE: { ok: false, text: "Two windows start at the same time on the same day." },
  SERVICE_PRICE_INVALID: { ok: false, text: "The price must be between 0.01 and 5000 EUR." },
  DB_UNAVAILABLE: { ok: false, text: "We couldn't reach the database — nothing was changed." },
};

function eur(cents: number | null) {
  if (cents === null || cents === undefined) return "—";
  return `${(cents / 100).toFixed(2)} €`;
}

function ProviderDashboardPage() {
  const loaderData = Route.useLoaderData() as LoaderData;
  const search = (Route.useSearch({ strict: false }) as Record<string, string>) ?? {};
  const [data, setData] = useState<LoaderData>(loaderData);

  // Same dev-only safety net as /book/my-bookings: the browser can read the real
  // endpoint when the SSR loader had no session; the server still decides.
  useEffect(() => {
    if (loaderData.authed) return;
    let cancelled = false;
    fetch("/api/bookings/provider", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) return setData({ authed: false });
        const body = (await res.json()) as Record<string, unknown> & { ok: boolean };
        if (body.ok) {
          setData({
            authed: true,
            providerId: body.providerId === null || body.providerId === undefined ? null : Number(body.providerId),
            providerName: (body.providerName as string | null) ?? null,
            approvalStatus: (body.approvalStatus as string | null) ?? null,
            bookings: (body.bookings as BookingRow[]) ?? [],
            services: (body.services as ServiceRow[]) ?? [],
            availability: (body.availability as WindowRow[]) ?? [],
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loaderData.authed]);

  const notice = search.error ? NOTICE[search.error] : search.ok ? NOTICE[search.ok] : null;
  const winFor = (dow: number) => data.authed ? data.availability.find((w) => Number(w.day_of_week) === dow) : undefined;

  return (
    <div className="min-h-screen bg-[var(--pawls-cream-50)]">
      <AppHeader lang="en" />
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900">Provider space</h1>

        {notice && (
          <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
            {notice.text}
          </div>
        )}

        {!data.authed ? (
          <div className="mt-6 rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6 text-sm text-gray-700">
            <p className="font-semibold text-gray-900">Log in to manage your services.</p>
            <div className="mt-4 flex gap-3">
              <Link to="/login" className="rounded-full bg-[var(--pawls-terracotta-500)] px-5 py-2 text-sm font-semibold text-white">Log in</Link>
              <Link to="/book/register" className="rounded-full border border-[var(--pawls-cream-200)] px-5 py-2 text-sm font-semibold text-gray-700">Become a provider</Link>
            </div>
          </div>
        ) : !data.providerId ? (
          <div className="mt-6 rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6 text-sm text-gray-700">
            <p className="font-semibold text-gray-900">You don't have a provider listing on this account.</p>
            <p className="mt-1">Applying is free and takes a minute; nothing is published until it is reviewed.</p>
            <Link to="/book/register" className="mt-4 inline-block rounded-full bg-[var(--pawls-terracotta-500)] px-5 py-2 text-sm font-semibold text-white">Apply as a provider</Link>
          </div>
        ) : (
          <div className="mt-6 space-y-8">
            <section className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{data.providerName}</h2>
                  <p className="text-sm text-gray-600">Listing #{data.providerId}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${data.approvalStatus === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-[var(--pawls-cream-100)] text-[var(--pawls-gold-500)]"}`}>
                  {data.approvalStatus === "approved" ? "Approved" : `Status: ${data.approvalStatus ?? "unknown"}`}
                </span>
              </div>
              {data.approvalStatus !== "approved" && (
                <p className="mt-3 text-sm text-gray-600">
                  Your listing is not approved yet, so it is not visible to dog owners and cannot be booked. Nothing is published before review.
                </p>
              )}
            </section>

            {/* ── Availability ─────────────────────────────────────────────── */}
            <section className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6">
              <h2 className="text-lg font-semibold text-gray-900">Weekly availability</h2>
              <p className="mt-1 text-sm text-gray-600">
                These windows are the ONLY bookable slots. A day left empty is not bookable, and owners are told so — Pawls never invents times for you.
                {data.availability.length === 0 && " You have no availability published yet, so nothing can be booked."}
              </p>
              <form method="post" action={`/api/bookings/availability?redirect=/book/provider`} className="mt-4 space-y-3">
                <input type="hidden" name="providerId" value={data.providerId} />
                {DAYS.map((label, dow) => {
                  const w = winFor(dow);
                  return (
                    <div key={dow} className="flex flex-wrap items-center gap-3">
                      <span className="w-24 text-sm font-medium text-gray-700">{label}</span>
                      <label className="text-xs text-gray-500">
                        From
                        <input type="time" name={`day_${dow}_start`} defaultValue={w?.start_time ?? ""} className="ml-2 rounded-lg border border-[var(--pawls-cream-200)] px-2 py-1 text-sm" />
                      </label>
                      <label className="text-xs text-gray-500">
                        To
                        <input type="time" name={`day_${dow}_end`} defaultValue={w?.end_time ?? ""} className="ml-2 rounded-lg border border-[var(--pawls-cream-200)] px-2 py-1 text-sm" />
                      </label>
                    </div>
                  );
                })}
                <button type="submit" className="rounded-full bg-[var(--pawls-terracotta-500)] px-5 py-2 text-sm font-semibold text-white">
                  Save availability
                </button>
              </form>
            </section>

            {/* ── Services ─────────────────────────────────────────────────── */}
            <section className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6">
              <h2 className="text-lg font-semibold text-gray-900">Services</h2>
              {data.services.length === 0 ? (
                <p className="mt-2 text-sm text-gray-600">No service on your listing yet.</p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {data.services.map((s) => (
                    <li key={s.id} className="rounded-xl border border-[var(--pawls-cream-100)] p-4">
                      <form method="post" action={`/api/services/${s.id}?redirect=/book/provider`} className="flex flex-wrap items-end gap-3">
                        <label className="text-xs text-gray-500">
                          Name
                          <input name="name" defaultValue={s.name} className="mt-1 block rounded-lg border border-[var(--pawls-cream-200)] px-2 py-1 text-sm text-gray-900" />
                        </label>
                        <label className="text-xs text-gray-500">
                          Price (€)
                          <input name="price_euros" type="number" step="0.01" min="0.01" defaultValue={(s.price_cents / 100).toFixed(2)} className="mt-1 block w-24 rounded-lg border border-[var(--pawls-cream-200)] px-2 py-1 text-sm text-gray-900" />
                        </label>
                        <label className="text-xs text-gray-500">
                          Minutes
                          <input name="duration_minutes" type="number" min="1" max="1440" defaultValue={s.duration_minutes} className="mt-1 block w-20 rounded-lg border border-[var(--pawls-cream-200)] px-2 py-1 text-sm text-gray-900" />
                        </label>
                        <button type="submit" className="rounded-full bg-[var(--pawls-terracotta-500)] px-4 py-2 text-xs font-semibold text-white">Save</button>
                        <span className={`text-xs font-semibold ${s.is_active === false ? "text-gray-500" : "text-emerald-700"}`}>
                          {s.is_active === false ? "Inactive — not bookable" : "Active"}
                        </span>
                      </form>
                      {s.is_active !== false && (
                        <form method="post" action={`/api/services/${s.id}/deactivate?redirect=/book/provider`} className="mt-2">
                          <button type="submit" className="rounded-full border border-red-200 bg-red-50 px-4 py-1.5 text-xs font-semibold text-red-700">
                            Deactivate
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── Incoming bookings ────────────────────────────────────────── */}
            <section className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6">
              <h2 className="text-lg font-semibold text-gray-900">Incoming bookings</h2>
              {data.bookings.length === 0 ? (
                <p className="mt-2 text-sm text-gray-600">No booking yet. Owners can only book slots inside your availability windows.</p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {data.bookings.map((b) => (
                    <li key={b.id} className="rounded-xl border border-[var(--pawls-cream-100)] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="text-sm text-gray-700">
                          <p className="font-semibold text-gray-900">
                            {b.booking_date} at {b.start_time} · {b.service_name ?? "Service"}
                          </p>
                          <p className="text-xs text-gray-500">
                            Booking #{b.id} · dog: {b.dog_name ?? "not recorded"} · customer: {b.customer_name}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="rounded-full bg-[var(--pawls-cream-100)] px-3 py-1 text-xs font-semibold text-[var(--pawls-gold-500)]">
                            {STATUS_LABEL[b.status] ?? b.status}
                          </span>
                          <p className="mt-1 text-sm font-bold text-[var(--pawls-terracotta-500)]">{eur(b.price_cents)}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3">
                        {b.status === "paid" && (
                          <form method="post" action={`/api/bookings/${b.id}/complete?redirect=/book/provider`}>
                            <button type="submit" className="rounded-full bg-[var(--pawls-terracotta-500)] px-4 py-2 text-xs font-semibold text-white">Mark complete</button>
                          </form>
                        )}
                        {b.status === "pending_payment" && (
                          <p className="text-xs text-gray-500">
                            Awaiting payment — you can mark it complete once it is paid (payments are not enabled yet).
                          </p>
                        )}
                        {(b.status === "pending_payment" || b.status === "paid") && (
                          <form method="post" action={`/api/bookings/${b.id}/cancel?redirect=/book/provider`}>
                            <button type="submit" className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">Cancel</button>
                          </form>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>
      <AppFooter lang="en" />
    </div>
  );
}
