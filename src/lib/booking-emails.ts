/**
 * Booking transactional emails (batch D2, owner directive: booking emails are
 * part of the Book MVP).
 *
 * Four triggers, exactly as the plan lists them:
 *   (a) booking received / confirmed — CUSTOMER   (createBookingForActor)
 *   (b) new booking                  — PROVIDER   (createBookingForActor)
 *   (c) booking cancelled            — both parties (cancelBookingForActor)
 *   (d) booking completed            — both parties (completeBookingForActor)
 *
 * Rules (same honesty standard as the batch-A auth mailer):
 *   - The message is really sent with Resend ONLY when RESEND_API_KEY is set;
 *     otherwise every attempt is appended to mail_log as mode='test',
 *     status='test' and NOTHING is sent (see src/lib/auth/mailer.ts).
 *   - A provider failure is reported (status='failed' + error), never claimed as
 *     delivered: the booking response carries the true outcome per recipient.
 *   - Locale comes from the RECIPIENT's users.preferred_language (FR default), so
 *     a French customer and an English provider each get their own language.
 *   - No invented content: the email states the booking id, service, date, price
 *     and the booking's TRUE status. A booking that is not paid is never
 *     described as confirmed.
 *   - Email can never break a booking: every send is contained.
 */
import { sql } from "../db";
import { sendMail, type MailMessage, type MailResult } from "./auth/mailer";
import { DEFAULT_LANG, normalizeLang, type Lang } from "./i18n";

export type EmailOutcome = "test" | "sent" | "failed";

export interface BookingFacts {
  id: number;
  providerName: string;
  serviceName: string | null;
  date: string;
  time: string;
  priceCents: number | null;
  currency: string;
  status: string;
  paymentStatus: string;
  dogName: string | null;
  customerName: string;
  customerEmail: string;
  /** The customer's user id (users.preferred_language source), when known. */
  customerUserId: number | null;
  /** users.preferred_language of the customer (null when unknown). */
  customerLang: Lang | null;
  providerOwnerUserId: number | null;
  cancelledBy?: string | null;
}

export interface NotifyOutcome {
  customer: EmailOutcome;
  provider: EmailOutcome;
}

function pick(lang: Lang, fr: string, en: string): string {
  return lang === "en" ? en : fr;
}

function eur(cents: number | null, currency: string): string {
  if (cents === null || cents === undefined) return "—";
  return `${(cents / 100).toFixed(2)} ${currency === "EUR" ? "€" : currency}`;
}

function htmlFrom(lines: string[]): string {
  return lines.map((l) => `<p>${l}</p>`).join("");
}

/** Honest one-line status for a booking, in the recipient's language. */
function statusLine(facts: BookingFacts, lang: Lang): string {
  if (facts.status === "paid") {
    return pick(lang, "Statut : payée — la prestation est confirmée.", "Status: paid — the booking is confirmed.");
  }
  if (facts.status === "completed") {
    return pick(lang, "Statut : terminée.", "Status: completed.");
  }
  if (facts.status === "cancelled") {
    return pick(lang, "Statut : annulée — le créneau est de nouveau libre.", "Status: cancelled — the slot is free again.");
  }
  // pending_payment (payments off in this release): never say "confirmed".
  return pick(
    lang,
    "Statut : en attente de paiement — le paiement n'est pas encore activé, rien n'a été débité et la réservation n'est pas encore confirmée.",
    "Status: awaiting payment — payments are not enabled yet, nothing has been charged and the booking is not confirmed.",
  );
}

function factsLines(facts: BookingFacts, lang: Lang): string[] {
  return [
    pick(lang, `Réservation n°${facts.id}`, `Booking #${facts.id}`),
    pick(lang, `Prestataire : ${facts.providerName}`, `Provider: ${facts.providerName}`),
    pick(lang, `Prestation : ${facts.serviceName ?? "—"}`, `Service: ${facts.serviceName ?? "—"}`),
    pick(lang, `Date : le ${facts.date} à ${facts.time}`, `Date: ${facts.date} at ${facts.time}`),
    pick(lang, `Prix : ${eur(facts.priceCents, facts.currency)}`, `Price: ${eur(facts.priceCents, facts.currency)}`),
    facts.dogName ? pick(lang, `Chien : ${facts.dogName}`, `Dog: ${facts.dogName}`) : "",
  ].filter(Boolean);
}

