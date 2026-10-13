/**
 * Book core — the ONLY place a booking is created, cancelled, completed, and
 * the ONLY place provider availability / service edits are validated.
 *
 * Rules enforced here (P1 batch D1, owner-ratified 2026-09-28):
 *   - A booking is created ONLY by an authenticated user, bound to the session's
 *     `customer_user_id`; the price/currency snapshot still comes from the
 *     `services` row server-side (never from the client).
 *   - REAL-ONLY eligibility: the provider must be approved, non-demo, OWNED
 *     (`owner_user_id IS NOT NULL`) and its owner must be a real (non-test)
 *     user — the exact clause used by the /book directory counter. A legacy
 *     unowned "approved" row can never be booked, not even by a hand-made POST.
 *   - Slots come from `provider_availability` (migration 009). A provider with
 *     no availability rows has NO bookable slots: we say so honestly, we never
 *     invent a time window.
 *   - The slot is guarded server-side by a UNIQUE index on
 *     (provider_id, booking_date, start_time) over live bookings; a collision
 *     answers 409 with the French copy "Ce créneau vient d'être réservé".
 *   - Lifecycle transitions check ownership AND the state machine:
 *       customer  -> may cancel their own unpaid pending booking
 *       provider  -> may complete/cancel a booking of their OWN provider,
 *                    and only a PAID booking can be completed.
 *   - Every state change is audit-logged. Nothing ever reports success for work
 *     that did not happen.
 */
import { sql } from "../db";
import { writeAudit } from "./auth/ensure";
import {
  notifyBookingCancelled,
  notifyBookingCompleted,
  notifyBookingCreated,
  type EmailOutcome,
} from "./booking-emails";

export interface CoreError {
  ok: false;
  status: number;
  code: string;
  /** English message (the caller picks the locale it renders). */
  message: string;
  /** French message. */
  messageFr: string;
}

export function fail(status: number, code: string, message: string, messageFr: string): CoreError {
  return { ok: false, status, code, message, messageFr };
}

/** Bookings in these states hold their slot. Cancelled/refunded/failed do not. */
export const LIVE_BOOKING_STATUSES = ["pending_payment", "paid", "completed"] as const;

/** Slots are generated on this granularity, inside the provider's windows. */
export const SLOT_MINUTES = 30;

/**
 * Pre-migration safety net (repo pattern, see src/lib/provider-core.ts).
 * Migration 009 is the CANONICAL definition. This is additive and idempotent so
 * the booking endpoints also work on a database where the migration has not been
 * recorded yet. The unique index is created best-effort: on a database that
 * already contains live duplicate slots the index cannot exist, and a missing
 * index must never take the whole booking flow down (the pre-insert check below
 * still refuses the obvious collision).
 */
let bookingCoreSchemaEnsured = false;
export async function ensureBookingCoreSchema(): Promise<void> {
  if (bookingCoreSchemaEnsured) return;
  await sql()`
    CREATE TABLE IF NOT EXISTS provider_availability (
      id SERIAL PRIMARY KEY,
      provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CHECK (end_time > start_time)
    )
  `;
  await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dog_id INTEGER`;
  await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`;
  await sql()`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`;
  try {
    await sql()`
      CREATE UNIQUE INDEX IF NOT EXISTS provider_availability_window_key
        ON provider_availability (provider_id, day_of_week, start_time)
    `;
    await sql()`
      CREATE UNIQUE INDEX IF NOT EXISTS bookings_provider_slot_live_key
        ON bookings (provider_id, booking_date, start_time)
        WHERE status IN ('pending_payment', 'paid', 'completed')
    `;
  } catch (err) {
    console.warn(
      "[booking-core] unique booking/availability index missing (live duplicate rows?) — pre-insert slot check still active",
      err,
    );
  }
  bookingCoreSchemaEnsured = true;
}

// ── provider eligibility (REAL only) ────────────────────────────────────────
export interface BookableProvider {
  id: number;
  name: string;
  owner_user_id: number;
}

/**
 * The public/booking eligibility clause, identical to countRealProviders():
 * approved AND not demo AND owner-bound AND the owner is a real (non-test) user.
 * Returns null for anything else — unowned legacy rows included.
 */
export async function getBookableProvider(providerId: number): Promise<BookableProvider | null> {
  const pid = Number(providerId);
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  const rows = (await sql()`
    SELECT p.id, p.name, p.owner_user_id
    FROM providers p
    JOIN users u ON u.id = p.owner_user_id
    WHERE p.id = ${pid}
      AND p.is_demo = false
      AND p.approval_status = 'approved'
      AND p.owner_user_id IS NOT NULL
      AND u.is_test = false
    LIMIT 1
  `) as unknown as BookableProvider[];
  return rows?.[0] ?? null;
}

