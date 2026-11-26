/**
 * Hand-run database maintenance — the ONLY home for DDL and fixture seeding.
 *
 * Finding S1 (F3): these used to be `createServerFn`s, so anyone who read the
 * client bundle could POST a public id and run `CREATE TABLE` / `ALTER TABLE` /
 * fixture INSERTs against the live database with no session at all. They are
 * now plain functions in a script that is never imported by the app and is
 * never compiled into the server or client bundle.
 *
 * The schema's source of truth is `src/db/migrations/*.sql` (run with
 * `bun run db:migrate`). This script only carries the idempotent safety nets
 * that used to be triggered from page views, plus the fixture seeds.
 *
 * Usage (never from the app, never from a request):
 *   bun run scripts/db-maintenance.ts ddl     # idempotent CREATE/ALTER safety nets
 *   bun run scripts/db-maintenance.ts seed    # fixture seeds (refuses production)
 *   bun run scripts/db-maintenance.ts all
 */
import { sql } from "../src/db";
import { ensureBookingTablesSql, ensureMatchTables, ensureReferralsTable } from "../src/db/schema";
import { seedProviders, seedDogProfiles } from "../src/db/seed";

/** Breeders + litters (migration 002 is the source of truth). */
async function ensureBreedTables(): Promise<void> {
  await sql()`
    CREATE TABLE IF NOT EXISTS breeders (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT NOT NULL,
      breed_specialty TEXT NOT NULL,
      verification_status TEXT DEFAULT 'pending',
      membership_tier TEXT DEFAULT 'free',
      years_experience INTEGER DEFAULT 0,
      health_testing TEXT,
      image_url TEXT,
      is_demo BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql()`
    CREATE TABLE IF NOT EXISTS litters (
      id SERIAL PRIMARY KEY,
      breeder_id INTEGER REFERENCES breeders(id),
      breed TEXT NOT NULL,
      birth_date DATE NOT NULL,
      available_count INTEGER NOT NULL DEFAULT 1,
      total_count INTEGER NOT NULL DEFAULT 1,
      price_cents INTEGER NOT NULL,
      health_tests TEXT,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql()`ALTER TABLE breeders ADD COLUMN IF NOT EXISTS email TEXT`;
}

/** Venues (migration 002 is the source of truth). */
async function ensureVenuesTable(): Promise<void> {
  await sql()`
    CREATE TABLE IF NOT EXISTS venues (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      lat NUMERIC(10,7) NOT NULL,
      lng NUMERIC(10,7) NOT NULL,
      description TEXT,
      dog_features TEXT[],
      rating NUMERIC(3,1) DEFAULT 4.5,
      image_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

/** Shelters + rescue dogs (migration 002 is the source of truth). */
async function ensureRescueTables(): Promise<void> {
  await sql()`
    CREATE TABLE IF NOT EXISTS shelters (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      website TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql()`
    CREATE TABLE IF NOT EXISTS rescue_dogs (
      id SERIAL PRIMARY KEY,
      shelter_id INTEGER REFERENCES shelters(id),
      name TEXT NOT NULL,
      breed TEXT NOT NULL,
      age INTEGER NOT NULL,
      size TEXT NOT NULL,
      gender TEXT NOT NULL,
      description TEXT NOT NULL,
      good_with_dogs BOOLEAN DEFAULT true,
      good_with_kids BOOLEAN DEFAULT true,
      good_with_cats BOOLEAN DEFAULT false,
      photo_url TEXT,
      urgent BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

async function runDdl(): Promise<void> {
  await ensureBookingTablesSql();
  await ensureMatchTables();
  await ensureBreedTables();
  await ensureVenuesTable();
  await ensureRescueTables();
  await ensureReferralsTable();
  console.log("ddl: ok (booking, match, breed, venues, rescue, referrals)");
}

async function runSeeds(): Promise<void> {
  // Both seeds call assertNotProductionSeeding() first and are no-ops when
  // rows already exist.
  console.log("seed providers:", JSON.stringify(await seedProviders()));
  console.log("seed dog profiles:", JSON.stringify(await seedDogProfiles()));
}

const what = (process.argv[2] ?? "").trim();
if (what === "ddl") await runDdl();
else if (what === "seed") await runSeeds();
else if (what === "all") {
  await runDdl();
  await runSeeds();
} else {
  console.error("usage: bun run scripts/db-maintenance.ts <ddl|seed|all>");
  process.exit(2);
}
