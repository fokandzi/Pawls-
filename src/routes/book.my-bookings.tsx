import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { seoHead } from "../lib/seo";
import { t, DEFAULT_LANG, normalizeLang, type Lang } from "../lib/i18n";
import { LangToggle } from "../lib/lang-toggle";

/**
 * /book/my-bookings — the customer's own bookings.
 *
 * Every row comes from the server (`customer_user_id` = the session user) and
 * the status shown is the TRUE status of the booking row: with payments off a
 * booking is `pending_payment`/`unpaid` and the page says exactly that — it never
 * claims a booking is paid or confirmed when it is not.
 *
 * FR-first (batch D2): the language is resolved SERVER-SIDE from the session's
 * `users.preferred_language` (FR default), so the served HTML is already in the
 * visitor's language. Every string comes from the i18n dictionary.
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

type LoaderData = { lang: Lang; authed: false } | { lang: Lang; authed: true; email: string; bookings: BookingRow[] };

const getMyBookings = createServerFn({ method: "GET" }).handler(async ({ request }): Promise<LoaderData> => {
  const { requireUser } = await import("../lib/auth/authz");
  const { resolveRequestLang } = await import("../lib/i18n/route-lang");
  const lang = await resolveRequestLang(request);
  const auth = await requireUser(request);
  if (!auth.ok) return { lang, authed: false };
  const { customerBookings } = await import("../lib/booking-core");
  try {
    return { lang, authed: true, email: auth.user.email, bookings: await customerBookings(auth.user.id) };
  } catch (err) {
    console.error("[my-bookings] load failed", err);
    return { lang, authed: true, email: auth.user.email, bookings: [] };
  }
});

export const Route = createFileRoute("/book/my-bookings")({
  // The metadata follows the SAME server-resolved language as the page body: a
  // visitor who switched to EN must not get a French <title>/og:title (batch D2
  // G9 asserts the absence of « Mes réservations » on the EN rendering).
  head: ({ loaderData }) => {
    const L: Lang = (loaderData as { lang?: Lang } | undefined)?.lang ?? DEFAULT_LANG;
    return seoHead({
      title: t("myBookings.seoTitle", L),
      description: t("myBookings.seoDesc", L),
      path: "/book/my-bookings",
    });
  },
  loader: () => getMyBookings(),
  component: MyBookingsPage,
});

const STATUS_STYLE: Record<string, string> = {
  pending_payment: "bg-[var(--pawls-cream-100)] text-[var(--pawls-gold-500)]",
  paid: "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-gray-100 text-gray-600",
  refunded: "bg-sky-50 text-sky-700",
  failed: "bg-red-50 text-red-700",
};

const NOTICE_CODES = [
  "booking_cancelled",
  "NOT_CANCELLABLE",
  "REFUND_REQUIRED",
  "TOO_LATE",
  "FORBIDDEN",
  "BOOKING_NOT_FOUND",
  "DB_UNAVAILABLE",
] as const;

function fill(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), template);
}

function statusLabel(status: string, lang: Lang): string {
  const key = `myBookings.status.${status}`;
  const label = t(key, lang);
  return label === key ? status : label;
}

function formatEur(cents: number | null, currency: string, lang: Lang) {
  if (cents === null || cents === undefined) return "—";
  const amount = (cents / 100).toFixed(2);
  return lang === "en" ? `${amount} ${currency === "EUR" ? "€" : currency}` : `${amount} ${currency === "EUR" ? "€" : currency}`;
}

/** Honest one-line explanation of what the status means right now. */
function statusDetail(b: BookingRow, lang: Lang): string {
  if (b.status === "pending_payment") return t("myBookings.detail.pending_payment", lang);
  if (b.status === "paid") return t("myBookings.detail.paid", lang);
  if (b.status === "completed") {
    const suffix = b.completed_at ? fill(t("myBookings.detail.completedOn", lang), { date: b.completed_at.slice(0, 10) }) : "";
    return fill(t("myBookings.detail.completed", lang), { date: suffix });
  }
  if (b.status === "cancelled") {
    const suffix = b.cancelled_at ? fill(t("myBookings.detail.cancelledOn", lang), { date: b.cancelled_at.slice(0, 10) }) : "";
    return fill(t("myBookings.detail.cancelled", lang), { reason: b.cancellation_status.replace(/_/g, " "), date: suffix });
  }
  return statusLabel(b.status, lang);
}

