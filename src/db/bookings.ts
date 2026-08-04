import { createServerFn } from "@tanstack/react-start";
import { sql } from "../db";
import { createBookingTables } from "./schema";

type BookingInput = {
  providerId: number;
  serviceId: number;
  customerName: string;
  customerEmail: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24h)
};

type BookingResult =
  | { success: true; booking: { id: number; provider_name: string; service_name: string; date: string; time: string } }
  | { success: false; error: string };

export const createBooking = createServerFn({ method: "POST" })
  .validator((data: unknown): BookingInput => {
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid booking data");
    }
    const d = data as Record<string, unknown>;

    const providerId = Number(d.providerId);
    const serviceId = Number(d.serviceId);
    const customerName = String(d.customerName ?? "").trim();
    const customerEmail = String(d.customerEmail ?? "").trim();
    const date = String(d.date ?? "").trim();
    const time = String(d.time ?? "").trim();

    if (!providerId || !serviceId) throw new Error("Provider and service are required");
    if (!customerName) throw new Error("Customer name is required");
    if (!customerEmail) throw new Error("Customer email is required");
    if (!date) throw new Error("Date is required");
    if (!time) throw new Error("Time is required");

    return { providerId, serviceId, customerName, customerEmail, date, time };
  })
  .handler(async ({ data }): Promise<BookingResult> => {
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.customerEmail)) {
      return { success: false, error: "Please enter a valid email address." };
    }

    // Validate date: must be in the future and within 30 days
    const bookingDate = new Date(data.date + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 30);

    if (isNaN(bookingDate.getTime())) {
      return { success: false, error: "Please enter a valid date." };
    }
    if (bookingDate < today) {
      return { success: false, error: "Booking date must be today or in the future." };
    }
    if (bookingDate > maxDate) {
      return { success: false, error: "Booking date must be within the next 30 days." };
    }

    // Validate time: between 08:00 and 18:00, on 30-min increments
    const timeMatch = data.time.match(/^(\d{2}):(\d{2})$/);
    if (!timeMatch) {
      return { success: false, error: "Please enter a valid time." };
    }
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    if (hours < 8 || hours > 18 || (hours === 18 && minutes > 0)) {
      return { success: false, error: "Time must be between 08:00 and 18:00." };
    }
    if (minutes % 30 !== 0) {
      return { success: false, error: "Time must be in 30-minute increments." };
    }

    // Ensure tables exist
    await createBookingTables();

    // Verify provider and service exist
    const [provider] = await sql()`
      SELECT id, name FROM providers WHERE id = ${data.providerId}
    `;
    if (!provider) {
      return { success: false, error: "Provider not found." };
    }

    const [service] = await sql()`
      SELECT id, name, provider_id FROM services WHERE id = ${data.serviceId}
    `;
    if (!service) {
      return { success: false, error: "Service not found." };
    }
    if (Number(service.provider_id) !== data.providerId) {
      return { success: false, error: "Service does not belong to this provider." };
    }

    // Insert booking
    const [booking] = await sql()`
      INSERT INTO bookings (provider_id, service_id, customer_name, customer_email, booking_date, start_time, status)
      VALUES (${data.providerId}, ${data.serviceId}, ${data.customerName}, ${data.customerEmail}, ${data.date}::date, ${data.time}::time, 'confirmed')
      RETURNING id
    `;

    if (!booking) {
      return { success: false, error: "Failed to create booking." };
    }

    return {
      success: true,
      booking: {
        id: Number(booking.id),
        provider_name: String(provider.name),
        service_name: String(service.name),
        date: data.date,
        time: data.time,
      },
    };
  });