/** The provider row OWNED by `ownerUserId` (any approval status), or null. */
export async function getOwnedProvider(ownerUserId: number): Promise<{ id: number; name: string; approval_status: string } | null> {
  const rows = (await sql()`
    SELECT id, name, approval_status
    FROM providers
    WHERE owner_user_id = ${Number(ownerUserId)} AND is_demo = false
    ORDER BY id DESC
    LIMIT 1
  `) as unknown as { id: number; name: string; approval_status: string }[];
  return rows?.[0] ?? null;
}

// ── availability ────────────────────────────────────────────────────────────
export interface AvailabilityWindow {
  day_of_week: number;
  start_time: string; // HH:MM
  end_time: string; // HH:MM
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

/** Minutes since midnight for an HH:MM string. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m);
}

export function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Validate + normalize a full availability replacement. Max 7 days x 3 windows.
 * Returns an honest 400 for anything malformed.
 */
export function validateAvailability(raw: unknown): { ok: true; value: AvailabilityWindow[] } | CoreError {
  const list = Array.isArray(raw) ? raw : null;
  if (!list) {
    return fail(400, "AVAILABILITY_INVALID", "Availability must be a list of windows.", "Les disponibilités doivent être une liste de créneaux.");
  }
  if (list.length > 21) {
    return fail(400, "AVAILABILITY_TOO_MANY", "At most 21 windows (7 days x 3) are allowed.", "21 créneaux au maximum (7 jours x 3) sont autorisés.");
  }
  const out: AvailabilityWindow[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    const w = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const dow = Number(w.day_of_week);
    const start = String(w.start_time ?? "").trim().slice(0, 5);
    const end = String(w.end_time ?? "").trim().slice(0, 5);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
      return fail(400, "AVAILABILITY_DAY_INVALID", "day_of_week must be 0 (Sunday) to 6 (Saturday).", "day_of_week doit être entre 0 (dimanche) et 6 (samedi).");
    }
    if (!isValidTime(start) || !isValidTime(end)) {
      return fail(400, "AVAILABILITY_TIME_INVALID", "Times must use the HH:MM 24-hour format.", "Les horaires doivent utiliser le format HH:MM (24 h).");
    }
    if (minutesOf(end) - minutesOf(start) < SLOT_MINUTES) {
      return fail(400, "AVAILABILITY_WINDOW_TOO_SHORT", "A window must be at least 30 minutes long.", "Un créneau doit durer au moins 30 minutes.");
    }
    const key = `${dow}/${start}`;
    if (seen.has(key)) {
      return fail(400, "AVAILABILITY_DUPLICATE", "Two windows start at the same time on the same day.", "Deux créneaux commencent à la même heure le même jour.");
    }
    seen.add(key);
    out.push({ day_of_week: dow, start_time: start, end_time: end });
  }
  return { ok: true, value: out };
}

/**
 * Replace a provider's availability with `windows` (owner-bound, caller has
 * already checked ownership). Returns the stored rows.
 */
export async function setProviderAvailability(providerId: number, windows: AvailabilityWindow[]): Promise<AvailabilityWindow[]> {
  await ensureBookingCoreSchema();
  await sql()`DELETE FROM provider_availability WHERE provider_id = ${Number(providerId)}`;
  for (const w of windows) {
    await sql()`
      INSERT INTO provider_availability (provider_id, day_of_week, start_time, end_time)
      VALUES (${Number(providerId)}, ${w.day_of_week}, ${w.start_time}::time, ${w.end_time}::time)
    `;
  }
  return providerAvailability(providerId);
}

/** Stored availability windows for a provider (may be empty). */
export async function providerAvailability(providerId: number): Promise<AvailabilityWindow[]> {
  await ensureBookingCoreSchema();
  const rows = (await sql()`
    SELECT day_of_week, to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time
    FROM provider_availability
    WHERE provider_id = ${Number(providerId)}
    ORDER BY day_of_week, start_time
  `) as unknown as AvailabilityWindow[];
  return rows.map((r) => ({
    day_of_week: Number(r.day_of_week),
    start_time: String(r.start_time),
    end_time: String(r.end_time),
  }));
}

