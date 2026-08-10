// Shared native POST /match/create handler.
//
// Wired into BOTH server entry points BEFORE the TanStack SSR handler:
//   - serve.ts        (Bun server on port 3000)
//   - vercel-entry.ts (Vercel render function)
//
// The site's client-side JS hydration is broken site-wide, so every interactive
// flow must work through native HTML form POSTs — this handler is what the
// /match/create form submits to (action="/match/create" method="POST"). It
// validates the input, ensures the dog_profiles table exists, INSERTs the dog
// profile into Neon Postgres, sets the pawnder-profile-id cookie, and
// 302-redirects to /match. On any DB failure it logs and returns a graceful 500
// page so the request never crashes.
//
// NOTE: the DDL below is intentionally raw SQL, not `createMatchTables()` from
// src/db/schema. `createMatchTables` is a `createServerFn` wrapper whose handler
// only runs when the call is rewritten by the TanStack vite plugin; in this
// standalone bundle (bun build vercel-entry.ts / bun serve.ts) calling it would
// silently no-op. Raw `sql()` DDL is the proven pattern from register-handler.ts.
import { sql } from "./src/db";

const REQUIRED_FIELDS = [
  "ownerName",
  "dogName",
  "breed",
  "age",
  "size",
  "energyLevel",
  "temperament",
  "location",
] as const;

const SIZES = new Set(["small", "medium", "large"]);
const ENERGY_LEVELS = new Set(["low", "medium", "high"]);

const NO_STORE = "no-store, max-age=0, must-revalidate";

function textResponse(body: string, status: number, contentType: string): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": `${contentType}; charset=utf-8`,
      "Cache-Control": NO_STORE,
    },
  });
}

/** Ensure the dog_profiles table (and its social columns) exists. */
async function ensureDogProfilesTable(): Promise<void> {
  await sql()`
    CREATE TABLE IF NOT EXISTS dog_profiles (
      id SERIAL PRIMARY KEY,
      owner_name TEXT NOT NULL,
      dog_name TEXT NOT NULL,
      breed TEXT NOT NULL,
      age INTEGER NOT NULL,
      size TEXT NOT NULL,
      energy_level TEXT NOT NULL,
      temperament TEXT NOT NULL,
      bio TEXT,
      photo_url TEXT,
      location TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS email TEXT`;
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS instagram TEXT`;
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS tiktok TEXT`;
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS twitter TEXT`;
  await sql()`ALTER TABLE dog_profiles ADD COLUMN IF NOT EXISTS youtube TEXT`;
}

export async function handleMatchCreatePost(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    console.error("[dog-profile] failed to parse form body", err);
    return textResponse(
      "Could not read the dog profile form. Please go back and try again.",
      400,
      "text/plain",
    );
  }

  const get = (key: string) => String(form.get(key) ?? "").trim();
  const fields = {
    ownerName: get("ownerName").slice(0, 120),
    dogName: get("dogName").slice(0, 120),
    breed: get("breed").slice(0, 120),
    age: get("age"),
    size: get("size"),
    energyLevel: get("energyLevel"),
    temperament: get("temperament").slice(0, 300),
    bio: get("bio").slice(0, 1000),
    location: get("location").slice(0, 200),
    email: get("email").slice(0, 320),
    instagram: get("instagram").slice(0, 300),
    tiktok: get("tiktok").slice(0, 300),
    twitter: get("twitter").slice(0, 300),
    youtube: get("youtube").slice(0, 300),
  };

  // Validate required fields with a readable message.
  const missing: string[] = [];
  for (const key of REQUIRED_FIELDS) {
    if (key === "age") {
      const age = Number(fields.age);
      if (!fields.age || !Number.isInteger(age) || age < 0 || age > 30) {
        missing.push("age (a whole number from 0 to 30)");
      }
    } else if (!fields[key]) {
      missing.push(key);
    }
  }
  if (missing.length) {
    return textResponse(
      `Please complete the required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
      400,
      "text/plain",
    );
  }
  if (!SIZES.has(fields.size)) {
    return textResponse("Please choose a valid size (small, medium, or large).", 400, "text/plain");
  }
  if (!ENERGY_LEVELS.has(fields.energyLevel)) {
    return textResponse(
      "Please choose a valid energy level (low, medium, or high).",
      400,
      "text/plain",
    );
  }

  const age = Number(fields.age);

  let profileId: number | null = null;
  try {
    await ensureDogProfilesTable();
    const [row] = await sql()`
      INSERT INTO dog_profiles (owner_name, dog_name, breed, age, size, energy_level, temperament, bio, location, email, instagram, tiktok, twitter, youtube)
      VALUES (
        ${fields.ownerName},
        ${fields.dogName},
        ${fields.breed},
        ${age},
        ${fields.size},
        ${fields.energyLevel},
        ${fields.temperament},
        ${fields.bio || null},
        ${fields.location},
        ${fields.email || null},
        ${fields.instagram || null},
        ${fields.tiktok || null},
        ${fields.twitter || null},
        ${fields.youtube || null}
      )
      RETURNING id
    `;
    profileId = Number((row as { id: number }).id);
  } catch (err) {
    // Known limitation: Neon queries can fail during SSR on serverless functions.
    // Never crash the request — log it and return a graceful 500 page.
    console.error("[dog-profile] DB insert failed", err);
    return textResponse(
      "<!doctype html><html><body style=\"font-family:system-ui,sans-serif;background:#faf6ef;color:#3d3d3d;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0\"><div style=\"text-align:center\"><h1 style=\"font-size:2rem\">Something went wrong 🐾</h1><p>We couldn't save your dog's profile right now. Please try again in a moment.</p></div></body></html>",
      500,
      "text/html",
    );
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/match",
      "Set-Cookie": `pawnder-profile-id=${profileId}; Path=/; Max-Age=31536000; SameSite=Lax`,
      "Cache-Control": NO_STORE,
    },
  });
}
