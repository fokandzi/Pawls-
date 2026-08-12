/**
 * Real Match — core server logic (Pawls Phase-1, owner directive rev 14 §7).
 *
 * Everything here runs server-side only (imported by match-api-handler.ts).
 * Identity always comes from the session — the swiper dog id is derived from
 * the authenticated user's own dogs, never from client input.
 *
 * Isolation rule (documented): real users only ever see other REAL users' dogs;
 * TEST users (is_test=true, created by the test harness) only ever see other
 * TEST users' dogs. This keeps harness traffic completely invisible to real
 * discovery while exercising the exact same code paths.
 *
 * Market rule (Phase-1 Paris): a dog with `country` NULL is treated as
 * in-market (legacy rows predate the country column); a dog with a country set
 * that is not the active market's country is excluded. The active market is a
 * single configuration point (MARKET_COUNTRY) — future markets become a table.
 *
 * UNKNOWN rule (owner, 2026-08-12): ambiguous legacy records classified
 * source='unknown' are NOT real and are excluded from discovery/swipe/matches.
 * They are never destructively deleted.
 *
 * Neon notes: this driver (v1.1) only supports tagged-template queries.
 * `sql` (imported from ../db) is a FACTORY returning a query function — the
 * helpers live on the RESULT: sql().unsafe(), sql().query(), sql().transaction().
 * Calling the query function itself with plain args throws. Transactions take
 * a SYNC callback returning an array of queries. The swipe path needs
 * data-dependent logic (match insert only when the reverse like exists), so it
 * is one atomic statement built from data-modifying CTEs.
 */
import { sql } from "../db";

/** Single query handle (sql() is a factory; helpers live on its result). */
const q = sql();

/** Active Phase-1 market (ISO 3166-1 alpha-2). NULL country = in-market. */
export const MARKET_COUNTRY = "FR";

/** Dog sources that represent real, user-created dogs. Everything else
 * (demo/seed fixtures and the owner-classified 'unknown' set) is excluded. */
const REAL_SOURCES = ["user"];

export interface SessionDog {
  id: number;
  dog_name: string;
}

export interface DiscoveryDog {
  id: number;
  dog_name: string;
  breed: string;
  age: number | null;
  size: string | null;
  energy_level: string | null;
  temperament: string | null;
  bio: string | null;
  photo_url: string | null;
  location: string | null;
  city: string | null;
  owner_name: string | null;
}

/** All dogs owned by a user, ordered by id (primary = first row by id). */
export async function getUserDogs(userId: number): Promise<SessionDog[]> {
  const rows = await q`
    SELECT id, dog_name FROM dog_profiles
    WHERE user_id = ${userId}
    ORDER BY id ASC
  `;
  return (rows as any[]).map((r) => ({ id: Number(r.id), dog_name: String(r.dog_name) }));
}

/**
 * Swiper semantics (documented): the session user's PRIMARY dog is the first
 * dog_profiles row by id. Multi-dog swipe selection is a future feature.
 */
export async function primaryDogId(userId: number): Promise<number | null> {
  const dogs = await getUserDogs(userId);
  return dogs.length > 0 ? dogs[0]!.id : null;
}

/**
 * Candidate SQL fragment shared by discovery and swipe eligibility.
 * The already-swiped exclusion is intentionally NOT included here — the swipe
 * endpoint must accept idempotent duplicate swipes (same row, no error).
 * All values are server-controlled (never client input) and safe to embed.
 */
function candidateWhere(sessionUserId: number, sessionUserIsTest: boolean): string {
  const testClause = sessionUserIsTest ? "u.is_test = true" : "u.is_test = false";
  return `
    dp.user_id IS NOT NULL
    AND dp.user_id <> ${sessionUserId}
    AND dp.is_demo = false
    AND dp.source = ANY('{"user"}'::text[])
    AND ${testClause}
    AND u.email_verified_at IS NOT NULL
    AND dp.profile_visibility = 'public'
    AND (dp.country IS NULL OR dp.country = '${MARKET_COUNTRY}')
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_user_id = ${sessionUserId} AND b.blocked_user_id = dp.user_id)
         OR (b.blocker_user_id = dp.user_id AND b.blocked_user_id = ${sessionUserId})
    )
  `;
}