/** Day of week (0=Sunday..6=Saturday) for a YYYY-MM-DD string, UTC-safe. */
export function weekdayOf(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T12:00:00Z`);
  if (isNaN(d.getTime())) return null;
  return d.getUTCDay();
}

/**
 * Slots for one date = every 30-minute step that fits inside a window for that
 * weekday (a slot must be fully inside the window). No availability rows => no
 * slots at all, and `availabilitySet: false` so the UI can say so honestly.
 */
export function slotsForDate(windows: AvailabilityWindow[], date: string): string[] {
  const dow = weekdayOf(date);
  if (dow === null) return [];
  const slots: string[] = [];
  for (const w of windows) {
    if (Number(w.day_of_week) !== dow) continue;
    const start = minutesOf(w.start_time);
    const end = minutesOf(w.end_time);
    for (let m = start; m + SLOT_MINUTES <= end; m += SLOT_MINUTES) slots.push(hhmm(m));
  }
  return [...new Set(slots)].sort();
}

export interface AvailabilityView {
  availabilitySet: boolean;
  windows: AvailabilityWindow[];
  date: string;
  slots: string[];
  /** Slots already held by a live booking (never hidden from the customer). */
  takenSlots: string[];
}

/** Public availability view for a provider + date (no user data). */
export async function availabilityView(providerId: number, date: string): Promise<AvailabilityView> {
  const windows = await providerAvailability(providerId);
  const slots = slotsForDate(windows, date);
  let taken: string[] = [];
  if (slots.length) {
    const rows = (await sql()`
      SELECT to_char(start_time, 'HH24:MI') AS start_time
      FROM bookings
      WHERE provider_id = ${Number(providerId)}
        AND booking_date = ${date}::date
        AND status IN ('pending_payment', 'paid', 'completed')
    `) as unknown as { start_time: string }[];
    taken = rows.map((r) => String(r.start_time));
  }
  return {
    availabilitySet: windows.length > 0,
    windows,
    date,
    slots: slots.filter((s) => !taken.includes(s)),
    takenSlots: taken,
  };
}

// ── booking creation ────────────────────────────────────────────────────────
export interface BookingCreationInput {
  providerId: number;
  serviceId: number;
  dogId?: number | null;
  customerName?: string;
  customerEmail?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
}

export interface CreatedBooking {
  id: number;
  provider_id: number;
  service_id: number;
  dog_id: number | null;
  service_name: string;
  provider_name: string;
  date: string;
  time: string;
  price_cents: number;
  currency: string;
  status: string;
  payment_status: string;
  /**
   * Honest per-recipient email outcome (batch D2): 'sent' (Resend accepted),
   * 'test' (no RESEND_API_KEY — nothing was sent, logged to mail_log) or
   * 'failed'. Never 'sent' unless the provider really accepted the message.
   */
  notifications?: { customer: EmailOutcome; provider: EmailOutcome };
}

export type CreateBookingResult = { ok: true; status: 201; booking: CreatedBooking } | CoreError;

export interface BookingActor {
  userId: number;
  email: string;
  name: string;
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string; cause?: { code?: string } } | null;
  const code = e?.code ?? e?.cause?.code;
  if (code === "23505") return true;
  const msg = `${e?.message ?? ""}`;
  return /duplicate key value|unique constraint|unique index/i.test(msg);
}

/**
 * Create a booking. The caller must be authenticated (actor comes from the
 * session, never from the request body).
 */
export async function createBookingForActor(actor: BookingActor, input: BookingCreationInput): Promise<CreateBookingResult> {
  await ensureBookingCoreSchema();

  const providerId = Number(input.providerId);
  const serviceId = Number(input.serviceId);

  // Provider must be REAL, approved supply — the same clause as the directory.
  const provider = await getBookableProvider(providerId);
  if (!provider) {
    return fail(
      403,
      "PROVIDER_NOT_BOOKABLE",
      "This provider is not available for bookings.",
      "Ce prestataire n'est pas disponible à la réservation.",
    );
  }

  // Email: the customer's own account email unless they gave one.
  const customerEmail = String(input.customerEmail ?? "").trim() || actor.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return fail(400, "EMAIL_INVALID", "Enter a valid email address.", "Saisissez une adresse email valide.");
  }
  const customerName = String(input.customerName ?? "").trim().slice(0, 120) || actor.name;

  // Date: today .. +30 days (same window as the form and as migration 006's UI).
  const date = String(input.date ?? "").trim();
  const bookingDate = new Date(`${date}T00:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(bookingDate.getTime())) {
    return fail(400, "DATE_INVALID", "Enter a valid date.", "Saisissez une date valide.");
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 30);
  if (bookingDate < today) {
    return fail(400, "DATE_PAST", "The booking date must be today or later.", "La date doit être aujourd'hui ou plus tard.");
  }
  if (bookingDate > maxDate) {
    return fail(400, "DATE_TOO_FAR", "The booking date must be within the next 30 days.", "La date doit être dans les 30 prochains jours.");
  }

  // Time: HH:MM on the 30-minute grid.
  const time = String(input.time ?? "").trim().slice(0, 5);
  if (!isValidTime(time)) {
    return fail(400, "TIME_INVALID", "Enter a valid time (HH:MM).", "Saisissez une heure valide (HH:MM).");
  }
  if (minutesOf(time) % SLOT_MINUTES !== 0) {
    return fail(400, "TIME_GRID", "Times are booked in 30-minute steps.", "Les réservations se font par pas de 30 minutes.");
  }

  // Service: belongs to the provider and is active. Price snapshot from HERE.
  const services = (await sql()`
    SELECT id, name, provider_id, price_cents, currency, is_active
    FROM services WHERE id = ${serviceId}
  `) as unknown as {
    id: number;
    name: string;
    provider_id: number;
    price_cents: number | null;
    currency: string | null;
    is_active: boolean | null;
  }[];
  const service = services?.[0];
  if (!service) {
    return fail(404, "SERVICE_NOT_FOUND", "Service not found.", "Prestation introuvable.");
  }
  if (Number(service.provider_id) !== providerId) {
    return fail(400, "SERVICE_PROVIDER_MISMATCH", "This service does not belong to that provider.", "Cette prestation n'appartient pas à ce prestataire.");
  }
  if (service.is_active !== true && String(service.is_active) !== "true") {
    return fail(409, "SERVICE_INACTIVE", "This service is not currently available.", "Cette prestation n'est pas disponible actuellement.");
  }
  const priceCents = Number(service.price_cents);
  const currency = String(service.currency ?? "EUR").toUpperCase();
  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    return fail(409, "SERVICE_PRICE_INVALID", "This service has an invalid price.", "Cette prestation a un prix invalide.");
  }

  // Dog: the customer picks one of THEIR OWN dogs. Never another user's dog.
  const dogId = input.dogId === null || input.dogId === undefined || input.dogId === "" ? null : Number(input.dogId);
  if (!Number.isSafeInteger(dogId) || (dogId as number) <= 0) {
    return fail(400, "DOG_REQUIRED", "Choose one of your dogs for this booking.", "Choisissez l'un de vos chiens pour cette réservation.");
  }
  const dogs = (await sql()`
    SELECT id, dog_name FROM dog_profiles
    WHERE id = ${dogId as number} AND user_id = ${Number(actor.userId)} AND is_demo = false
    LIMIT 1
  `) as unknown as { id: number; dog_name: string | null }[];
  if (!dogs?.length) {
    return fail(
      403,
      "DOG_NOT_OWNED",
      "That dog is not on your account.",
      "Ce chien n'est pas rattaché à votre compte.",
    );
  }

  // Availability: the provider's OWN windows are the source of truth. No rows
  // means no bookable slots yet — never an invented time.
  const windows = await providerAvailability(providerId);
  if (windows.length === 0) {
    return fail(
      409,
      "NO_AVAILABILITY",
      "This provider has not published availability yet.",
      "Ce prestataire n'a pas encore publié ses disponibilités.",
    );
  }
  const slots = slotsForDate(windows, date);
  if (!slots.includes(time)) {
    return fail(
      409,
      "SLOT_OUTSIDE_AVAILABILITY",
      "That time is outside the provider's availability.",
      "Cet horaire est en dehors des disponibilités du prestataire.",
    );
  }

  // Explicit pre-check: an honest 409 before we even try to insert. The UNIQUE
  // index below is what makes this race-proof.
  const clash = (await sql()`
    SELECT id FROM bookings
    WHERE provider_id = ${providerId} AND booking_date = ${date}::date AND start_time = ${time}::time
      AND status IN ('pending_payment', 'paid', 'completed')
    LIMIT 1
  `) as unknown as { id: number }[];
  if (clash?.length) {
    return fail(409, "SLOT_TAKEN", "That slot was just booked.", "Ce créneau vient d'être réservé");
  }

  try {
    const inserted = (await sql()`
      INSERT INTO bookings (
        provider_id, service_id, dog_id, customer_name, customer_email, booking_date, start_time,
        status, customer_user_id, price_cents, currency, payment_status, cancellation_status
      )
      VALUES (
        ${providerId}, ${serviceId}, ${dogId as number}, ${customerName}, ${customerEmail},
        ${date}::date, ${time}::time,
        'pending_payment', ${Number(actor.userId)}, ${priceCents}, ${currency}, 'unpaid', 'none'
      )
      RETURNING id
    `) as unknown as { id: number }[];

    const bookingId = Number(inserted?.[0]?.id);
    if (!bookingId) {
      return fail(500, "BOOKING_INSERT_FAILED", "We couldn't save your booking. Nothing was charged.", "Nous n'avons pas pu enregistrer votre réservation. Rien n'a été débité.");
    }

    writeAudit(Number(actor.userId), "booking_created", {
      booking_id: bookingId,
      provider_id: providerId,
      service_id: serviceId,
      dog_id: dogId,
      date,
      time,
      price_cents: priceCents,
      currency,
    });

    // Transactional emails (batch D2): (a) customer receipt, (b) provider
    // notification. Contained — a mail problem never fails the booking, and the
    // honest outcome is returned to the caller (never a claimed delivery).
    const notifications = await notifyBookingCreated(providerId, {
      id: bookingId,
      providerName: String(provider.name ?? ""),
      serviceName: service.name === null || service.name === undefined ? null : String(service.name),
      date,
      time,
      priceCents,
      currency,
      status: "pending_payment",
      paymentStatus: "unpaid",
      dogName: dogs[0]?.dog_name === null || dogs[0]?.dog_name === undefined ? null : String(dogs[0].dog_name),
      customerName,
      customerEmail,
      customerUserId: Number(actor.userId),
      customerLang: null,
      providerOwnerUserId: provider.owner_user_id === null ? null : Number(provider.owner_user_id),
    });

    return {
      ok: true,
      status: 201,
      booking: {
        id: bookingId,
        provider_id: providerId,
        service_id: serviceId,
        dog_id: dogId as number,
        service_name: String(service.name ?? ""),
        provider_name: String(provider.name ?? ""),
        date,
        time,
        price_cents: priceCents,
        currency,
        status: "pending_payment",
        payment_status: "unpaid",
        notifications,
      },
    };
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Two requests raced for the same slot: the index refused the loser.
      return fail(409, "SLOT_TAKEN", "That slot was just booked.", "Ce créneau vient d'être réservé");
    }
    console.error("[booking-core] createBookingForActor failed", err);
    return fail(
      503,
      "DB_UNAVAILABLE",
      "We couldn't save your booking right now. Nothing was created.",
      "Nous n'avons pas pu enregistrer votre réservation. Rien n'a été créé.",
    );
  }
}