function message(to: string, subject: string, intro: string, lines: string[], outro: string): MailMessage {
  return {
    to,
    subject,
    text: `${intro}\n\n${lines.join("\n")}\n\n${outro}`,
    html: htmlFrom([intro, ...lines, outro]),
  };
}

/** Best-effort recipient language; FR default on any failure. */
async function langOf(userId: number | null | undefined, fallback: Lang | null = null): Promise<Lang> {
  if (!userId) return fallback ?? DEFAULT_LANG;
  try {
    const rows = (await sql()`
      SELECT preferred_language FROM users WHERE id = ${Number(userId)} LIMIT 1
    `) as unknown as { preferred_language: string | null }[];
    return normalizeLang(rows?.[0]?.preferred_language ?? fallback);
  } catch {
    return fallback ?? DEFAULT_LANG;
  }
}

/** Provider contact address + owner (providers.email is the listing contact). */
async function providerContact(providerId: number): Promise<{ email: string | null; ownerUserId: number | null; name: string | null }> {
  try {
    const rows = (await sql()`
      SELECT p.email, p.owner_user_id, p.name FROM providers p WHERE p.id = ${Number(providerId)} LIMIT 1
    `) as unknown as { email: string | null; owner_user_id: number | null; name: string | null }[];
    const row = rows?.[0];
    if (!row) return { email: null, ownerUserId: null, name: null };
    let email = row.email ? String(row.email) : null;
    // Fall back to the owning account's address when the listing has none.
    if (!email && row.owner_user_id) {
      const u = (await sql()`
        SELECT email FROM users WHERE id = ${Number(row.owner_user_id)} LIMIT 1
      `) as unknown as { email: string | null }[];
      email = u?.[0]?.email ? String(u[0].email) : null;
    }
    return { email, ownerUserId: row.owner_user_id === null ? null : Number(row.owner_user_id), name: row.name ? String(row.name) : null };
  } catch {
    return { email: null, ownerUserId: null, name: null };
  }
}

/** One contained send: reports the TRUE outcome, never claims delivery. */
async function deliver(to: string | null, build: () => MailMessage): Promise<EmailOutcome> {
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return "failed";
  try {
    const result: MailResult = await sendMail(build());
    if (!result.ok) return "failed";
    return result.mode === "prod" ? "sent" : "test";
  } catch (err) {
    console.error("[booking-email] send failed", err);
    return "failed";
  }
}

/** The provider-side recipient of a booking (email + language + name). */
async function providerRecipient(providerId: number): Promise<{ email: string | null; lang: Lang }> {
  const contact = await providerContact(providerId);
  return { email: contact.email, lang: await langOf(contact.ownerUserId) };
}

// ── customer-facing templates ────────────────────────────────────────────────

export function bookingReceivedEmail(to: string, facts: BookingFacts, lang: Lang): MailMessage {
  const intro = pick(
    lang,
    "Nous avons bien enregistré votre réservation sur Pawls.",
    "We have received your booking on Pawls.",
  );
  return message(
    to,
    pick(
      lang,
      `Pawls — réservation n°${facts.id} enregistrée`,
      `Pawls — booking #${facts.id} received`,
    ),
    intro,
    [...factsLines(facts, lang), statusLine(facts, lang)],
    pick(
      lang,
      "Vous pouvez suivre ou annuler cette réservation depuis https://pawls.club/book/my-bookings",
      "You can track or cancel this booking from https://pawls.club/book/my-bookings",
    ),
  );
}

export function bookingCancelledEmail(to: string, facts: BookingFacts, lang: Lang, audience: "customer" | "provider"): MailMessage {
  const by = facts.cancelledBy === "cancelled_by_provider" ? "provider" : "customer";
  const intro = audience === "customer"
    ? (by === "provider"
        ? pick(lang, "Le prestataire a annulé votre réservation Pawls.", "The provider cancelled your Pawls booking.")
        : pick(lang, "Votre réservation Pawls a bien été annulée.", "Your Pawls booking has been cancelled."))
    : (by === "customer"
        ? pick(lang, "Un client a annulé sa réservation Pawls.", "A customer cancelled their Pawls booking.")
        : pick(lang, "Vous avez annulé cette réservation Pawls.", "You cancelled this Pawls booking."));
  return message(
    to,
    pick(lang, `Pawls — réservation n°${facts.id} annulée`, `Pawls — booking #${facts.id} cancelled`),
    intro,
    [...factsLines(facts, lang), pick(lang, "Statut : annulée — le créneau est de nouveau libre.", "Status: cancelled — the slot is free again.")],
    pick(
      lang,
      "Aucun paiement n'a été débité pour cette réservation annulée.",
      "No payment was charged for this cancelled booking.",
    ),
  );
}

