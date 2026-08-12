-- ============================================================================
-- Pawls migration 003 — Real Match: UNKNOWN classification + demo-breeder honesty
-- (2026-08-12, owner directive rev 14 §7 + P0 Data follow-up)
--
-- APPLY:   bun run db:migrate
-- TEST:    bun run db:migrate --scratch
--
-- SCOPE:
--   1. dog_profiles.source CHECK extended ('user','demo','seed') ->
--      ('user','demo','seed','unknown'). Additive; the new value is the
--      owner-classified UNKNOWN state (UNKNOWN is not REAL; never deleted).
--   2. The 7 ambiguous dog profiles under the owner account (ids 31-37,
--      email wealthprosperity7@gmail.com, created 2026-08-11 by an older
--      seeded flow) are classified source='unknown' pending owner
--      confirmation. They are excluded from discovery/swipe/matches and are
--      NEVER destructively deleted.
--   3. Demo breeder fixtures must not carry semantically-real verification or
--      premium/plus entitlement states: is_demo=true rows are set to
--      verification_status='pending' and membership_tier='free'.
--
-- DOWN (documented for manual rollback; never auto-executed):
--   ALTER TABLE dog_profiles DROP CONSTRAINT IF EXISTS dog_profiles_source_check;
--   ALTER TABLE dog_profiles ADD CONSTRAINT dog_profiles_source_check CHECK (source IN ('user','demo','seed'));
--   UPDATE dog_profiles SET source='user', updated_at=NOW() WHERE id IN (31,32,33,34,35,36,37);
--   UPDATE breeders SET verification_status='verified' WHERE is_demo=true AND name='Labradors d'Île-de-France';  -- per-row restore as needed
-- ============================================================================

-- 1. extend the source CHECK constraint (drop the old unnamed auto-named one,
-- add the explicit new one)
ALTER TABLE dog_profiles DROP CONSTRAINT IF EXISTS dog_profiles_source_check;
ALTER TABLE dog_profiles ADD CONSTRAINT dog_profiles_source_check CHECK (source IN ('user','demo','seed','unknown'));

-- 2. UNKNOWN classification for the 7 ambiguous owner-account dog profiles
-- (reversible: UPDATE back to 'user' restores their prior state; rows are
-- never deleted)
UPDATE dog_profiles SET source = 'unknown', updated_at = NOW()
WHERE id IN (31, 32, 33, 34, 35, 36, 37);

-- 3. demo breeder fixtures: strip semantically-real verification/premium state
UPDATE breeders SET verification_status = 'pending', membership_tier = 'free'
WHERE is_demo = true
  AND (verification_status <> 'pending' OR membership_tier <> 'free');