// ── lifecycle ───────────────────────────────────────────────────────────────
export interface BookingRow {
  id: number;
  provider_id: number;
  provider_name: string;
  provider_owner_user_id: number | null;
  service_id: number;
  service_name: string | null;
  dog_id: number | null;
  dog_name: string | null;
  customer_user_id: number | null;
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
}

const BOOKING_SELECT = `
  SELECT b.id, b.provider_id, p.name AS provider_name, p.owner_user_id AS provider_owner_user_id,
         b.service_id, s.name AS service_name, b.dog_id, d.dog_name,
         b.customer_user_id, b.customer_name, b.customer_email,
         to_char(b.booking_date, 'YYYY-MM-DD') AS booking_date,
         to_char(b.start_time, 'HH24:MI') AS start_time,
         b.status, b.payment_status, b.cancellation_status, b.price_cents, b.currency,
         b.completed_at::text AS completed_at, b.cancelled_at::text AS cancelled_at,
         b.created_at::text AS created_at
  FROM bookings b
  LEFT JOIN providers p ON p.id = b.provider_id
  LEFT JOIN services s ON s.id = b.service_id
  LEFT JOIN dog_profiles d ON d.id = b.dog_id
`;

function normalizeBooking(r: Record<string, unknown>): BookingRow {
  return {
    id: Number(r.id),
    provider_id: Number(r.provider_id),
    provider_name: String(r.provider_name ?? ""),
    provider_owner_user_id: r.provider_owner_user_id === null || r.provider_owner_user_id === undefined ? null : Number(r.provider_owner_user_id),
    service_id: Number(r.service_id),
    service_name: r.service_name === null || r.service_name === undefined ? null : String(r.service_name),
    dog_id: r.dog_id === null || r.dog_id === undefined ? null : Number(r.dog_id),
    dog_name: r.dog_name === null || r.dog_name === undefined ? null : String(r.dog_name),
    customer_user_id: r.customer_user_id === null || r.customer_user_id === undefined ? null : Number(r.customer_user_id),
    customer_name: String(r.customer_name ?? ""),
    customer_email: String(r.customer_email ?? ""),
    booking_date: String(r.booking_date ?? ""),
    start_time: String(r.start_time ?? ""),
    status: String(r.status ?? ""),
    payment_status: String(r.payment_status ?? ""),
    cancellation_status: String(r.cancellation_status ?? ""),
    price_cents: r.price_cents === null || r.price_cents === undefined ? null : Number(r.price_cents),
    currency: String(r.currency ?? "EUR"),
    completed_at: r.completed_at ? String(r.completed_at) : null,
    cancelled_at: r.cancelled_at ? String(r.cancelled_at) : null,
    created_at: String(r.created_at ?? ""),
  };
}

