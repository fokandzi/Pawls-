import { createServerFn } from "@tanstack/react-start";

export type BookingInput = {
  providerId: number;
  serviceId: number;
  /** The customer must pick one of THEIR OWN dogs (batch D1). */
  dogId: number | null;
  customerName: string;
  customerEmail: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24h)
};

export type BookingResult =
  | {
      success: true;
      booking: {
        id: number;
        provider_name: string;
        service_name: string;
        date: string;
        time: string;
        price_cents: number;
        currency: string;
        status: string;
        payment_status: string;
      };
    }
  | { success: false; error: string; status?: number; code?: string };

export function parseBookingInput(data: unknown): BookingInput {
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid booking data");
  }
  const d = data as Record<string, unknown>;
  const rawDog = d.dogId === undefined || d.dogId === null || d.dogId === "" ? null : Number(d.dogId);
  return {
    providerId: Number(d.providerId),
    serviceId: Number(d.serviceId),
    dogId: rawDog === null || !Number.isSafeInteger(rawDog) ? null : rawDog,
    customerName: String(d.customerName ?? "").trim(),
    customerEmail: String(d.customerEmail ?? "").trim(),
    date: String(d.date ?? "").trim(),
    time: String(d.time ?? "").trim(),
  };
}

/**
 * Server-function flavour of booking creation.
 *
 * The rules live in ONE place, `src/lib/booking-core.ts` (shared with the native
 * HTTP endpoint in booking-api-handler.ts), so there is no second, weaker path:
 *   - the customer is authenticated (identity from the session, never the body);
 *   - the provider must be REAL approved supply (approved, non-demo, owner-bound
 *     to a non-test user) — a legacy unowned "approved" row is refused;
 *   - the slot must exist in the provider's `provider_availability` windows
 *     (no rows => no bookable slots, never an invented time window);
 *   - the dog must belong to the caller;
 *   - price/currency are snapshotted server-side from the service row;
 *   - the double-booking guard answers 409 "Ce créneau vient d'être réservé";
 *   - a new booking is ALWAYS `pending_payment` / `unpaid` — never "confirmed".
 */
export async function createBookingCore(request: Request, data: BookingInput): Promise<BookingResult> {
  // authz/session are server-only and loaded lazily to keep the client bundle free of node:crypto
  const { requireUser } = await import("../lib/auth/authz");
  const auth = await requireUser(request);
  if (!auth.ok) {
    return { success: false, status: auth.status, code: auth.code, error: auth.message };
  }
  const { createBookingForActor } = await import("../lib/booking-core");
  const result = await createBookingForActor(
    { userId: auth.user.id, email: auth.user.email, name: auth.user.name },
    {
      providerId: data.providerId,
      serviceId: data.serviceId,
      dogId: data.dogId,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      date: data.date,
      time: data.time,
    },
  );
  if (!result.ok) {
    return { success: false, status: result.status, code: result.code, error: result.message };
  }
  return {
    success: true,
    booking: {
      id: result.booking.id,
      provider_name: result.booking.provider_name,
      service_name: result.booking.service_name,
      date: result.booking.date,
      time: result.booking.time,
      price_cents: result.booking.price_cents,
      currency: result.booking.currency,
      status: result.booking.status,
      payment_status: result.booking.payment_status,
    },
  };
}

export const createBooking = createServerFn({ method: "POST" })
  .validator((data: unknown): BookingInput => parseBookingInput(data))
  .handler(async ({ data, request }): Promise<BookingResult> => {
    return createBookingCore(request, data);
  });
