// Shared native POST /api/waitlist handler.
//
// Wired into BOTH server entry points BEFORE the TanStack SSR handler:
//   - serve.ts        (Bun server on port 3000)
//   - vercel-entry.ts (Vercel render function)
//
// The site's client-side JS hydration is broken site-wide, so every interactive
// flow must work through native HTML form POSTs — this handler is what the
// landing-page waitlist form submits to (action="/api/waitlist" method="POST").
// It validates the email and inserts it into the Neon `waitlist` table
// (idempotent), then redirects back to the landing page with a status the
// landing page renders honestly:
//
//   /?subscribed=1          the row really is in the table (success)
//   /?waitlist=invalid      the submitted email was not a valid address
//   /?waitlist=error        the insert FAILED — never shown as success
//
// Previously ANY DB error still redirected to /?subscribed=1, i.e. the visitor
// was told they had joined the list when nothing was stored. That false success
// is what the 2026-09-28 launch audit flagged; the handler now reports what
// actually happened.
import { sql } from "./src/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": "no-store, max-age=0, must-revalidate" },
  });
}

export async function handleWaitlistPost(request: Request): Promise<Response> {
  let email = "";
  try {
    const form = await request.formData();
    email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 320);
  } catch (err) {
    console.error("[waitlist] failed to parse form body", err);
    return redirect("/?waitlist=invalid#waitlist");
  }

  if (!EMAIL_RE.test(email)) {
    return redirect("/?waitlist=invalid#waitlist");
  }

  try {
    await sql()`
      CREATE TABLE IF NOT EXISTS waitlist (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql()`
      INSERT INTO waitlist (email) VALUES (${email})
      ON CONFLICT (email) DO NOTHING
    `;
  } catch (err) {
    // Neon queries can fail during SSR on serverless functions. Never crash the
    // request, but never claim success either: the visitor is sent back to the
    // form with an honest failure notice.
    console.error("[waitlist] DB insert failed — reporting failure (no success)", err);
    return redirect("/?waitlist=error#waitlist");
  }

  return redirect("/?subscribed=1#waitlist");
}