/** Bookings where the actor is the customer (their own bookings only). */
export async function customerBookings(userId: number): Promise<BookingRow[]> {
  await ensureBookingCoreSchema();
  const rows = (await sql().query(`${BOOKING_SELECT} WHERE b.customer_user_id = $1 ORDER BY b.booking_date DESC, b.start_time DESC, b.id DESC LIMIT 100`, [
    Number(userId),
  ])) as unknown as Record<string, unknown>[];
  return rows.map(normalizeBooking);
}

/** Incoming bookings for the provider owned by `ownerUserId` (their own only). */
export async function providerBookings(ownerUserId: number): Promise<{ providerId: number | null; providerName: string | null; bookings: BookingRow[] }> {
  await ensureBookingCoreSchema();
  const owned = (await sql()`
    SELECT id, name FROM providers WHERE owner_user_id = ${Number(ownerUserId)} AND is_demo = false ORDER BY id DESC
  `) as unknown as { id: number; name: string }[];
  if (!owned?.length) return { providerId: null, providerName: null, bookings: [] };
  const ids = owned.map((o) => Number(o.id));
  const rows = (await sql().query(`${BOOKING_SELECT} WHERE b.provider_id = ANY($1) ORDER BY b.booking_date DESC, b.start_time DESC, b.id DESC LIMIT 200`, [ids])) as unknown as Record<string, unknown>[];
  return { providerId: Number(owned[0].id), providerName: String(owned[0].name ?? ""), bookings: rows.map(normalizeBooking) };
}

