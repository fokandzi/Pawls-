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
import { getSessionUser } from "./src/lib/auth/session";
import { assertSameOrigin } from "./src/lib/auth/csrf";
import { trackServerEvent } from "./src/lib/analytics";
import { validateDogPhotoFile, uploadDogPhoto } from "./src/lib/dog-photo";
import { errorPage } from "./src/lib/auth/pages";

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

  // Auth: dog profile creation requires a real session. The owning user_id is
  // taken from the session — never from the client.
  const csrfCheck = assertSameOrigin(request);
  if (!csrfCheck.ok) {
    return textResponse(csrfCheck.error, 403, "text/plain");
  }
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/login?next=/match/create", "Cache-Control": NO_STORE },
    });
  }
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

  // Optional dog photo: validated (JPEG/PNG/WebP, ≤ 4 MB, content-sniffed) and
  // uploaded to real object storage through the shared dog-photo core.
  //
  // Honesty rules (P0 batch B):
  //   - an invalid file is refused with FR copy BEFORE any row is written;
  //   - if the file is valid but storage is unavailable (no UPLOADTHING_TOKEN,
  //     SDK error, timeout) the profile is still created WITHOUT a photo and the
  //     user is sent to /match/my-dogs?photo=failed, where an honest banner says
  //     the photo was not uploaded and offers the upload control again.
  //     We never claim the photo was saved, and we never write a dead URL.
  const photo = form.get("photo");
  let photoUrl: string | null = null;
  let photoFailed = false;
  let photoUnavailable = false;
  if (photo instanceof File && photo.size > 0) {
    const validation = await validateDogPhotoFile(photo);
    if (!validation.ok) {
      console.error(`[dog-profile] rejected photo: ${validation.log}`);
      return errorPage(request, {
        titleKey: validation.titleKey,
        bodyKey: validation.bodyKey,
        status: validation.status,
        links: [
          { href: "/match/create", labelKey: "photo.nav.create" },
          { href: "/", labelKey: "auth.nav.home" },
        ],
      });
    }
    const uploaded = await uploadDogPhoto(validation.file);
    if (uploaded.ok) {
      photoUrl = uploaded.url;
      console.log("[dog-profile] photo uploaded:", photoUrl);
    } else {
      // Not silent: the user will be told, and the profile keeps no photo URL.
      photoFailed = true;
      // 503 = object storage is not configured here (missing / malformed token,
      // or the SDK rejected the credential). That is a different message from a
      // transient upload failure, so the banner says so instead of inviting a
      // retry that can never succeed.
      if (uploaded.status === 503) photoUnavailable = true;
      console.error(`[dog-profile] photo NOT uploaded (${uploaded.status}): ${uploaded.log}`);
    }
  }

  const age = Number(fields.age);

  let profileId: number | null = null;
  try {
    await ensureDogProfilesTable();
    const [row] = await sql()`
      INSERT INTO dog_profiles (owner_name, dog_name, breed, age, size, energy_level, temperament, bio, photo_url, location, email, instagram, tiktok, twitter, youtube, user_id, country, source)
      VALUES (
        ${fields.ownerName},
        ${fields.dogName},
        ${fields.breed},
        ${age},
        ${fields.size},
        ${fields.energyLevel},
        ${fields.temperament},
        ${fields.bio || null},
        ${photoUrl},
        ${fields.location},
        ${fields.email || null},
        ${fields.instagram || null},
        ${fields.tiktok || null},
        ${fields.twitter || null},
        ${fields.youtube || null},
        ${sessionUser.id},
        'FR',
        'user'
      )
      RETURNING id
    `;
    profileId = Number((row as { id: number }).id);
    // Pass-through acquisition funnel completion: a dog profile is only created
    // for a fully registered + verified user, so this is the point where signup
    // genuinely completes. Emit consent-gated events carrying the campaign. All
    // of this is non-fatal and stays OFF until a real consumption key exists.
    try {
      const attr = await sql()`
        SELECT campaign, source FROM acquisition_signups WHERE user_id = ${sessionUser.id} LIMIT 1
      ` as any;
      if (attr && attr[0]) {
        const campaign = String(attr[0].campaign ?? "");
        const source = attr[0].source ? String(attr[0].source) : undefined;
        const props = {
          campaign,
          source,
          distinct_id: String(sessionUser.id),
          dog_id: profileId,
        };
        await trackServerEvent("signup_complete", props);
        await trackServerEvent("dog_created", props);
      }
    } catch (err) {
      console.error("[dog-profile] attribution event failed (non-fatal)", err);
    }
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
    // Honest landing: if a photo was supplied but could not be stored, the user
    // lands on the management page with an explicit "photo not uploaded" banner
    // (and the upload control) instead of a page that implies everything worked.
    headers: {
      Location: photoUnavailable
        ? "/match/my-dogs?photo=unavailable"
        : photoFailed
          ? "/match/my-dogs?photo=failed"
          : "/match",
      "Cache-Control": NO_STORE,
    },
  });
}
