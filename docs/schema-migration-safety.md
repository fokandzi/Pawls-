# Pawls P0 Schema & Migrations — Safety Document (migration 002)

**Phase:** P0 Schema & Migrations · **File:** `src/db/migrations/002_schema_foundation.sql`
**Status:** AUTHORED + SCRATCH-TESTED. **NOT yet applied to production** — the
apply session runs `bun run db:migrate`, then re-runs the auth smoke and the
authorization matrix, then writes the phase report.
**Runner:** `scripts/migrate.ts` — statement-by-statement (Neon HTTP driver
rejects multi-statement calls), `schema_migrations` version tracking, additive
`IF NOT EXISTS` guards, `--scratch` mode applies ALL migrations to a throwaway
database, verifies them, then drops it.

---

## 1. Ground truth before this migration (production introspection, 2026-08-12)

| Table | Rows | Notable current state |
|---|---|---|
| swipes | 0 | `UNIQUE (swiper_profile_id, target_profile_id)` — cannot change mind |
| matches | 0 | `UNIQUE (profile_id_1, profile_id_2)` with **no ordering rule** — (A,B) and (B,A) are distinct |
| rate_limits | 15 | `UNIQUE (action, key, window_start)` — **already the correct composite** (see §4) |
| providers | 12 | `rating NUMERIC DEFAULT 4.5` (fabricated default), no owner/approval/market fields |
| services | 16 | no currency, no active flag |
| bookings | 0 | no customer user, no money/payment/cancellation fields |
| subscriptions | 0 | `plan DEFAULT 'pawnder-plus'` (legacy identifier) |
| dog_profiles | 30 | legacy demo rows; `user_id` FK exists, `idx_dog_profiles_user_id` exists (001) |
| breeders / shelters / venues | 12 each | demo-seeded; no `is_demo` marker; `venues.rating DEFAULT 4.5` (fabricated) |
| matches with `profile_id_1 >= profile_id_2` | 0 | — |
| duplicate `(swiper,target)` swipe rows | 0 | — |

Because swipes/matches/bookings/subscriptions are **empty**, every constraint
correction below is a DDL-only change with **zero rows to validate, reorder, or
lose**.

## 2. Tables affected

| Table | Change |
|---|---|
| users | + `region TEXT` (completes country/city/region/timezone) |
| dog_profiles | + date_of_birth, sex, weight_kg, dog_friendly, child_friendly, vaccination_status, neutered_spayed, additional_photo_urls, profile_visibility, country, region, city, approx_lat, approx_lng, source, updated_at (+ is_demo guard ALTER; index guard on user_id) |
| swipes | **constraint correction** (see §4) |
| matches | **constraint correction** (see §4) + state, unmatched_at, created_by_system |
| rate_limits | **none** (already correct — see §4) |
| providers | + owner_user_id, approval_status, country, city, currency, timezone, is_demo; **rating DEFAULT dropped** |
| services | + currency `NOT NULL DEFAULT 'EUR'`, is_active |
| bookings | + customer_user_id, dog_id, end_time, price_cents, currency, platform_fee_cents, platform_fee_rate, payment_status, stripe_payment_intent_id, cancellation_status, cancelled_at, refund_state, refund_reference, updated_at |
| subscriptions | `plan` DEFAULT → 'none'; + user_id |
| breeders / shelters / venues | + is_demo; **venues.rating DEFAULT dropped** (same honesty fix as providers) |
| **new tables** | conversations, conversation_participants, messages, blocks, reports, commission_configs |

New columns are all nullable or carry a constant default (`ADD COLUMN IF NOT
EXISTS ... DEFAULT const` uses PostgreSQL fast-default — no table rewrite, no
existing-row churn). No column is dropped, no type changed, no NOT NULL added
to an existing column.

## 3. Columns added/changed (details)

**dog_profiles** — all nullable/backward-compatible:
- `date_of_birth DATE` — legacy `age INT` is KEPT for existing rows; the app
  derives age from dob going forward (matching phase).
- `sex TEXT`, `weight_kg NUMERIC`, `dog_friendly BOOL`, `child_friendly BOOL`,
  `vaccination_status TEXT`, `neutered_spayed BOOL`, `additional_photo_urls TEXT[]`.
- `profile_visibility TEXT DEFAULT 'public' CHECK IN ('public','hidden')`.
- `country/region/city TEXT`, `approx_lat/approx_lng DOUBLE PRECISION` —
  **approximate discovery location (e.g. city-centre grid), NEVER a precise
  home point; never exposed publicly** (same rule as users.approx_*).