/** One booking, only when the actor is its customer OR the provider's owner. */
export async function bookingForActor(actorUserId: number, bookingId: number): Promise<BookingRow | null> {
  await ensureBookingCoreSchema();
  const rows = (await sql().query(`${BOOKING_SELECT} WHERE b.id = $1 LIMIT 1`, [Number(bookingId)])) as unknown as Record<string, unknown>[];
  const row = rows?.[0];
  if (!row) return null;
  const booking = normalizeBooking(row);
  const mine = booking.customer_user_id === Number(actorUserId);
  const ownedByMe = booking.provider_owner_user_id === Number(actorUserId);
  return mine || ownedByMe ? booking : null;
}

export type LifecycleResult =
  | { ok: true; status: 200; booking: BookingRow; notifications?: { customer: EmailOutcome; provider: EmailOutcome } }
  | CoreError;

/** Build the email facts from a stored booking row (shared by cancel/complete). */
function factsFromRow(booking: BookingRow, cancelledBy?: string | null) {
  return {
    id: booking.id,
    providerName: booking.provider_name,
    serviceName: booking.service_name,
    date: booking.booking_date,
    time: booking.start_time,
    priceCents: booking.price_cents,
    currency: booking.currency,
    status: booking.status,
    paymentStatus: booking.payment_status,
    dogName: booking.dog_name,
    customerName: booking.customer_name,
    customerEmail: booking.customer_email,
    customerUserId: booking.customer_user_id,
    customerLang: null,
    providerOwnerUserId: booking.provider_owner_user_id,
    cancelledBy: cancelledBy ?? null,
  };
}

/**
 * Cancel policy (documented minimal, batch D1):
 *   - the actor must be the customer of the booking or the OWNER of its provider;
 *   - only 'pending_payment' (unpaid) and 'paid' bookings can be cancelled;
 *   - a PAID booking is NOT cancelled here: money would have to be refunded
 *     first, and refunds are not implemented yet (B2/payments). We refuse with an
 *     honest 409 instead of silently marking a paid booking cancelled;
 *   - the appointment must still be in the future;
 *   - the slot is freed: cancelled rows are outside the live-slot unique index,
 *     so the time can be booked again.
 */