/** Discovery feed for the /match deck — candidates for the session user. */
export async function discoveryCandidates(sessionUserId: number, sessionUserIsTest: boolean): Promise<DiscoveryDog[]> {
  const where = candidateWhere(sessionUserId, sessionUserIsTest);
  const rows = await q`
    SELECT
      dp.id, dp.dog_name, dp.breed, dp.age, dp.size, dp.energy_level,
      dp.temperament, dp.bio, dp.photo_url, dp.location, dp.city,
      u.name AS owner_name
    FROM dog_profiles dp
    JOIN users u ON u.id = dp.user_id
    WHERE ${q.unsafe(where)}
      AND NOT EXISTS (
        SELECT 1 FROM swipes s
        WHERE s.swiper_profile_id IN (
          SELECT id FROM dog_profiles WHERE user_id = ${sessionUserId}
        )
        AND s.target_profile_id = dp.id
      )
    ORDER BY dp.id ASC
  `;
  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    dog_name: String(r.dog_name),
    breed: String(r.breed),
    age: r.age === null || r.age === undefined ? null : Number(r.age),
    size: r.size ?? null,
    energy_level: r.energy_level ?? null,
    temperament: r.temperament ?? null,
    bio: r.bio ?? null,
    photo_url: r.photo_url ?? null,
    location: r.location ?? null,
    city: r.city ?? null,
    owner_name: r.owner_name ?? null,
  }));
}

export interface SwipeResult {
  ok: boolean;
  status: number;
  error?: string;
  matchCreated: boolean;
  matchId: number | null;
  duplicate: boolean;
}

/**
 * Persist a swipe. Swiper dog id always comes from the session (primary dog).
 * Target eligibility is re-checked server-side at swipe time; forged or
 * ineligible targets are rejected (no row written). Idempotent per
 * (swiper, target, direction); direction changes are allowed (new row).
 * A 'like' atomically checks for the reverse 'like' and, if present, inserts
 * exactly ONE canonical match row (p1 < p2 enforced by the DB constraint,
 * ON CONFLICT DO NOTHING makes duplicates impossible). Passes never match.
 */
export async function recordSwipe(
  sessionUserId: number,
  sessionUserIsTest: boolean,
  targetDogId: number,
  direction: string,
): Promise<SwipeResult> {
  if (direction !== "like" && direction !== "pass") {
    return { ok: false, status: 400, error: "direction must be 'like' or 'pass'", matchCreated: false, matchId: null, duplicate: false };
  }
  const swiperDogId = await primaryDogId(sessionUserId);
  if (!swiperDogId) {
    return { ok: false, status: 400, error: "create a dog profile before swiping", matchCreated: false, matchId: null, duplicate: false };
  }
  if (targetDogId === swiperDogId) {
    return { ok: false, status: 400, error: "you cannot swipe on your own dog", matchCreated: false, matchId: null, duplicate: false };
  }

  // Re-check target eligibility exactly like discovery (minus the
  // already-swiped exclusion, which idempotency requires).
  const where = candidateWhere(sessionUserId, sessionUserIsTest);
  const eligible = await q`
    SELECT dp.id
    FROM dog_profiles dp
    JOIN users u ON u.id = dp.user_id
    WHERE dp.id = ${targetDogId} AND ${q.unsafe(where)}
    LIMIT 1
  `;
  if (!eligible.length) {
    return { ok: false, status: 404, error: "target dog is not available", matchCreated: false, matchId: null, duplicate: false };
  }

  const targetId = Number(targetDogId);
  const p1 = Math.min(swiperDogId, targetId);
  const p2 = Math.max(swiperDogId, targetId);

  // Single atomic statement: insert the swipe (idempotent), then — only for
  // 'like' with a reverse 'like' present — insert ONE canonical match row.
  const result = await q`
    WITH ins AS (
      INSERT INTO swipes (swiper_profile_id, target_profile_id, direction)
      VALUES (${swiperDogId}, ${targetId}, ${direction})
      ON CONFLICT (swiper_profile_id, target_profile_id, direction) DO NOTHING
      RETURNING id
    ),
    m AS (
      INSERT INTO matches (profile_id_1, profile_id_2, state, created_by_system)
      SELECT ${p1}, ${p2}, 'active', false
      WHERE ${direction} = 'like' AND EXISTS (
        SELECT 1 FROM swipes
        WHERE swiper_profile_id = ${targetId} AND target_profile_id = ${swiperDogId} AND direction = 'like'
      )
      ON CONFLICT (profile_id_1, profile_id_2) DO NOTHING
      RETURNING id
    )
    SELECT
      (SELECT count(*) FROM ins) AS swipe_inserted,
      (SELECT id FROM m LIMIT 1) AS match_id
  `;
  const row = result[0] as any;
  const swipeInserted = Number(row?.swipe_inserted ?? 0) > 0;
  const matchId = row?.match_id != null ? Number(row.match_id) : null;

  return {
    ok: true,
    status: 200,
    matchCreated: matchId !== null,
    matchId,
    duplicate: !swipeInserted,
  };
}

export interface MatchInfo {
  id: number;
  other_dog_id: number;
  dog_name: string;
  breed: string;
  size: string | null;
  energy_level: string | null;
  temperament: string | null;
  bio: string | null;
  photo_url: string | null;
  location: string | null;
  city: string | null;
  owner_name: string | null;
  created_at: string;
}