- `source TEXT DEFAULT 'user' CHECK IN ('user','demo','seed')`.
- `updated_at TIMESTAMPTZ DEFAULT now()`.
- **No `description` column added**: `bio` already serves that purpose; adding a
  duplicate would create a two-truth problem. Documented decision.
- **No breeding-specific fields**: litters/breeders tables already cover that
  vertical (breeding phase owns them).

**users** — `region TEXT` (state/province). No other change.

**providers** — `owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`
(business record retained if the owner deletes their account — matches the
account-deletion policy, which notes this column is added in this phase);
`approval_status TEXT DEFAULT 'pending' CHECK IN
('pending','approved','rejected','suspended')` — only 'approved' providers are
bookable in the Services marketplace; `country/city/currency/timezone TEXT`
(market fields); `is_demo BOOLEAN DEFAULT false`. **`rating` DEFAULT 4.5
dropped** (`ALTER COLUMN rating DROP DEFAULT`); the column stays NUMERIC NULL.
Existing 12 seeded rows keep their stored 4.5 values — they are demo entities
and will be marked `is_demo = true` in the DATA phase, not this migration.

**services** — `currency TEXT NOT NULL DEFAULT 'EUR'` (configurable per market,
not hard-coded — the commission_configs / market-config model owns this);
`is_active BOOLEAN DEFAULT true`.

**bookings** — `customer_user_id INTEGER REFERENCES users(id) ON DELETE SET
NULL`; `dog_id INTEGER REFERENCES dog_profiles(id) ON DELETE SET NULL`;
`end_time TIME`; `price_cents INTEGER`, `currency TEXT NOT NULL DEFAULT 'EUR'`,
`platform_fee_cents INTEGER`, `platform_fee_rate NUMERIC` — **snapshot of the
commission rate AT BOOKING TIME so historical reconciliation survives future
config changes**; `payment_status TEXT DEFAULT 'unpaid' CHECK IN
('unpaid','pending','paid','refunded','failed')`; `stripe_payment_intent_id
TEXT`; `cancellation_status TEXT DEFAULT 'none' CHECK IN ('none','requested',
'cancelled_by_customer','cancelled_by_provider')`; `cancelled_at TIMESTAMPTZ`;
`refund_state TEXT DEFAULT 'none' CHECK IN ('none','pending','refunded',
'failed')`; `refund_reference TEXT`; `updated_at TIMESTAMPTZ DEFAULT now()`.

**subscriptions** — `plan` DEFAULT changed `'pawnder-plus'` → `'none'` (a
default change only; existing rows untouched — there are 0); `user_id INTEGER
REFERENCES users(id)` (Plus phase backfills). **No Plus product is sold**; the
schema never claims one.