function MyBookingsPage() {
  const loaderData = Route.useLoaderData() as LoaderData;
  const search = (Route.useSearch({ strict: false }) as Record<string, string>) ?? {};
  const [data, setData] = useState<LoaderData>(loaderData);
  const lang = data.lang;

  // Safety net: if the SSR loader could not see the session (dev-only cookie
  // edge case), the browser reads the real endpoint — the server still decides.
  useEffect(() => {
    if (loaderData.authed) return;
    let cancelled = false;
    fetch("/api/bookings/mine", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) return setData({ lang, authed: false });
        const body = (await res.json()) as { ok: boolean; bookings?: BookingRow[] };
        if (body.ok) setData({ lang, authed: true, email: "", bookings: body.bookings ?? [] });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loaderData.authed, lang]);

  // The persisted language can also be changed after the server render (the
  // LangToggle below posts to /api/match/lang). Refresh the resolved language
  // from the same session so the page follows it without a stale mix.
  useEffect(() => {
    let cancelled = false;
    fetch("/auth/me", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then((r) => r.json())
      .then((me) => {
        if (cancelled || !me?.user) return;
        const next = normalizeLang(me.user.preferred_language);
        if (next !== lang) setData((prev) => ({ ...prev, lang: next }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const noticeCode = (search.error ?? search.ok ?? "") as string;
  const notice = (NOTICE_CODES as readonly string[]).includes(noticeCode)
    ? { ok: noticeCode === "booking_cancelled", text: t(`myBookings.notice.${noticeCode}`, lang) }
    : null;

  return (
    <div className="min-h-screen bg-[var(--pawls-cream-50)]">
      <AppHeader lang={lang} />
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("myBookings.heading", lang)}</h1>
            <p className="mt-1 text-sm text-gray-600">{t("myBookings.subtitle", lang)}</p>
          </div>
          <div className="flex items-center gap-3">
            {data.authed && <LangToggle lang={lang} next="/book/my-bookings" />}
            <Link to="/book" className="rounded-full border border-[var(--pawls-cream-200)] bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-[var(--pawls-cream-100)]">
              {t("myBookings.findProvider", lang)}
            </Link>
          </div>
        </div>

        {notice && (
          <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
            {notice.text}
          </div>
        )}

        {!data.authed ? (
          <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6 text-sm text-gray-700">
            <p className="font-semibold text-gray-900">{t("myBookings.loginTitle", lang)}</p>
            <p className="mt-1">{t("myBookings.loginBody", lang)}</p>
            <div className="mt-4 flex gap-3">
              <Link to="/login" className="rounded-full bg-[var(--pawls-terracotta-500)] px-5 py-2 text-sm font-semibold text-white">{t("myBookings.login", lang)}</Link>
              <Link to="/book" className="rounded-full border border-[var(--pawls-cream-200)] px-5 py-2 text-sm font-semibold text-gray-700">{t("myBookings.backToBook", lang)}</Link>
            </div>
          </div>
        ) : data.bookings.length === 0 ? (
          <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6 text-sm text-gray-700">
            <p className="font-semibold text-gray-900">{t("myBookings.emptyTitle", lang)}</p>
            <p className="mt-1">{t("myBookings.emptyBody", lang)}</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {data.bookings.map((b) => {
              const cancellable = b.status === "pending_payment" && b.payment_status !== "paid";
              return (
                <li key={b.id} className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-gray-900">
                        {b.provider_name || fill(t("myBookings.providerFallback", lang), { id: b.provider_id })}
                      </h2>
                      <p className="text-sm text-gray-600">
                        {fill(t("myBookings.line", lang), {
                          service: b.service_name ?? t("myBookings.serviceFallback", lang),
                          date: b.booking_date,
                          time: b.start_time,
                        })}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {b.dog_name ? fill(t("myBookings.dog", lang), { name: b.dog_name }) : t("myBookings.dogMissing", lang)} · {fill(t("myBookings.bookingId", lang), { id: b.id })}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[b.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {statusLabel(b.status, lang)}
                      </span>
                      <p className="mt-2 text-base font-bold text-[var(--pawls-terracotta-500)]">{formatEur(b.price_cents, b.currency, lang)}</p>
                      <p className="text-xs text-gray-500">{fill(t("myBookings.payment", lang), { status: b.payment_status })}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-gray-600">{statusDetail(b, lang)}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Link to="/book/booking-success" search={{ bookingId: b.id }} className="rounded-full border border-[var(--pawls-cream-200)] px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-[var(--pawls-cream-100)]">
                      {t("myBookings.viewBooking", lang)}
                    </Link>
                    {cancellable && (
                      <form method="post" action={`/api/bookings/${b.id}/cancel?redirect=/book/my-bookings`}>
                        <button type="submit" className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100">
                          {t("myBookings.cancelBooking", lang)}
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-8 text-xs text-gray-500">{t("myBookings.paymentsOff", lang)}</p>
      </main>
      <AppFooter lang={lang} />
    </div>
  );
}
