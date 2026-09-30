/**
 * Booking API — native HTTP endpoints (pre-SSR, wired in serve.ts,
 * vercel-entry.ts and the Vite dev plugin, the same proven pattern as
 * auth-handler.ts / provider-api-handler.ts).
 *
 * Why native: the booking lifecycle must answer real HTTP status codes —
 * 401 unauthenticated, 403 CSRF / not-your-booking, 409 slot already taken (with
 * the French copy), 429 — and every mutation must be authorized from the SESSION,
 * never from the request body. A server function cannot express those codes, and
 * the batch-D1 brief requires them to be enforceable server-side with no
 * client-side entitlement.
 *
 * Endpoints:
 *   GET  /api/bookings/availability?providerId=..&date=YYYY-MM-DD   (public view)
 *   POST /api/bookings/availability        provider owner replaces availability
 *   POST /api/bookings                     create a booking (customer, session)
 *   GET  /api/bookings/mine                the caller's own bookings
 *   GET  /api/bookings/provider            the caller's provider's bookings
 *   GET  /api/bookings/:id                 one booking (customer or provider owner)
 *   POST /api/bookings/:id/cancel          customer or provider cancel (policy)
 *   POST /api/bookings/:id/complete        provider owner marks paid booking done
 *   POST /api/services/:id                 provider owner edits a service
 *   POST /api/services/:id/deactivate      provider owner deactivates a service
 *
 * Every mutating endpoint runs CSRF (Origin/Referer must match the host) BEFORE
 * authentication, and every response is controlled JSON — or a 303 redirect back
 * to the dashboard for plain browser form posts (`Accept: text/html`), so the
 * surfaces work without JavaScript. DB failures degrade to an honest 503 and
 * nothing reports success for work that did not happen.
 */
import { requireUser, getAuthUser } from "./src/lib/auth/authz";
import { assertSameOrigin } from "./src/lib/auth/csrf";
import {
  availabilityView,
  bookingForActor,
  cancelBookingForActor,
  completeBookingForActor,
  createBookingForActor,
  customerBookings,
  editOwnedService,
  getBookableProvider,
  getOwnedProvider,
  ownedServices,
  providerAvailability,
  providerBookings,
  setProviderAvailability,
  validateAvailability,
  type CoreError,
} from "./src/lib/booking-core";

const NO_STORE = "no-store, max-age=0, must-revalidate";

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": NO_STORE, ...extraHeaders },
  });
}

/** Wants an HTML answer (a plain browser form post) rather than JSON? */
function wantsHtml(request: Request): boolean {
  const accept = (request.headers.get("accept") ?? "").toLowerCase();
  return accept.includes("text/html");
}

const SAFE_REDIRECTS = new Set(["/book/my-bookings", "/book/provider", "/book"]);

/** Plain <form> posts get a 303 back to the surface; fetch/API calls get JSON. */
function result(request: Request, ok: boolean, code: string, status: number, payload: Record<string, unknown>): Response {
  if (wantsHtml(request)) {
    const requested = new URL(request.url).searchParams.get("redirect") ?? "";
    const target = SAFE_REDIRECTS.has(requested)
      ? requested
      : payload.role === "provider"
        ? "/book/provider"
        : "/book/my-bookings";
    const qs = ok ? `ok=${encodeURIComponent(code)}` : `error=${encodeURIComponent(code)}`;
    return new Response(null, {
      status: 303,
      headers: { Location: `${target}?${qs}`, "Cache-Control": NO_STORE },
    });
  }
  return json({ ok, ...(ok ? {} : { error: code }), ...payload }, status);
}

function coreError(request: Request, err: CoreError, role: "customer" | "provider"): Response {
  if (wantsHtml(request)) {
    const requested = new URL(request.url).searchParams.get("redirect") ?? "";
    const target = SAFE_REDIRECTS.has(requested) ? requested : role === "provider" ? "/book/provider" : "/book/my-bookings";
    return new Response(null, {
      status: 303,
      headers: { Location: `${target}?error=${encodeURIComponent(err.code)}`, "Cache-Control": NO_STORE },
    });
  }
  return json({ ok: false, error: err.code, message: err.message, messageFr: err.messageFr }, err.status);
}

function badJson(message: string, status = 400): Response {
  return json({ ok: false, error: "BAD_REQUEST", message }, status);
}