export async function cancelBookingForActor(actorUserId: number, bookingId: number): Promise<LifecycleResult> {
  const uid = Number(actorUserId);
  const rows = (await sql().query(`${BOOKING_SELECT} WHERE b.id = $1 LIMIT 1`, [Number(bookingId)])) as unknown as Record<string, unknown>[];
  const raw = rows?.[0];
  if (!raw) return fail(404, "BOOKING_NOT_FOUND", "Booking not found.", "Réservation introuvable.");
  const booking = normalizeBooking(raw);

  const isCustomer = booking.customer_user_id === uid;
  const isProviderOwner = booking.provider_owner_user_id !== null && booking.provider_owner_user_id === uid;
  if (!isCustomer && !isProviderOwner) {
    return fail(403, "FORBIDDEN", "This booking is not yours.", "Cette réservation n'est pas la vôtre.");
  }
  if (booking.status !== "pending_payment" && booking.status !== "paid") {
    return fail(
      409,
      "NOT_CANCELLABLE",
      `A ${booking.status} booking can no longer be cancelled.`,
      `Une réservation « ${booking.status} » ne peut plus être annulée.`,
    );
  }
  if (booking.payment_status === "paid") {
    return fail(
      409,
      "REFUND_REQUIRED",
      "This booking is paid: it must be refunded, not cancelled. Refunds are not available yet — nothing was changed.",
      "Cette réservation est payée : elle doit être remboursée, pas annulée. Les remboursements ne sont pas encore disponibles — rien n'a été modifié.",
    );
  }
  const future = (await sql().query(
    `SELECT ((booking_date + start_time) > NOW()) AS future FROM bookings WHERE id = $1`,
    [booking.id],
  )) as unknown as { future: boolean }[];
  if (!future?.[0]?.future) {
    return fail(
      409,
      "TOO_LATE",
      "That appointment has already started and can no longer be cancelled.",
      "Ce rendez-vous a déjà commencé et ne peut plus être annulé.",
    );
  }

  const by = isCustomer ? "cancelled_by_customer" : "cancelled_by_provider";
  const updated = (await sql()`
    UPDATE bookings
    SET status = 'cancelled',
        cancellation_status = ${by},
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE id = ${booking.id}
      AND status IN ('pending_payment', 'paid')
    RETURNING id
  `) as unknown as { id: number }[];
  if (!updated?.length) {
    return fail(409, "NOT_CANCELLABLE", "This booking just changed state.", "Cette réservation vient de changer d'état.");
  }

  writeAudit(uid, "booking_cancelled", {
    booking_id: booking.id,
    provider_id: booking.provider_id,
    by,
    previous_status: booking.status,
  });

  const after = await bookingForActor(uid, booking.id);
  const finalRow = after ?? booking;
  // (c) cancellation email to the customer and the provider, honestly reported.
  const notifications = await notifyBookingCancelled(booking.provider_id, factsFromRow(finalRow, by));
  return { ok: true, status: 200, booking: finalRow, notifications };
}

/**
 * Provider "mark complete". Only the OWNER of the booking's provider can do it,
 * and only a PAID booking can be completed — a booking nobody paid for must
 * never inflate the North Star (completed bookings per week).
 */
export async function completeBookingForActor(actorUserId: number, bookingId: number): Promise<LifecycleResult> {
  const uid = Number(actorUserId);
  const rows = (await sql().query(`${BOOKING_SELECT} WHERE b.id = $1 LIMIT 1`, [Number(bookingId)])) as unknown as Record<string, unknown>[];
  const raw = rows?.[0];
  if (!raw) return fail(404, "BOOKING_NOT_FOUND", "Booking not found.", "Réservation introuvable.");
  const booking = normalizeBooking(raw);

  if (booking.provider_owner_user_id === null || booking.provider_owner_user_id !== uid) {
    return fail(
      403,
      "FORBIDDEN",
      "Only the provider who owns this booking can mark it complete.",
      "Seul le prestataire propriétaire de cette réservation peut la marquer terminée.",
    );
  }
  if (booking.status === "completed") {
    return fail(409, "ALREADY_COMPLETED", "This booking is already completed.", "Cette réservation est déjà terminée.");
  }
  if (booking.status !== "paid") {
    return fail(
      409,
      "NOT_PAID",
      `Only a paid booking can be completed (this one is '${booking.status}').`,
      `Seule une réservation payée peut être terminée (celle-ci est « ${booking.status} »).`,
    );
  }

  const updated = (await sql()`
    UPDATE bookings
    SET status = 'completed', completed_at = NOW(), updated_at = NOW()
    WHERE id = ${booking.id} AND status = 'paid'
    RETURNING id
  `) as unknown as { id: number }[];
  if (!updated?.length) {
    return fail(409, "NOT_PAID", "This booking just changed state.", "Cette réservation vient de changer d'état.");
  }

  writeAudit(uid, "booking_completed", {
    booking_id: booking.id,
    provider_id: booking.provider_id,
    price_cents: booking.price_cents,
    completed_at: new Date().toISOString(),
  });

  const after = await bookingForActor(uid, booking.id);
  const finalRow = after ?? booking;
  // (d) completion email to the customer and the provider.
  const notifications = await notifyBookingCompleted(booking.provider_id, factsFromRow(finalRow));
  return { ok: true, status: 200, booking: finalRow, notifications };
}

// ── services (owner-bound edit / deactivate) ────────────────────────────────
export interface ServiceEditInput {
  name?: unknown;
  price_cents?: unknown;
  duration_minutes?: unknown;
  is_active?: unknown;
}