export function bookingCompletedEmail(to: string, facts: BookingFacts, lang: Lang, audience: "customer" | "provider"): MailMessage {
  const intro = audience === "customer"
    ? pick(lang, "Votre prestation a été marquée comme terminée.", "Your service has been marked as completed.")
    : pick(lang, "Vous avez marqué cette prestation comme terminée.", "You marked this service as completed.");
  return message(
    to,
    pick(lang, `Pawls — réservation n°${facts.id} terminée`, `Pawls — booking #${facts.id} completed`),
    intro,
    [...factsLines(facts, lang), pick(lang, "Statut : terminée.", "Status: completed.")],
    pick(
      lang,
      "Les avis vérifiés Pawls ne sont ouverts qu'après une prestation réellement payée et terminée.",
      "Verified Pawls reviews only open after a genuinely paid and completed service.",
    ),
  );
}

// ── triggers ─────────────────────────────────────────────────────────────────

function outcomePairs(
  customer: EmailOutcome,
  provider: EmailOutcome,
): NotifyOutcome {
  return { customer, provider };
}

/** (a)+(b): booking created → customer receipt + provider notification. */
export async function notifyBookingCreated(providerId: number, facts: BookingFacts): Promise<NotifyOutcome> {
  try {
    const custLang = await langOf(facts.customerUserId, facts.customerLang ?? DEFAULT_LANG).catch(() => DEFAULT_LANG);
    const prov = await providerRecipient(providerId);
    const [customer, provider] = await Promise.all([
      deliver(facts.customerEmail, () => bookingReceivedEmail(facts.customerEmail, facts, custLang)),
      deliver(prov.email, () =>
        message(
          prov.email as string,
          pick(prov.lang, `Pawls — nouvelle réservation n°${facts.id}`, `Pawls — new booking #${facts.id}`),
          pick(
            prov.lang,
            "Vous avez reçu une nouvelle réservation de service sur Pawls.",
            "You have received a new service booking on Pawls.",
          ),
          [
            ...factsLines(facts, prov.lang),
            pick(prov.lang, `Client : ${facts.customerName}`, `Customer: ${facts.customerName}`),
            statusLine(facts, prov.lang),
          ],
          pick(
            prov.lang,
            "Vous pouvez la voir dans votre espace prestataire : https://pawls.club/book/provider",
            "You can see it in your provider space: https://pawls.club/book/provider",
          ),
        ),
      ),
    ]);
    return outcomePairs(customer, provider);
  } catch (err) {
    console.error("[booking-email] create notification failed", err);
    return outcomePairs("failed", "failed");
  }
}

/** (c): cancellation → the OTHER party (and a receipt when you cancelled). */
export async function notifyBookingCancelled(providerId: number, facts: BookingFacts): Promise<NotifyOutcome> {
  try {
    const custLang = await langOf(facts.customerUserId, facts.customerLang ?? DEFAULT_LANG).catch(() => DEFAULT_LANG);
    const prov = await providerRecipient(providerId);
    const [customer, provider] = await Promise.all([
      deliver(facts.customerEmail, () => bookingCancelledEmail(facts.customerEmail, facts, custLang, "customer")),
      deliver(prov.email, () => bookingCancelledEmail(prov.email as string, facts, prov.lang, "provider")),
    ]);
    return outcomePairs(customer, provider);
  } catch (err) {
    console.error("[booking-email] cancel notification failed", err);
    return outcomePairs("failed", "failed");
  }
}

/** (d): completion → customer + provider. */
export async function notifyBookingCompleted(providerId: number, facts: BookingFacts): Promise<NotifyOutcome> {
  try {
    const custLang = await langOf(facts.customerUserId, facts.customerLang ?? DEFAULT_LANG).catch(() => DEFAULT_LANG);
    const prov = await providerRecipient(providerId);
    const [customer, provider] = await Promise.all([
      deliver(facts.customerEmail, () => bookingCompletedEmail(facts.customerEmail, facts, custLang, "customer")),
      deliver(prov.email, () => bookingCompletedEmail(prov.email as string, facts, prov.lang, "provider")),
    ]);
    return outcomePairs(customer, provider);
  } catch (err) {
    console.error("[booking-email] completion notification failed", err);
    return outcomePairs("failed", "failed");
  }
}
