import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { seoHead } from "../lib/seo";

/**
 * /book/my-bookings — the customer's own bookings.
 *
 * Every row comes from the server (`customer_user_id` = the session user) and
 * the status shown is the TRUE status of the booking row: with payments off a
 * booking is `pending_payment`/`unpaid` and the page says exactly that — it never
 * claims a booking is paid or confirmed when it is not.
 */

type BookingRow = {
  id: number;
  provider_id: number;
  provider_name: string;
  service_id: number;
  service_name: string | null;
  dog_id: number | null;
  dog_name: string | null;
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

type LoaderData =
  | { authed: false }
  | { authed: true; email: string; bookings: BookingRow[] };

const getMyBookings = createServerFn({ method: "GET" }).handler(async ({ request }): Promise<LoaderData> => {
  const { requireUser } = await import("../lib/auth/authz");
  const auth = await requireUser(request);
  if (!auth.ok) return { authed: false };
  const { customerBookings } = await import("../lib/booking-core");
  try {
    return { authed: true, email: auth.user.email, bookings: await customerBookings(auth.user.id) };
  } catch (err) {
    console.error("[my-bookings] load failed", err);
    return { authed: true, email: auth.user.email, bookings: [] };
  }
});

export const Route = createFileRoute("/book/my-bookings")({
  head: () => seoHead({ title: "My bookings — Pawls", description: "Your Pawls service bookings.", path: "/book/my-bookings" }),
  loader: () => getMyBookings(),
  component: MyBookingsPage,
});

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  failed: "Payment failed",
};

const STATUS_STYLE: Record<string, string> = {
  pending_payment: "bg-[var(--pawls-cream-100)] text-[var(--pawls-gold-500)]",
  paid: "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-gray-100 text-gray-600",
  refunded: "bg-sky-50 text-sky-700",
  failed: "bg-red-50 text-red-700",
};

const NOTICE: Record<string, { ok: boolean; text: string }> = {
  booking_cancelled: { ok: true, text: "Booking cancelled — the slot is free again." },
  NOT_CANCELLABLE: { ok: false, text: "This booking can no longer be cancelled." },
  REFUND_REQUIRED: { ok: false, text: "This booking is paid: it must be refunded, not cancelled (refunds are not available yet). Nothing was changed." },
  TOO_LATE: { ok: false, text: "That appointment has already started and can no longer be cancelled." },
  FORBIDDEN: { ok: false, text: "This booking is not yours." },
  BOOKING_NOT_FOUND: { ok: false, text: "Booking not found." },
  DB_UNAVAILABLE: { ok: false, text: "We couldn't reach the database — nothing was changed." },
};

function formatEur(cents: number | null, currency: string) {
  if (cents === null || cents === undefined) return "—";
  return `${(cents / 100).toFixed(2)} ${currency === "EUR" ? "€" : currency}`;
}

/** Honest one-line explanation of what the status means right now. */
function statusDetail(b: BookingRow): string {
  if (b.status === "pending_payment") {
    return "The slot is held for you. Payment is not enabled yet, so nothing has been charged.";
  }
  if (b.status === "paid") return "Paid. The provider can mark it complete once the service is done.";
  if (b.status === "completed") return `Completed${b.completed_at ? ` on ${b.completed_at.slice(0, 10)}` : ""}.`;
  if (b.status === "cancelled") return `Cancelled (${b.cancellation_status.replace(/_/g, " ")})${b.cancelled_at ? ` on ${b.cancelled_at.slice(0, 10)}` : ""}.`;
  return STATUS_LABEL[b.status] ?? b.status;
}

function MyBookingsPage() {
  const loaderData = Route.useLoaderData() as LoaderData;
  const search = (Route.useSearch({ strict: false }) as Record<string, string>) ?? {};
  const [data, setData] = useState<LoaderData>(loaderData);
  const [lang] = useState<"en" | "fr">("en");

  // Safety net: if the SSR loader could not see the session (dev-only cookie
  // edge case), the browser reads the real endpoint — the server still decides.
  useEffect(() => {
    if (loaderData.authed) return;
    let cancelled = false;
    fetch("/api/bookings/mine", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) return setData({ authed: false });
        const body = (await res.json()) as { ok: boolean; bookings?: BookingRow[] };
        if (body.ok) setData({ authed: true, email: "", bookings: body.bookings ?? [] });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loaderData.authed]);

  const notice = search.error ? NOTICE[search.error] : search.ok ? NOTICE[search.ok] : null;

  return (
    <div className="min-h-screen bg-[var(--pawls-cream-50)]">
      <AppHeader lang={lang} />
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My bookings</h1>
            <p className="mt-1 text-sm text-gray-600">Every booking below is stored on your account.</p>
          </div>
          <Link to="/book" className="rounded-full border border-[var(--pawls-cream-200)] bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-[var(--pawls-cream-100)]">
            Find a provider
          </Link>
        </div>

        {notice && (
          <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
            {notice.text}
          </div>
        )}

        {!data.authed ? (
          <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6 text-sm text-gray-700">
            <p className="font-semibold text-gray-900">Log in to see your bookings.</p>
            <p className="mt-1">Bookings are tied to your account — we never show anyone else's.</p>
            <div className="mt-4 flex gap-3">
              <Link to="/login" className="rounded-full bg-[var(--pawls-terracotta-500)] px-5 py-2 text-sm font-semibold text-white">Log in</Link>
              <Link to="/book" className="rounded-full border border-[var(--pawls-cream-200)] px-5 py-2 text-sm font-semibold text-gray-700">Back to Book</Link>
            </div>
          </div>
        ) : data.bookings.length === 0 ? (
          <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6 text-sm text-gray-700">
            <p className="font-semibold text-gray-900">You have no bookings yet.</p>
            <p className="mt-1">
              No provider is taking bookings in Paris yet, so there is nothing to show. When you book a service it will appear here with its true status.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {data.bookings.map((b) => {
              const cancellable = b.status === "pending_payment" && b.payment_status !== "paid";
              return (
                <li key={b.id} className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-gray-900">{b.provider_name || `Provider #${b.provider_id}`}</h2>
                      <p className="text-sm text-gray-600">
                        {b.service_name ?? "Service"} · {b.booking_date} at {b.start_time}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {b.dog_name ? `Dog: ${b.dog_name}` : "Dog: not recorded for this booking"} · Booking #{b.id}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[b.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {STATUS_LABEL[b.status] ?? b.status}
                      </span>
                      <p className="mt-2 text-base font-bold text-[var(--pawls-terracotta-500)]">{formatEur(b.price_cents, b.currency)}</p>
                      <p className="text-xs text-gray-500">payment: {b.payment_status}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-gray-600">{statusDetail(b)}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Link to="/book/booking-success" search={{ bookingId: b.id }} className="rounded-full border border-[var(--pawls-cream-200)] px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-[var(--pawls-cream-100)]">
                      View booking
                    </Link>
                    {cancellable && (
                      <form method="post" action={`/api/bookings/${b.id}/cancel?redirect=/book/my-bookings`}>
                        <button type="submit" className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100">
                          Cancel booking
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-8 text-xs text-gray-500">
          Payments are not enabled yet. A booking is created unpaid and holds its slot; nothing is charged.
        </p>
      </main>
      <AppFooter lang={lang} />
    </div>
  );
}
