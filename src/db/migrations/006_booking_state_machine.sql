-- ============================================================================
-- Pawls migration 006 — Booking payment state machine + server-side pricing
-- (Security Finding #5: derive checkout price + booking identity server-side)
--
-- APPLY:   bun run db:migrate        (runner: scripts/migrate.ts)
-- TEST:    bun run db:migrate --scratch
--
-- WHY:
--   Bookings previously defaulted to status 'confirmed' the moment they were
--   created — before any payment existed — so an unpaid booking was
--   indistinguishable from a fulfilled one, and checkout trusted client
--   supplied price/name/provider strings. This migration:
--     1. Adds stripe_session_id + paid_at as canonical columns (the ad-hoc
--        ALTER ... ADD COLUMN IF NOT EXISTS in the webhook stays harmless).
--     2. Maps legacy 'confirmed' rows sanely: rows with no payment become
--        'pending_payment'; rows already marked paid stay 'paid'.
--        NO rows are deleted.
--     3. Changes the status default to 'pending_payment' and adds a CHECK that
--        only allows the explicit state machine:
--            pending_payment -> paid -> completed
--        plus explicit cancelled / refunded / failed.
--   payment_status keeps its own dimension ('unpaid'|'pending'|'paid'|
--   'refunded'|'failed') and is kept in sync by the booking/checkout/webhook
--   code paths on every transition.
--
-- DOWN (documented for manual rollback; never auto-executed):
--   ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
--   ALTER TABLE bookings ALTER COLUMN status SET DEFAULT 'confirmed';
--   ALTER TABLE bookings DROP COLUMN IF EXISTS stripe_session_id;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS paid_at;
-- ============================================================================
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Legacy mapping: 'confirmed' with no payment is an unpaid booking.
UPDATE bookings SET status = 'pending_payment'
WHERE status = 'confirmed' AND payment_status IS DISTINCT FROM 'paid';

-- Rows already marked paid keep their paid state (never downgraded).
UPDATE bookings SET status = 'paid'
WHERE status = 'confirmed' AND payment_status = 'paid';

-- New default: an unpaid booking must never look confirmed.
ALTER TABLE bookings ALTER COLUMN status SET DEFAULT 'pending_payment';

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending_payment','paid','completed','cancelled','refunded','failed'));

CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);