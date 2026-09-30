import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { seoHead, SEO } from "../lib/seo";

/**
 * /book/booking-success — server-verified booking state.
 *
 * The page NEVER trusts `?session_id=` (or `?bookingId=`) on its own: the server
 * looks the booking up, checks that it belongs to the caller (customer or the
 * provider's owner) and renders the TRUE row. With payments off in this release
 * the honest outcome of booking is "submitted, awaiting payment — nothing was
 * charged", never "paid" and never a success that did not happen.
 */

type BookingState = {
  found: boolean;
  authed: boolean;
  signedIn: boolean;
  id: number | null;
  status: string | null;
  paymentStatus: string | null;
  providerName: string | null;
  serviceName: string | null;
  dogName: string | null;
  date: string | null;
  time: string | null;
  priceCents: number | null;
  currency: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
};

const EMPTY: BookingState = {
  found: false,
  authed: false,
  signedIn: false,
  id: null,
  status: null,
  paymentStatus: null,
  providerName: null,
  serviceName: null,
  dogName: null,
  date: null,
  time: null,
  priceCents: null,
  currency: null,
  completedAt: null,
  cancelledAt: null,
};

async function resolve(request: Request | null, bookingIdOverride: number | null): Promise<BookingState> {
  const { getSessionUser } = await import("../lib/auth/session");
  const { bookingForActor } = await import("../lib/booking-core");

  let bookingId = bookingIdOverride;
  if (bookingId === null && request) {
    const param = new URL(request.url).searchParams.get("bookingId");
    const parsed = Number(param);
    bookingId = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  const user = request ? await getSessionUser(request) : null;
  if (!user) return { ...EMPTY, authed: true, signedIn: false };
  if (bookingId === null) return { ...EMPTY, authed: true, signedIn: true };

  const booking = await bookingForActor(user.id, bookingId);
  if (!booking) return { ...EMPTY, authed: true, signedIn: true };
  return {
    found: true,
    authed: true,
    signedIn: true,
    id: booking.id,
    status: booking.status,
    paymentStatus: booking.payment_status,
    providerName: booking.provider_name,
    serviceName: booking.service_name,
    dogName: booking.dog_name,
    date: booking.booking_date,
    time: booking.start_time,
    priceCents: booking.price_cents,
    currency: booking.currency,
    completedAt: booking.completed_at,
    cancelledAt: booking.cancelled_at,
  };
}

const getBookingState = createServerFn({ method: "GET" })
  .validator((data: unknown) => {
    const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const n = Number(d.bookingId);
    return { bookingId: Number.isSafeInteger(n) && n > 0 ? n : null };
  })
  .handler(async ({ data, request }): Promise<BookingState> => resolve(request, data.bookingId));

export const Route = createFileRoute("/book/booking-success")({
  head: () => seoHead(SEO["book/booking-success"]),
  validateSearch: (search: Record<string, unknown>) => ({
    bookingId: search.bookingId === undefined ? undefined : String(search.bookingId),
    session_id: search.session_id === undefined ? undefined : String(search.session_id),
  }),
  loader: () => getBookingState({ data: { bookingId: null } }),
  component: BookingSuccessPage,
});

function eur(cents: number | null, currency: string | null) {
  if (cents === null || cents === undefined) return "—";
  return `${(cents / 100).toFixed(2)} ${currency === "EUR" || !currency ? "€" : currency}`;
}

function stateCopy(state: BookingState): { title: string; body: string; tone: "neutral" | "good" } {
  if (!state.signedIn) {
    return {
      title: "Log in to see this booking",
      body: "We only show a booking to the account that made it, so nothing is displayed here.",
      tone: "neutral",
    };
  }
  if (!state.found) {
    return {
      title: "No booking found",
      body: "We couldn't find that booking on your account. If you just booked, open My bookings — that list is read straight from the database.",
      tone: "neutral",
    };
  }
  switch (state.status) {
    case "pending_payment":
      return {
        title: "Booking submitted — awaiting payment",
        body: "Your slot is held. Payments are not enabled yet, so nothing has been charged and the booking is not confirmed. You can cancel it free of charge from My bookings.",
        tone: "neutral",
      };
    case "paid":
      return { title: "Booking paid", body: "Your payment was received. The provider can now complete the service.", tone: "good" };
    case "completed":
      return {
        title: "Booking completed",
        body: `The provider marked this booking as done${state.completedAt ? ` on ${state.completedAt.slice(0, 10)}` : ""}.`,
        tone: "good",
      };
    case "cancelled":
      return { title: "Booking cancelled", body: "This booking was cancelled and its slot is free again.", tone: "neutral" };
    case "refunded":
      return { title: "Booking refunded", body: "This booking was refunded.", tone: "neutral" };
    case "failed":
      return { title: "Payment failed", body: "The payment for this booking failed. Nothing was charged.", tone: "neutral" };
    default:
      return { title: "Booking", body: `Status: ${state.status ?? "unknown"}.`, tone: "neutral" };
  }
}

function BookingSuccessPage() {
  const loaderData = Route.useLoaderData() as BookingState;
  const search = (Route.useSearch({ strict: false }) as Record<string, string>) ?? {};
  const [state, setState] = useState<BookingState>(loaderData);

  // Client-side navigation: the loader may have run without the query string, so
  // the browser asks the server for the real row. The server still authorizes.
  useEffect(() => {
    if (loaderData.found || (loaderData.authed && !loaderData.signedIn)) return;
    if (!search.bookingId) return;
    let cancelled = false;
    getBookingState({ data: { bookingId: Number(search.bookingId) } })
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [search.bookingId, loaderData.found, loaderData.authed, loaderData.signedIn]);

  const copy = stateCopy(state);
  const unverifiedSession = !state.found && !!search.session_id;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--pawls-cream-50)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-8 text-center shadow-xl">
        <div className="mb-4 text-5xl">{copy.tone === "good" ? "✅" : "📋"}</div>
        <h1 className="text-2xl font-bold text-gray-900">{copy.title}</h1>
        <p className="mt-2 text-gray-600">{copy.body}</p>

        {state.found && (
          <div className="mt-5 space-y-2 rounded-xl bg-[var(--pawls-cream-50)] p-4 text-left text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Booking</span>
              <span className="font-mono text-xs font-semibold text-gray-700">#{state.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Provider</span>
              <span className="font-semibold text-gray-900">{state.providerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Service</span>
              <span className="font-semibold text-gray-900">{state.serviceName ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">When</span>
              <span className="font-semibold text-gray-900">
                {state.date} · {state.time}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Dog</span>
              <span className="font-semibold text-gray-900">{state.dogName ?? "not recorded"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Price</span>
              <span className="font-semibold text-gray-900">{eur(state.priceCents, state.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Payment</span>
              <span className="font-semibold text-gray-900">{state.paymentStatus}</span>
            </div>
          </div>
        )}

        {unverifiedSession && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            A payment session reference alone is not proof of a booking — that is why this page reads the booking from our database instead.
          </p>
        )}

        <div className="mt-8 space-y-3">
          <Link
            to="/book/my-bookings"
            className="inline-flex w-full items-center justify-center rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--pawls-terracotta-500)]/20 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
          >
            My bookings
          </Link>
          <Link
            to="/book"
            className="inline-flex w-full items-center justify-center rounded-full border border-[var(--pawls-cream-200)] bg-white px-6 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-[var(--pawls-cream-50)]"
          >
            Back to services
          </Link>
        </div>
      </div>
    </div>
  );
}
