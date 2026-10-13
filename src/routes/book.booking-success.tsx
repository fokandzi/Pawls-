import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { seoHead } from "../lib/seo";
import { t, DEFAULT_LANG, normalizeLang, type Lang } from "../lib/i18n";
import { LangToggle } from "../lib/lang-toggle";

/**
 * /book/booking-success — server-verified booking state.
 *
 * The page NEVER trusts `?session_id=` (or `?bookingId=`) on its own: the server
 * looks the booking up, checks that it belongs to the caller (customer or the
 * provider's owner) and renders the TRUE row. With payments off in this release
 * the honest outcome of booking is "submitted, awaiting payment — nothing was
 * charged", never "paid" and never a success that did not happen.
 *
 * FR-first (batch D2): the language is resolved SERVER-SIDE from the session
 * (users.preferred_language, FR default) and every string comes from the i18n
 * dictionary, including the page metadata — the old EN metadata claimed a
 * "Booking Confirmed", which was not true of a pending payment.
 */

type BookingState = {
  lang: Lang;
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
  lang: DEFAULT_LANG,
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
  const { resolveRequestLang } = await import("../lib/i18n/route-lang");

  let bookingId = bookingIdOverride;
  if (bookingId === null && request) {
    const param = new URL(request.url).searchParams.get("bookingId");
    // Tolerate a JSON-quoted value: older links (see validateSearch below)
    // carried ?bookingId=%22<id>%22. Both spellings mean the same booking.
    const parsed = Number(String(param ?? "").replace(/^"|"$/g, ""));
    bookingId = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  const user = request ? await getSessionUser(request) : null;
  const lang = request ? await resolveRequestLang(request) : DEFAULT_LANG;
  if (!user) return { ...EMPTY, lang, authed: true, signedIn: false };
  if (bookingId === null) return { ...EMPTY, lang, authed: true, signedIn: true };

  const booking = await bookingForActor(user.id, bookingId);
  if (!booking) return { ...EMPTY, lang, authed: true, signedIn: true };
  return {
    lang,
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
  // Same rule as the rest of the Book surfaces (batch D2): the metadata uses the
  // server-resolved language of the visitor, never a hard-coded FR default.
  head: ({ loaderData }) => {
    const L: Lang = (loaderData as { lang?: Lang } | undefined)?.lang ?? DEFAULT_LANG;
    return seoHead({
      title: t("success.seoTitle", L),
      description: t("success.seoDesc", L),
      path: "/book/booking-success",
      noIndex: true,
    });
  },
  validateSearch: (search: Record<string, unknown>) => {
    // The router re-serialises whatever validateSearch returns and answers 307
    // when the result does not round-trip the incoming URL. A numeric-looking
    // param arrives here already parsed as a NUMBER (`?bookingId=250` -> 250), so
    // returning String(250) made the router rewrite every load to
    // `?bookingId=%22250%22` — a redirect on a page a payment provider also
    // links to. Keeping the number round-trips exactly, and a legacy quoted
    // value is normalised back to the canonical numeric form.
    const raw = search.bookingId;
    const n = Number(typeof raw === "string" ? raw.replace(/^"|"$/g, "") : raw);
    const bookingId = Number.isSafeInteger(n) && n > 0 ? n : undefined;
    return {
      bookingId,
      session_id: search.session_id === undefined ? undefined : String(search.session_id),
    };
  },
  loader: () => getBookingState({ data: { bookingId: null } }),
  component: BookingSuccessPage,
});

function fill(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), template);
}

function eur(cents: number | null, currency: string | null) {
  if (cents === null || cents === undefined) return "—";
  return `${(cents / 100).toFixed(2)} ${currency === "EUR" || !currency ? "€" : currency}`;
}

function stateCopy(state: BookingState): { title: string; body: string; tone: "neutral" | "good" } {
  const lang = state.lang;
  if (!state.signedIn) {
    return { title: t("success.loginTitle", lang), body: t("success.loginBody", lang), tone: "neutral" };
  }
  if (!state.found) {
    return { title: t("success.notFoundTitle", lang), body: t("success.notFoundBody", lang), tone: "neutral" };
  }
  switch (state.status) {
    case "pending_payment":
      return { title: t("success.pendingTitle", lang), body: t("success.pendingBody", lang), tone: "neutral" };
    case "paid":
      return { title: t("success.paidTitle", lang), body: t("success.paidBody", lang), tone: "good" };
    case "completed": {
      const suffix = state.completedAt
        ? fill(t("success.completedOn", lang), { date: state.completedAt.slice(0, 10) })
        : "";
      return { title: t("success.completedTitle", lang), body: fill(t("success.completedBody", lang), { date: suffix }), tone: "good" };
    }
    case "cancelled":
      return { title: t("success.cancelledTitle", lang), body: t("success.cancelledBody", lang), tone: "neutral" };
    case "refunded":
      return { title: t("success.refundedTitle", lang), body: t("success.refundedBody", lang), tone: "neutral" };
    case "failed":
      return { title: t("success.failedTitle", lang), body: t("success.failedBody", lang), tone: "neutral" };
    default:
      return {
        title: t("success.defaultTitle", lang),
        body: fill(t("success.defaultBody", lang), { status: state.status ?? t("success.notRecorded", lang) }),
        tone: "neutral",
      };
  }
}

function BookingSuccessPage() {
  const loaderData = Route.useLoaderData() as BookingState;
  const search = (Route.useSearch({ strict: false }) as { bookingId?: number; session_id?: string }) ?? {};
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

  // Follow the persisted language (the toggle posts /api/match/lang).
  useEffect(() => {
    let cancelled = false;
    fetch("/auth/me", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then((r) => r.json())
      .then((me) => {
        if (cancelled || !me?.user) return;
        const next = normalizeLang(me.user.preferred_language);
        if (next !== state.lang) setState((prev) => ({ ...prev, lang: next }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lang]);

  const lang = state.lang;
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
              <span className="text-gray-500">{t("success.booking", lang)}</span>
              <span className="font-mono text-xs font-semibold text-gray-700">#{state.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("success.provider", lang)}</span>
              <span className="font-semibold text-gray-900">{state.providerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("success.service", lang)}</span>
              <span className="font-semibold text-gray-900">{state.serviceName ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("success.when", lang)}</span>
              <span className="font-semibold text-gray-900">
                {state.date} · {state.time}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("success.dog", lang)}</span>
              <span className="font-semibold text-gray-900">{state.dogName ?? t("success.notRecorded", lang)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("success.price", lang)}</span>
              <span className="font-semibold text-gray-900">{eur(state.priceCents, state.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("success.payment", lang)}</span>
              <span className="font-semibold text-gray-900">{state.paymentStatus}</span>
            </div>
          </div>
        )}

        {unverifiedSession && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("success.sessionNote", lang)}</p>
        )}

        <div className="mt-8 space-y-3">
          <Link
            to="/book/my-bookings"
            className="inline-flex w-full items-center justify-center rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--pawls-terracotta-500)]/20 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
          >
            {t("success.myBookings", lang)}
          </Link>
          <Link
            to="/book"
            className="inline-flex w-full items-center justify-center rounded-full border border-[var(--pawls-cream-200)] bg-white px-6 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-[var(--pawls-cream-50)]"
          >
            {t("success.backToServices", lang)}
          </Link>
        </div>

        <div className="mt-6 flex justify-center">
          {state.signedIn && <LangToggle lang={lang} next="/book/booking-success" />}
        </div>
      </div>
    </div>
  );
}
