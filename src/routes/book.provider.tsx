import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { seoHead } from "../lib/seo";
import { t, DEFAULT_LANG, normalizeLang, type Lang } from "../lib/i18n";
import { LangToggle } from "../lib/lang-toggle";

/**
 * /book/provider — the provider's own space (batch D1, minimum viable).
 *
 * Everything on this page is owner-bound and server-decided: the loader resolves
 * the provider from the SESSION, and every action posts to a native endpoint that
 * re-checks ownership (403 otherwise). The page never shows another provider's
 * bookings, and it never reports an action as done when the server refused it.
 *
 * FR-first (batch D2): language resolved server-side from the session
 * (users.preferred_language, FR default); every string comes from the i18n dict.
 *
 * Scope notes:
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
  | { lang: Lang; authed: false }
  | {
      lang: Lang;
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
  const { resolveRequestLang } = await import("../lib/i18n/route-lang");
  const lang = await resolveRequestLang(request);
  const auth = await requireUser(request);
  if (!auth.ok) return { lang, authed: false };
  const { getOwnedProvider, providerBookings, ownedServices, providerAvailability } = await import("../lib/booking-core");
  try {
    const owned = await getOwnedProvider(auth.user.id);
    if (!owned) {
      return { lang, authed: true, providerId: null, providerName: null, approvalStatus: null, bookings: [], services: [], availability: [] };
    }
    const incoming = await providerBookings(auth.user.id);
    return {
      lang,
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
    return { lang, authed: true, providerId: null, providerName: null, approvalStatus: null, bookings: [], services: [], availability: [] };
  }
});

export const Route = createFileRoute("/book/provider")({
  head: () =>
    seoHead({
      title: t("providerSpace.seoTitle", DEFAULT_LANG),
      description: t("providerSpace.seoDesc", DEFAULT_LANG),
      path: "/book/provider",
    }),
  loader: () => getProviderDashboard(),
  component: ProviderDashboardPage,
});

const DAY_KEYS = [0, 1, 2, 3, 4, 5, 6] as const;

const NOTICE_CODES = [
  "availability_saved",
  "service_updated",
  "service_deactivated",
  "booking_completed",
  "booking_cancelled",
  "NOT_PAID",
  "ALREADY_COMPLETED",
  "FORBIDDEN",
  "NOT_CANCELLABLE",
  "REFUND_REQUIRED",
  "AVAILABILITY_TIME_INVALID",
  "AVAILABILITY_WINDOW_TOO_SHORT",
  "AVAILABILITY_DUPLICATE",
  "SERVICE_PRICE_INVALID",
  "DB_UNAVAILABLE",
] as const;

const OK_CODES = new Set(["availability_saved", "service_updated", "service_deactivated", "booking_completed", "booking_cancelled"]);

function fill(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), template);
}

function statusLabel(status: string, lang: Lang): string {
  const key = `myBookings.status.${status}`;
  const label = t(key, lang);
  return label === key ? status : label;
}

function eur(cents: number | null, lang: Lang) {
  if (cents === null || cents === undefined) return "—";
  return `${(cents / 100).toFixed(2)} €`;
}

function ProviderDashboardPage() {
  const loaderData = Route.useLoaderData() as LoaderData;
  const search = (Route.useSearch({ strict: false }) as Record<string, string>) ?? {};
  const [data, setData] = useState<LoaderData>(loaderData);
  const lang = data.lang;

  // Same dev-only safety net as /book/my-bookings: the browser can read the real
  // endpoint when the SSR loader had no session; the server still decides.
  useEffect(() => {
    if (loaderData.authed) return;
    let cancelled = false;
    fetch("/api/bookings/provider", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) return setData({ lang, authed: false });
        const body = (await res.json()) as Record<string, unknown> & { ok: boolean };
        if (body.ok) {
          setData({
            lang,
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
  }, [loaderData.authed, lang]);

  // Follow a persisted language change (LangToggle posts /api/match/lang).
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
    ? { ok: OK_CODES.has(noticeCode), text: t(`providerSpace.notice.${noticeCode}`, lang) }
    : null;
  const winFor = (dow: number) => (data.authed ? data.availability.find((w) => Number(w.day_of_week) === dow) : undefined);

  return (
    <div className="min-h-screen bg-[var(--pawls-cream-50)]">
      <AppHeader lang={lang} />
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{t("providerSpace.heading", lang)}</h1>
          {data.authed && <LangToggle lang={lang} next="/book/provider" />}
        </div>

        {notice && (
          <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
            {notice.text}
          </div>
        )}

        {!data.authed ? (
          <div className="mt-6 rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6 text-sm text-gray-700">
            <p className="font-semibold text-gray-900">{t("providerSpace.loginTitle", lang)}</p>
            <div className="mt-4 flex gap-3">
              <Link to="/login" className="rounded-full bg-[var(--pawls-terracotta-500)] px-5 py-2 text-sm font-semibold text-white">{t("providerSpace.login", lang)}</Link>
              <Link to="/book/register" className="rounded-full border border-[var(--pawls-cream-200)] px-5 py-2 text-sm font-semibold text-gray-700">{t("providerSpace.becomeProvider", lang)}</Link>
            </div>
          </div>
        ) : !data.providerId ? (
          <div className="mt-6 rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6 text-sm text-gray-700">
            <p className="font-semibold text-gray-900">{t("providerSpace.noListingTitle", lang)}</p>
            <p className="mt-1">{t("providerSpace.noListingBody", lang)}</p>
            <Link to="/book/register" className="mt-4 inline-block rounded-full bg-[var(--pawls-terracotta-500)] px-5 py-2 text-sm font-semibold text-white">{t("providerSpace.apply", lang)}</Link>
          </div>
        ) : (
          <div className="mt-6 space-y-8">
            <section className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{data.providerName}</h2>
                  <p className="text-sm text-gray-600">{fill(t("providerSpace.listing", lang), { id: data.providerId })}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${data.approvalStatus === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-[var(--pawls-cream-100)] text-[var(--pawls-gold-500)]"}`}>
                  {data.approvalStatus === "approved"
                    ? t("providerSpace.approved", lang)
                    : fill(t("providerSpace.statusPrefix", lang), { status: data.approvalStatus ?? t("providerSpace.unknownStatus", lang) })}
                </span>
              </div>
              {data.approvalStatus !== "approved" && <p className="mt-3 text-sm text-gray-600">{t("providerSpace.notApproved", lang)}</p>}
            </section>

            {/* ── Availability ─────────────────────────────────────────────── */}
            <section className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6">
              <h2 className="text-lg font-semibold text-gray-900">{t("providerSpace.availabilityHeading", lang)}</h2>
              <p className="mt-1 text-sm text-gray-600">
                {t("providerSpace.availabilityBody", lang)}
                {data.availability.length === 0 && t("providerSpace.availabilityNone", lang)}
              </p>
              <form method="post" action={`/api/bookings/availability?redirect=/book/provider`} className="mt-4 space-y-3">
                <input type="hidden" name="providerId" value={data.providerId} />
                {DAY_KEYS.map((dow) => {
                  const w = winFor(dow);
                  return (
                    <div key={dow} className="flex flex-wrap items-center gap-3">
                      <span className="w-24 text-sm font-medium text-gray-700">{t(`providerSpace.day.${dow}`, lang)}</span>
                      <label className="text-xs text-gray-500">
                        {t("providerSpace.from", lang)}
                        <input type="time" name={`day_${dow}_start`} defaultValue={w?.start_time ?? ""} className="ml-2 rounded-lg border border-[var(--pawls-cream-200)] px-2 py-1 text-sm" />
                      </label>
                      <label className="text-xs text-gray-500">
                        {t("providerSpace.to", lang)}
                        <input type="time" name={`day_${dow}_end`} defaultValue={w?.end_time ?? ""} className="ml-2 rounded-lg border border-[var(--pawls-cream-200)] px-2 py-1 text-sm" />
                      </label>
                    </div>
                  );
                })}
                <button type="submit" className="rounded-full bg-[var(--pawls-terracotta-500)] px-5 py-2 text-sm font-semibold text-white">
                  {t("providerSpace.saveAvailability", lang)}
                </button>
              </form>
            </section>

            {/* ── Services ─────────────────────────────────────────────────── */}
            <section className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-6">
              <h2 className="text-lg font-semibold text-gray-900">{t("providerSpace.servicesHeading", lang)}</h2>
              {data.services.length === 0 ? (
                <p className="mt-2 text-sm text-gray-600">{t("providerSpace.noServices", lang)}</p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {data.services.map((s) => (
                    <li key={s.id} className="rounded-xl border border-[var(--pawls-cream-100)] p-4">
                      <form method="post" action={`/api/services/${s.id}?redirect=/book/provider`} className="flex flex-wrap items-end gap-3">
                        <label className="text-xs text-gray-500">
                          {t("providerSpace.name", lang)}
                          <input name="name" defaultValue={s.name} className="mt-1 block rounded-lg border border-[var(--pawls-cream-200)] px-2 py-1 text-sm text-gray-900" />
                        </label>
                        <label className="text-xs text-gray-500">
                          {t("providerSpace.priceEuro", lang)}
                          <input name="price_euros" type="number" step="0.01" min="0.01" defaultValue={(s.price_cents / 100).toFixed(2)} className="mt-1 block w-24 rounded-lg border border-[var(--pawls-cream-200)] px-2 py-1 text-sm text-gray-900" />
                        </label>
                        <label className="text-xs text-gray-500">
                          {t("providerSpace.minutes", lang)}
                          <input name="duration_minutes" type="number" min="1" max="1440" defaultValue={s.duration_minutes} className="mt-1 block w-20 rounded-lg border border-[var(--pawls-cream-200)] px-2 py-1 text-sm text-gray-900" />
                        </label>
                        <button type="submit" className="rounded-full bg-[var(--pawls-terracotta-500)] px-4 py-2 text-xs font-semibold text-white">{t("providerSpace.save", lang)}</button>
                        <span className={`text-xs font-semibold ${s.is_active === false ? "text-gray-500" : "text-emerald-700"}`}>
                          {s.is_active === false ? t("providerSpace.inactive", lang) : t("providerSpace.active", lang)}
                        </span>
                      </form>
                      {s.is_active !== false && (
                        <form method="post" action={`/api/services/${s.id}/deactivate?redirect=/book/provider`} className="mt-2">
                          <button type="submit" className="rounded-full border border-red-200 bg-red-50 px-4 py-1.5 text-xs font-semibold text-red-700">
                            {t("providerSpace.deactivate", lang)}
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
              <h2 className="text-lg font-semibold text-gray-900">{t("providerSpace.incomingHeading", lang)}</h2>
              {data.bookings.length === 0 ? (
                <p className="mt-2 text-sm text-gray-600">{t("providerSpace.noBookings", lang)}</p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {data.bookings.map((b) => (
                    <li key={b.id} className="rounded-xl border border-[var(--pawls-cream-100)] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="text-sm text-gray-700">
                          <p className="font-semibold text-gray-900">
                            {fill(t("providerSpace.bookingLine", lang), {
                              date: b.booking_date,
                              time: b.start_time,
                              service: b.service_name ?? t("providerSpace.serviceFallback", lang),
                            })}
                          </p>
                          <p className="text-xs text-gray-500">
                            {fill(t("providerSpace.bookingMeta", lang), {
                              id: b.id,
                              dog: b.dog_name ?? t("providerSpace.dogNotRecorded", lang),
                              customer: b.customer_name,
                            })}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="rounded-full bg-[var(--pawls-cream-100)] px-3 py-1 text-xs font-semibold text-[var(--pawls-gold-500)]">
                            {statusLabel(b.status, lang)}
                          </span>
                          <p className="mt-1 text-sm font-bold text-[var(--pawls-terracotta-500)]">{eur(b.price_cents, lang)}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3">
                        {b.status === "paid" && (
                          <form method="post" action={`/api/bookings/${b.id}/complete?redirect=/book/provider`}>
                            <button type="submit" className="rounded-full bg-[var(--pawls-terracotta-500)] px-4 py-2 text-xs font-semibold text-white">{t("providerSpace.markComplete", lang)}</button>
                          </form>
                        )}
                        {b.status === "pending_payment" && (
                          <p className="text-xs text-gray-500">{t("providerSpace.awaitingPayment", lang)}</p>
                        )}
                        {(b.status === "pending_payment" || b.status === "paid") && (
                          <form method="post" action={`/api/bookings/${b.id}/cancel?redirect=/book/provider`}>
                            <button type="submit" className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">{t("providerSpace.cancel", lang)}</button>
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
      <AppFooter lang={lang} />
    </div>
  );
}