/** Matches visible to the session user (joined on their own dog ids).
 * Never returns exact coordinates — only public profile fields. */
export async function matchesForUser(sessionUserId: number, sessionUserIsTest: boolean): Promise<MatchInfo[]> {
  const testClause = sessionUserIsTest ? "u.is_test = true" : "u.is_test = false";
  const rows = await q`
    SELECT
      m.id,
      CASE WHEN m.profile_id_1 = ANY(ARRAY(SELECT id FROM dog_profiles WHERE user_id = ${sessionUserId}))
           THEN m.profile_id_2 ELSE m.profile_id_1 END AS other_dog_id,
      m.created_at
    FROM matches m
    WHERE (m.profile_id_1 IN (SELECT id FROM dog_profiles WHERE user_id = ${sessionUserId})
        OR m.profile_id_2 IN (SELECT id FROM dog_profiles WHERE user_id = ${sessionUserId}))
      AND m.state = 'active'
    ORDER BY m.created_at DESC
  ` as any[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => Number(r.other_dog_id));
  const dogs = await q`
    SELECT
      dp.id, dp.dog_name, dp.breed, dp.size, dp.energy_level, dp.temperament,
      dp.bio, dp.photo_url, dp.location, dp.city, u.name AS owner_name
    FROM dog_profiles dp
    JOIN users u ON u.id = dp.user_id
    WHERE dp.id = ANY(${ids})
      AND dp.is_demo = false
      AND dp.source = ANY('{"user"}'::text[])
      AND ${q.unsafe(testClause)}
  `;
  const byId = new Map<number, any>();
  for (const d of dogs as any[]) byId.set(Number(d.id), d);

  return rows
    .map((r) => {
      const d = byId.get(Number(r.other_dog_id));
      if (!d) return null; // other dog no longer real/eligible — hide the match
      return {
        id: Number(r.id),
        other_dog_id: Number(r.other_dog_id),
        dog_name: String(d.dog_name),
        breed: String(d.breed),
        size: d.size ?? null,
        energy_level: d.energy_level ?? null,
        temperament: d.temperament ?? null,
        bio: d.bio ?? null,
        photo_url: d.photo_url ?? null,
        location: d.location ?? null,
        city: d.city ?? null,
        owner_name: d.owner_name ?? null,
        created_at: String(r.created_at),
      };
    })
    .filter((m): m is MatchInfo => m !== null);
}

// ── Dog management (edit / delete, ownership enforced) ──────────────────────

const SIZES = new Set(["small", "medium", "large"]);
const ENERGY = new Set(["low", "medium", "high"]);
const SEXES = new Set(["male", "female"]);

function cleanStr(v: unknown, max: number): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v).trim().slice(0, max) || null;
}

export interface EditDogResult {
  ok: boolean;
  status: number;
  error?: string;
}

/** PATCH the session user's own dog. Ownership is enforced server-side. */
export async function editDog(sessionUserId: number, dogId: number, fields: Record<string, unknown>): Promise<EditDogResult> {
  const dogIdNum = Number(dogId);
  if (!Number.isSafeInteger(dogIdNum) || dogIdNum <= 0) {
    return { ok: false, status: 400, error: "invalid dog id" };
  }
  const owned = await q`
    SELECT id FROM dog_profiles WHERE id = ${dogIdNum} AND user_id = ${sessionUserId}
  `;
  if (!owned.length) {
    return { ok: false, status: 404, error: "dog not found or not owned by you" };
  }

  const sets: string[] = [];
  const vals: unknown[] = [];

  const add = (col: string, val: unknown) => {
    sets.push(`${col} = $${sets.length + 1}`);
    vals.push(val);
  };

  const name = cleanStr(fields.dog_name, 120);
  if (name !== null) add("dog_name", name);
  const breed = cleanStr(fields.breed, 120);
  if (breed !== null) add("breed", breed);
  const temperament = cleanStr(fields.temperament, 300);
  if (temperament !== null) add("temperament", temperament);
  const bio = cleanStr(fields.bio, 1000);
  if (bio !== null) add("bio", bio);
  const vaccination = cleanStr(fields.vaccination_status, 60);
  if (vaccination !== null) add("vaccination_status", vaccination);

  const sex = cleanStr(fields.sex, 20);
  if (sex !== null) {
    if (!SEXES.has(sex)) return { ok: false, status: 400, error: "sex must be 'male', 'female' or empty" };
    add("sex", sex);
  } else {
    add("sex", null);
  }

  const energy = cleanStr(fields.energy_level, 20);
  if (energy !== null) {
    if (!ENERGY.has(energy)) return { ok: false, status: 400, error: "energy_level must be low/medium/high" };
    add("energy_level", energy);
  }

  const dob = cleanStr(fields.date_of_birth, 10);
  if (dob !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return { ok: false, status: 400, error: "date_of_birth must be YYYY-MM-DD" };
    const d = new Date(dob + "T00:00:00Z");
    if (Number.isNaN(d.getTime()) || d.getTime() > Date.now()) {
      return { ok: false, status: 400, error: "date_of_birth is invalid or in the future" };
    }
    add("date_of_birth", dob);
  } else {
    add("date_of_birth", null);
  }

  if (fields.weight_kg !== undefined && fields.weight_kg !== null && fields.weight_kg !== "") {
    const w = Number(fields.weight_kg);
    if (!Number.isFinite(w) || w < 0.5 || w > 150) {
      return { ok: false, status: 400, error: "weight_kg must be between 0.5 and 150" };
    }
    add("weight_kg", w);
  } else {
    add("weight_kg", null);
  }

  for (const key of ["dog_friendly", "child_friendly", "neutered_spayed"] as const) {
    const v = fields[key];
    if (v === "true" || v === true) add(key, true);
    else if (v === "false" || v === false) add(key, false);
    else if (v === "" || v === null || v === undefined) add(key, null);
    else return { ok: false, status: 400, error: `${key} must be true/false` };
  }

  const vis = cleanStr(fields.profile_visibility, 20);
  if (vis !== null) {
    if (vis !== "public" && vis !== "hidden") {
      return { ok: false, status: 400, error: "profile_visibility must be 'public' or 'hidden'" };
    }
    add("profile_visibility", vis);
  }

  if (sets.length === 0) return { ok: true, status: 200 }; // nothing to change
  // Dynamic SET clause: interpolate values first so $1..$n map correctly.
  const setSql = `${sets.join(", ")}, updated_at = NOW()`;
  const params = [...vals, dogIdNum, sessionUserId];
  await q.query(
    `UPDATE dog_profiles SET ${setSql} WHERE id = $${params.length - 1} AND user_id = $${params.length}`,
    params,
  );
  return { ok: true, status: 200 };
}

