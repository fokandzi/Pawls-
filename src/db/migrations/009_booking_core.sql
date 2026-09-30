-- ============================================================================
-- Pawls migration 009 — Book MVP core (P1 batch D1, owner-ratified 2026-09-28)
-- Additive + idempotent. Safe to run multiple times. 007 (mail_log) and 008
-- (provider registration truth) are taken; this is 009.
--
-- APPLY:   bun run db:migrate
-- TEST:    bun run db:migrate --scratch   (throwaway database; then dropped)
--
-- SCOPE (nothing here rewrites existing data):
--   1. provider_availability — the source of truth for bookable slots,
--      replacing the hard-coded 08:00-17:30 window that used to live in the
--      /book/$providerId modal AND in createBookingCore's 08:00-18:00 check.
--      A provider with no rows has NO bookable slots: the product says
--      "no availability published yet" instead of inventing times.
--      day_of_week follows JavaScript's getDay(): 0 = Sunday .. 6 = Saturday.
--   2. bookings.dog_id — the customer's dog for the booking. NULLABLE: every
--      pre-existing row keeps its data, and bookings created before this
--      migration are simply "dog not recorded" (never back-filled with a guess).
--   3. bookings.completed_at / cancelled_at — the lifecycle timestamps.
--      completed_at is written by the provider "mark complete" transition and
--      is what makes completed bookings per week (the North Star) measurable.
--      Legacy rows that already say 'completed' keep completed_at NULL: we do
--      not know when they finished, so we do not invent a timestamp.
--   4. DOUBLE-BOOKING GUARD — a UNIQUE index on
--      (provider_id, booking_date, start_time) restricted to LIVE bookings
--      (pending_payment, paid, completed). An unpaid pending booking holds its
--      slot (that is what the 006 state machine intends), but a cancelled /
--      refunded / failed booking must NOT block the slot forever — otherwise a
--      single cancellation would burn that time for good.
--      Before adding the index the live-slot collision count MUST be 0 (checked
--      by the batch-D1 harness; see evidence/migration-pre.txt).
--
-- DOWN (manual, never auto-executed):
--   DROP INDEX IF EXISTS bookings_provider_slot_live_key;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS cancelled_at;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS completed_at;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS dog_id;
--   DROP TABLE IF EXISTS provider_availability;
-- ============================================================================
CREATE TABLE IF NOT EXISTS provider_availability (
  id SERIAL PRIMARY KEY,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_time > start_time)
);
CREATE UNIQUE INDEX IF NOT EXISTS provider_availability_window_key ON provider_availability (provider_id, day_of_week, start_time);
CREATE INDEX IF NOT EXISTS idx_provider_availability_provider ON provider_availability (provider_id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dog_id INTEGER REFERENCES dog_profiles(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_provider_slot_live_key ON bookings (provider_id, booking_date, start_time) WHERE status IN ('pending_payment', 'paid', 'completed');