export async function editOwnedService(
  ownerUserId: number,
  serviceId: number,
  input: ServiceEditInput,
): Promise<{ ok: true; status: 200; service: Record<string, unknown> } | CoreError> {
  await ensureBookingCoreSchema();
  const sid = Number(serviceId);
  if (!Number.isSafeInteger(sid) || sid <= 0) {
    return fail(400, "BAD_SERVICE_ID", "Invalid service id.", "Identifiant de prestation invalide.");
  }
  const rows = (await sql()`
    SELECT s.id, s.name, s.price_cents, s.duration_minutes, s.is_active, p.owner_user_id
    FROM services s JOIN providers p ON p.id = s.provider_id
    WHERE s.id = ${sid}
    LIMIT 1
  `) as unknown as { id: number; name: string; price_cents: number; duration_minutes: number; is_active: boolean | null; owner_user_id: number | null }[];
  const row = rows?.[0];
  if (!row) return fail(404, "SERVICE_NOT_FOUND", "Service not found.", "Prestation introuvable.");
  if (row.owner_user_id === null || Number(row.owner_user_id) !== Number(ownerUserId)) {
    return fail(403, "FORBIDDEN", "This service is not yours.", "Cette prestation n'est pas la vôtre.");
  }

  const name = input.name === undefined ? null : String(input.name).replace(/\s+/g, " ").trim().slice(0, 120);
  if (name !== null && !name) {
    return fail(400, "SERVICE_NAME_REQUIRED", "A service name is required.", "Un nom de prestation est obligatoire.");
  }
  let priceCents: number | null = null;
  if (input.price_cents !== undefined) {
    priceCents = Math.round(Number(input.price_cents));
    if (!Number.isFinite(priceCents) || priceCents <= 0 || priceCents > 500_000) {
      return fail(400, "SERVICE_PRICE_INVALID", "The price must be between 0.01 and 5000.00 EUR.", "Le prix doit être compris entre 0,01 et 5000,00 €.");
    }
  }
  let duration: number | null = null;
  if (input.duration_minutes !== undefined) {
    duration = Math.round(Number(input.duration_minutes));
    if (!Number.isFinite(duration) || duration <= 0 || duration > 24 * 60) {
      return fail(400, "SERVICE_DURATION_INVALID", "The duration must be between 1 and 1440 minutes.", "La durée doit être comprise entre 1 et 1440 minutes.");
    }
  }
  let isActive: boolean | null = null;
  if (input.is_active !== undefined) {
    isActive = input.is_active === true || String(input.is_active) === "true" || String(input.is_active) === "1";
  }
  if (name === null && priceCents === null && duration === null && isActive === null) {
    return fail(400, "NOTHING_TO_UPDATE", "Nothing to update.", "Aucune modification à enregistrer.");
  }

  const updated = (await sql()`
    UPDATE services
    SET name = COALESCE(${name}, name),
        price_cents = COALESCE(${priceCents}, price_cents),
        duration_minutes = COALESCE(${duration}, duration_minutes),
        is_active = COALESCE(${isActive}, is_active)
    WHERE id = ${sid}
    RETURNING id, name, price_cents, duration_minutes, is_active
  `) as unknown as Record<string, unknown>[];
  if (!updated?.length) {
    return fail(503, "DB_UNAVAILABLE", "We couldn't update this service. Nothing was changed.", "Nous n'avons pas pu mettre à jour cette prestation. Rien n'a été modifié.");
  }

  writeAudit(Number(ownerUserId), "provider_service_updated", {
    service_id: sid,
    name: updated[0].name,
    price_cents: updated[0].price_cents,
    duration_minutes: updated[0].duration_minutes,
    is_active: updated[0].is_active,
  });

  return { ok: true, status: 200, service: updated[0] };
}

/** Services of the provider owned by `ownerUserId` (dashboard view). */
export async function ownedServices(ownerUserId: number): Promise<Record<string, unknown>[]> {
  await ensureBookingCoreSchema();
  return (await sql()`
    SELECT s.id, s.name, s.price_cents, s.duration_minutes, s.is_active
    FROM services s JOIN providers p ON p.id = s.provider_id
    WHERE p.owner_user_id = ${Number(ownerUserId)} AND p.is_demo = false
    ORDER BY s.id
  `) as unknown as Record<string, unknown>[];
}

/** Completed bookings per week — the North Star, as a real COUNT. */
export async function completedBookingsCount(): Promise<number> {
  await ensureBookingCoreSchema();
  const rows = (await sql()`
    SELECT COUNT(*)::int AS count FROM bookings
    WHERE status = 'completed' AND completed_at IS NOT NULL
  `) as unknown as { count: number }[];
  return Number(rows?.[0]?.count ?? 0);
}