export interface DeleteDogResult {
  ok: boolean;
  status: number;
  error?: string;
}

/**
 * Delete the session user's own dog. FK actions on swipes/matches are NOT
 * cascading, so related rows are deleted explicitly in one transaction
 * (never leave orphans, never touch other users' data). messages.sender_profile_id
 * and bookings.dog_id are ON DELETE SET NULL — safe.
 */
export async function deleteDog(sessionUserId: number, dogId: number): Promise<DeleteDogResult> {
  const dogIdNum = Number(dogId);
  if (!Number.isSafeInteger(dogIdNum) || dogIdNum <= 0) {
    return { ok: false, status: 400, error: "invalid dog id" };
  }
  const owned = await q`
    SELECT id FROM dog_profiles WHERE id = ${dogIdNum} AND user_id = ${sessionUserId}
  `;
  if (!owned.length) {
    return { ok: false, status: 404, error: "dog not found or not owned by you" };
  }
  await q.transaction((tx) => [
    tx`DELETE FROM swipes WHERE swiper_profile_id = ${dogIdNum} OR target_profile_id = ${dogIdNum}`,
    tx`DELETE FROM matches WHERE profile_id_1 = ${dogIdNum} OR profile_id_2 = ${dogIdNum}`,
    tx`DELETE FROM messages WHERE sender_profile_id = ${dogIdNum}`,
    tx`DELETE FROM dog_profiles WHERE id = ${dogIdNum}`,
  ]);
  return { ok: true, status: 200 };
}

export async function setUserLanguage(userId: number, lang: string): Promise<boolean> {
  if (lang !== "fr" && lang !== "en") return false;
  await q`UPDATE users SET preferred_language = ${lang}, updated_at = NOW() WHERE id = ${userId}`;
  return true;
}

/** Full dog rows for the management UI (edit prefill). */
export async function getMyDogs(sessionUserId: number): Promise<any[]> {
  const rows = await q`
    SELECT id, dog_name, breed, age, size, energy_level, temperament, bio,
           photo_url, location, city, country, sex, date_of_birth, weight_kg,
           dog_friendly, child_friendly, vaccination_status, neutered_spayed,
           profile_visibility
    FROM dog_profiles
    WHERE user_id = ${sessionUserId}
    ORDER BY id ASC
  `;
  return (rows as any[]).map((r) => ({
    ...r,
    id: Number(r.id),
    age: r.age === null || r.age === undefined ? null : Number(r.age),
    weight_kg: r.weight_kg === null || r.weight_kg === undefined ? null : Number(r.weight_kg),
    date_of_birth: r.date_of_birth ? String(r.date_of_birth) : null,
    dog_friendly: r.dog_friendly === null ? null : !!r.dog_friendly,
    child_friendly: r.child_friendly === null ? null : !!r.child_friendly,
    neutered_spayed: r.neutered_spayed === null ? null : !!r.neutered_spayed,
  }));
}