**venues** — `is_demo`; `rating` DEFAULT 4.5 dropped (same class of honesty fix
as providers.rating, applied to the venues pillar's fabricated default).

## 4. The three constraint-correction rationales (owner §12)

### 4a. swipes — idempotency rule now includes `direction`
- **Actual constraint found in production** (pg_constraint, NOT the brief's
  assumption): a single composite
  `swipes_swiper_profile_id_target_profile_id_key` = `UNIQUE (swiper_profile_id,
  target_profile_id)`. (The introspection summary in the brief listed
  "UNIQUE(swiper_profile_id) AND UNIQUE(target_profile_id)" because its query
  prints one row per column of a composite — the brief's two separate uniques
  never existed.)
- **Problem:** with `UNIQUE(swiper,target)`, a profile could never swipe the
  same target twice at all — not even to change its mind (like → pass) — and
  the uniqueness rule ignored direction entirely.
- **After:** `UNIQUE (swiper_profile_id, target_profile_id, direction)`
  (named `swipes_unique_swiper_target_direction`). One row per (swiper, target,
  direction): an identical repeat swipe is an idempotent no-op; a direction
  switch is a valid mind-change. Direction values ('like'/'pass') are enforced
  by the app in the matching phase.
- **Data loss:** none — table is empty; and even with rows, dropping the old
  composite can never create duplicates of the new one.
- **Dropped constraint:** `swipes_swiper_profile_id_target_profile_id_key`.

### 4b. matches — canonical unordered pair
- **Actual constraint found:** a single composite
  `matches_profile_id_1_profile_id_2_key` = `UNIQUE (profile_id_1,
  profile_id_2)` with **no ordering rule** (again one composite, not two
  singles as the brief assumed).
- **Problem:** (A,B) and (B,A) were two different rows for the same dog pair —
  a mutual like could create a duplicate match, and match lookups had to check
  both orientations.
- **After:** `CHECK (profile_id_1 < profile_id_2)` (named
  `matches_profile_order_check`) + `UNIQUE (profile_id_1, profile_id_2)`
  (named `matches_profiles_unique`). Every unordered pair has exactly one
  canonical row.
- **Data loss:** none — table is empty; 0 rows violate the new CHECK, 0 swapped
  duplicates exist (verified). If data had existed, the CHECK addition would
  have failed loudly instead of corrupting anything.
- **Dropped constraint:** `matches_profile_id_1_profile_id_2_key`.
- **New columns:** `state TEXT DEFAULT 'active' CHECK IN ('active','unmatched')`,
  `unmatched_at TIMESTAMPTZ`, `created_by_system BOOLEAN DEFAULT false`.
  `created_by_system=false` is the default and we **explicitly do NOT create
  fake reciprocal swipes** — matches are created only from real mutual swipes
  (logic lands in the matching phase). Unmatch + block implications: the Safety
  phase must, on block, suppress and/or close matches between the parties
  (schema note — the columns exist to support it; the logic is not in this
  migration).

### 4c. rate_limits — no change needed (brief premise disproven)
- **Actual constraint found:** `rate_limits_action_key_window_start_key` =
  `UNIQUE (action, key, window_start)` — the **exact composite the brief asked
  for**. It was created inline in migration 001 and is live in production.
  The brief's "UNIQUE(action), UNIQUE(key), UNIQUE(window_start) separately"
  is the same introspection artifact as §4a/§4b (one row per composite member).
- **Decision:** migration 002 issues **no statements** against rate_limits.
  Dropping and re-adding an identical constraint would be pointless churn on a
  live auth hot-path (rate limiting is DB-backed, 5/15min per login).
- **Apply-session requirement (unchanged):** re-run the auth smoke to confirm
  rate limiting still 429s with Retry-After — the composite is the intended
  design and is already in place.

## 5. Foreign keys and cascade behavior (every new FK, stated)

| FK | ON DELETE | Rationale |
|---|---|---|
| conversation_participants.conversation_id → conversations | CASCADE | participant rows die with the conversation |
| conversation_participants.user_id → users | CASCADE | membership meaningless without the user; account deletion must not be blocked |
| messages.conversation_id → conversations | CASCADE | messages die with the conversation |
| messages.sender_user_id → users | CASCADE | matches documented account-deletion policy (messages are deleted with the user — GDPR-style removal) |
| messages.sender_profile_id → dog_profiles | SET NULL | message history survives dog deletion; optional dog-context column |
| blocks.blocker_user_id → users | CASCADE | block meaningless without the blocker |
| blocks.blocked_user_id → users | CASCADE | block meaningless without the blocked user; no stale blocks after deletion |
| reports.reporter_user_id → users | CASCADE | report dies with its author; reports AGAINST a deleted user (other reporters) are unaffected |
| reports.admin_user_id → users | SET NULL | admin action history survives admin account deletion |
| bookings.customer_user_id → users | SET NULL | bookings are RETAINED business records (deletion policy: anonymised, never blocked); link nulls, row stays |
| bookings.dog_id → dog_profiles | SET NULL | booking history survives dog deletion |
| providers.owner_user_id → users | SET NULL | provider business record retained (deletion policy); ownership link nulls |
| bookings.provider_id / service_id (existing) | NO ACTION (unchanged) | legacy FKs untouched |
| swipes/matches → dog_profiles (existing) | NO ACTION (unchanged) | legacy FKs untouched |

All other references default to NO ACTION (no explicit clause). `audit_log`
(from 001) remains the moderation audit trail: Safety-phase admin actions
(report resolution, block, message removal) write `audit_log` entries.

## 6. Indexes added (all `IF NOT EXISTS`; hot paths only)

`idx_dog_profiles_user_id` (guard — exists from 001), `idx_dog_profiles_is_demo`,
`idx_swipes_target_profile_id`, `idx_swipes_swiper_profile_id` (the unique's
leading column already serves swiper lookups; kept explicit per phase spec),
`idx_conversation_participants_user_id`, `idx_messages_conversation_created_at`,
`idx_providers_approval_status`, `idx_providers_city`, `idx_services_provider_id`,
`idx_bookings_provider_id`, `idx_bookings_customer_user_id`,
`idx_bookings_status`, `idx_reports_status`, `idx_reports_target_type_target_id`.
`matches(profile_id_1, profile_id_2)` and `swipes(swiper,target,direction)` pair
lookups are served by their UNIQUE constraints. `blocks(blocker,blocked)` is
served by its UNIQUE.

## 7. Data backfill — what is intentionally NOT backfilled, and why

- **bookings.customer_user_id**: stays NULL until the booking phase matches
  existing `customer_email` rows to users. No email-matching heuristics in a
  migration (wrong guesses are worse than NULL).
- **providers.rating / venues.rating existing values**: kept as stored (4.5 on
  the 12 seeded providers / 12 venues). Only the DEFAULT is removed so future
  rows can't fabricate ratings. The DATA phase marks these seeded rows
  `is_demo = true` — deliberately NOT done in this migration (data hygiene is
  the DATA phase's job).
- **subscriptions.user_id**: NULL until the Plus phase backfills from email.
- **users.region / dog_profiles.* new columns**: NULL/default by design; users
  provide them through the profile flows.
- **matches/swipes**: no backfill at all — tables are empty and the matching
  phase owns all inserts (real mutual swipes only).

## 8. Risk to existing records

**None.** The migration is strictly additive (new columns/tables/indexes) plus
four DDL-only constraint corrections and two DEFAULT drops:
- Constraint corrections run against **empty** tables (verified: 0 rows in
  swipes, matches; 0 violations of the new matches CHECK).
- Column additions are `IF NOT EXISTS` with constant defaults (fast-default,
  no rewrite).
- `rating`/`plan` DEFAULT changes only affect future inserts, never existing
  rows.
- Idempotency: every statement is re-runnable; the runner records the version
  only after ALL statements in the file succeed, so a partial failure simply
  re-runs.

## 9. Rollback / recovery

- The runner never auto-executes destructive SQL. Down statements for every
  change are documented in the 002 file header (DROP new tables in dependency
  order; DROP COLUMN IF EXISTS per added column; DROP CONSTRAINT IF EXISTS for
  the corrected constraints; SET DEFAULT restorations for plan/rating).
- Re-running `bun run db:migrate` after a failure is safe (guards + version
  tracking).
- Because the change is additive, the safest "rollback" for the constraint
  corrections is to leave them in place; restoring the old broken uniques is
  possible from the header SQL if ever required.
- Restoring `providers.rating`/`venues.rating` DEFAULT 4.5 is documented in the
  header but discouraged: it re-introduces the fabricated default the honesty
  standard forbids.

## 10. Notes for later phases

- **Matching phase:** align the app's boot-time inline DDL (schema.ts
  createMatchTables / createBookingTables etc.) with the corrected
  swipes/matches constraints — the inline DDL still declares the OLD unique
  shapes and would create broken tables in a fresh environment (production is
  unaffected: `CREATE TABLE IF NOT EXISTS` no-ops on the migrated tables).
  Direction values, mutual-match logic, and matches from real swipes only.
- **Messaging phase:** authorization derives from conversation_participants
  membership ONLY — never query a conversation without membership; block must
  suppress message delivery; sender_profile_id is dog-context when present.
- **Safety phase:** block → suppress/close matches + hide conversation; report →
  admin queue → audit_log; requireAdmin() wired to reports.admin_user_id.
- **Services phase:** only approval_status='approved' providers bookable;
  commission resolved from commission_configs at booking time and snapshotted
  into bookings.platform_fee_rate (never hard-coded).
- **Bookings phase:** backfill customer_user_id from customer_email; Stripe
  payment_intent_id lifecycle; cancellation/refund state machine.
- **Plus phase:** backfill subscriptions.user_id; plan 'none' is the honest
  default until a real product exists.
- **DATA phase:** mark seeded providers/breeders/shelters/venues/dogs
  is_demo=true; stop auto-seeding production; honest empty states.
- **Apply session:** after applying, re-run auth smoke (rate-limit 429
  confirmation) and the authorization matrix rows re-testable from this phase.

## 11. Deviations from the phase brief (all deliberate, all documented)

1. **rate_limits: no statements** — the composite already exists; brief premise
   disproven by pg_constraint ground truth (§4c).
2. **swipes/matches: one composite each, not two singles** — the brief's named
   constraints (`swipes_swiper_profile_id_key`, `swipes_target_profile_id_key`,
   `matches_profile_id_1_key`, `matches_profile_id_2_key`) do not exist; the
   real dropped names are `swipes_swiper_profile_id_target_profile_id_key` and
   `matches_profile_id_1_profile_id_2_key`.
3. **venues.rating DEFAULT dropped** — beyond the brief's letter, same
   fabricated-default class as providers.rating.
4. **No `dog_profiles.description`** — `bio` already exists; avoided a
   two-truth column.
5. **messages.sender_user_id ON DELETE CASCADE** — chosen to match the
   documented account-deletion policy (messages deleted with user).
6. **`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS is_demo`** — needed so
   the scratch database (whose dog_profiles starts as the 001 stub) can build
   the is_demo index; a no-op in production where the column exists.