/** Read a JSON or form-encoded body into a plain object. */
async function readBody(request: Request): Promise<Record<string, unknown>> {
  const ct = (request.headers.get("content-type") ?? "").toLowerCase();
  if (ct.includes("application/json")) {
    try {
      const parsed = await request.json();
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  try {
    const form = await request.formData();
    const out: Record<string, unknown> = {};
    for (const key of form.keys()) {
      const val = form.get(key);
      out[key] = val instanceof File ? String(val.name) : val;
    }
    return out;
  } catch {
    return {};
  }
}

/** Plain <form> posts send day_D_start / day_D_end pairs; API clients send `windows`. */
function windowsFromForm(body: Record<string, unknown>): { day_of_week: number; start_time: string; end_time: string }[] {
  const out: { day_of_week: number; start_time: string; end_time: string }[] = [];
  for (let dow = 0; dow <= 6; dow++) {
    const start = String(body[`day_${dow}_start`] ?? "").trim();
    const end = String(body[`day_${dow}_end`] ?? "").trim();
    // An empty day means "not bookable that day" — it is never filled in for you.
    if (!start || !end) continue;
    out.push({ day_of_week: dow, start_time: start.slice(0, 5), end_time: end.slice(0, 5) });
  }
  return out;
}

export async function handleBookingApi(request: Request): Promise<Response> {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return badJson("bad request", 400);
  }
  const pathname = url.pathname;
  const method = request.method.toUpperCase();
  const mutating = method === "POST";

  // ── CSRF first: a cross-site POST never reaches auth or the database ───────
  if (mutating) {
    const csrf = assertSameOrigin(request);
    if (!csrf.ok) return json({ ok: false, error: "CSRF_BLOCKED", message: "Cross-site request blocked." }, 403);
  }

  // ── Public: availability view for one provider + date ─────────────────────
  if (pathname === "/api/bookings/availability" && method === "GET") {
    const providerId = Number(url.searchParams.get("providerId"));
    const date = String(url.searchParams.get("date") ?? "").slice(0, 10);
    if (!Number.isSafeInteger(providerId) || providerId <= 0) return badJson("providerId is required");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return badJson("date (YYYY-MM-DD) is required");
    try {
      const provider = await getBookableProvider(providerId);
      if (!provider) {
        return json({ ok: false, error: "PROVIDER_NOT_BOOKABLE", message: "This provider is not available for bookings." }, 403);
      }
      const view = await availabilityView(providerId, date);
      return json({ ok: true, providerId, ...view });
    } catch (err) {
      console.error("[booking-api] availability view failed", err);
      return json({ ok: false, error: "DB_UNAVAILABLE", message: "Unavailable" }, 503);
    }
  }

  // ── Provider owner: replace availability ──────────────────────────────────
  if (pathname === "/api/bookings/availability" && method === "POST") {
    const auth = await requireUser(request);
    if (!auth.ok) return json({ ok: false, error: auth.code, message: auth.message }, auth.status);
    const body = await readBody(request);
    const providerId = Number(body.providerId);
    if (!Number.isSafeInteger(providerId) || providerId <= 0) return badJson("providerId is required");
    const validated = validateAvailability(body.windows === undefined ? windowsFromForm(body) : body.windows);
    if (!validated.ok) return coreError(request, validated, "provider");
    try {
      const owned = await getOwnedProvider(auth.user.id);
      if (!owned || Number(owned.id) !== providerId) {
        return json(
          { ok: false, error: "FORBIDDEN", message: "This provider is not yours.", messageFr: "Ce prestataire n'est pas le vôtre." },
          403,
        );
      }
      const windows = await setProviderAvailability(providerId, validated.value);
      return result(request, true, "availability_saved", 200, { role: "provider", providerId, windows });
    } catch (err) {
      console.error("[booking-api] availability save failed", err);
      return json({ ok: false, error: "DB_UNAVAILABLE", message: "We couldn't save availability. Nothing was changed." }, 503);
    }
  }

  // ── Create a booking (customer, session identity) ─────────────────────────
  if (pathname === "/api/bookings" && method === "POST") {
    const auth = await requireUser(request);
    if (!auth.ok) return json({ ok: false, error: auth.code, message: auth.message }, auth.status);
    const body = await readBody(request);
    const created = await createBookingForActor(
      { userId: auth.user.id, email: auth.user.email, name: auth.user.name },
      {
        providerId: Number(body.providerId),
        serviceId: Number(body.serviceId),
        dogId: body.dogId === undefined || body.dogId === "" ? null : Number(body.dogId),
        customerName: body.customerName === undefined ? undefined : String(body.customerName),
        customerEmail: body.customerEmail === undefined ? undefined : String(body.customerEmail),
        date: String(body.date ?? ""),
        time: String(body.time ?? ""),
      },
    );
    if (!created.ok) return coreError(request, created, "customer");
    return result(request, true, "booking_created", 201, { role: "customer", booking: created.booking });
  }

  // ── Customer: own bookings ────────────────────────────────────────────────
  if (pathname === "/api/bookings/mine" && method === "GET") {
    const auth = await requireUser(request);
    if (!auth.ok) return json({ ok: false, error: auth.code, message: auth.message }, auth.status);
    try {
      const bookings = await customerBookings(auth.user.id);
      return json({ ok: true, bookings });
    } catch (err) {
      console.error("[booking-api] my bookings failed", err);
      return json({ ok: false, error: "DB_UNAVAILABLE", message: "Unavailable" }, 503);
    }
  }

  // ── Provider owner: incoming bookings + services + availability ────────────
  if (pathname === "/api/bookings/provider" && method === "GET") {
    const auth = await requireUser(request);
    if (!auth.ok) return json({ ok: false, error: auth.code, message: auth.message }, auth.status);
    try {
      const owned = await getOwnedProvider(auth.user.id);
      if (!owned) {
        return json({ ok: true, providerId: null, providerName: null, bookings: [], services: [], availability: [] });
      }
      const incoming = await providerBookings(auth.user.id);
      return json({
        ok: true,
        providerId: incoming.providerId,
        providerName: incoming.providerName,
        approvalStatus: owned.approval_status,
        bookings: incoming.bookings,
        services: await ownedServices(auth.user.id),
        availability: await providerAvailability(incoming.providerId ?? owned.id),
      });
    } catch (err) {
      console.error("[booking-api] provider bookings failed", err);
      return json({ ok: false, error: "DB_UNAVAILABLE", message: "Unavailable" }, 503);
    }
  }

  // ── One booking: customer or provider owner only ──────────────────────────
  const member = pathname.match(/^\/api\/bookings\/(\d+)(?:\/(cancel|complete))?$/);
  if (member) {
    const bookingId = Number(member[1]);
    const action = member[2] ?? null;
    const auth = await requireUser(request);
    if (!auth.ok) return json({ ok: false, error: auth.code, message: auth.message }, auth.status);

    if (!action && method === "GET") {
      try {
        const booking = await bookingForActor(auth.user.id, bookingId);
        if (!booking) {
          // Existence is not disclosed: someone else's booking is simply not yours.
          return json(
            { ok: false, error: "FORBIDDEN", message: "This booking is not yours.", messageFr: "Cette réservation n'est pas la vôtre." },
            403,
          );
        }
        return json({ ok: true, booking });
      } catch (err) {
        console.error("[booking-api] booking read failed", err);
        return json({ ok: false, error: "DB_UNAVAILABLE", message: "Unavailable" }, 503);
      }
    }

    if (action === "cancel" && method === "POST") {
      try {
        const done = await cancelBookingForActor(auth.user.id, bookingId);
        if (!done.ok) return coreError(request, done, done.status === 403 ? "provider" : "customer");
        return result(request, true, "booking_cancelled", 200, { booking: done.booking });
      } catch (err) {
        console.error("[booking-api] cancel failed", err);
        return json({ ok: false, error: "DB_UNAVAILABLE", message: "We couldn't cancel. Nothing was changed." }, 503);
      }
    }

    if (action === "complete" && method === "POST") {
      try {
        const done = await completeBookingForActor(auth.user.id, bookingId);
        if (!done.ok) return coreError(request, done, "provider");
        return result(request, true, "booking_completed", 200, { role: "provider", booking: done.booking });
      } catch (err) {
        console.error("[booking-api] complete failed", err);
        return json({ ok: false, error: "DB_UNAVAILABLE", message: "We couldn't complete. Nothing was changed." }, 503);
      }
    }

    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  // ── Provider owner: service edit / deactivate ─────────────────────────────
  const service = pathname.match(/^\/api\/services\/(\d+)(?:\/(deactivate))?$/);
  if (service && method === "POST") {
    const auth = await requireUser(request);
    if (!auth.ok) return json({ ok: false, error: auth.code, message: auth.message }, auth.status);
    const serviceId = Number(service[1]);
    const deactivate = service[2] === "deactivate";
    const body = deactivate ? {} : await readBody(request);
    const input = deactivate
      ? { is_active: false }
      : {
          ...(body.name === undefined ? {} : { name: body.name }),
          // The dashboard form sends euros; the API may send cents. Never both.
          ...(body.price_cents === undefined
            ? body.price_euros === undefined
              ? {}
              : { price_cents: Math.round(Number(body.price_euros) * 100) }
            : { price_cents: body.price_cents }),
          ...(body.duration_minutes === undefined ? {} : { duration_minutes: body.duration_minutes }),
          ...(body.is_active === undefined ? {} : { is_active: body.is_active }),
        };
    try {
      const done = await editOwnedService(auth.user.id, serviceId, input);
      if (!done.ok) return coreError(request, done, "provider");
      return result(request, true, deactivate ? "service_deactivated" : "service_updated", 200, {
        role: "provider",
        service: done.service,
      });
    } catch (err) {
      console.error("[booking-api] service edit failed", err);
      return json({ ok: false, error: "DB_UNAVAILABLE", message: "We couldn't update the service. Nothing was changed." }, 503);
    }
  }

  return json({ ok: false, error: "NOT_FOUND" }, 404);
}

/** Session lookup used by the SSR surfaces (never trusts a client user id). */
export async function currentBookingActor(request: Request) {
  return getAuthUser(request);
}
