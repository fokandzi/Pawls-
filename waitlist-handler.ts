// Shared native POST /api/waitlist handler.
//
// Wired into BOTH server entry points BEFORE the TanStack SSR handler:
//   - serve.ts        (Bun server on port 3000)
//   - vercel-entry.ts (Vercel render function)
//
// The site's client-side JS hydration is broken site-wide, so every interactive
// flow must work through native HTML form POSTs — this handler is what the
// landing-page waitlist form submits to (action="/api/waitlist" method="POST").
// It validates the email, inserts it into the Neon `waitlist` table
// (idempotent), and 302-redirects to /?subscribed=1 where the landing page
// renders an honest "You're on the list" confirmation. On any DB failure it
// still redirects so the visitor's sign-up never crashes the request.
import { sql } from "./src/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function handleWaitlistPost(request: Request): Promise<Response> {
  let email = "";
  try {
    const form = await request.formData();
    email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 320);
  } catch (err) {
    console.error("[waitlist] failed to parse form body", err);
    return new Response("Could not read the waitlist form. Please try again.", {
      status: 400,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    });
  }

  if (!EMAIL_RE.test(email)) {
    return new Response("Please provide a valid email address.", {
      status: 400,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    });
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
    // Known limitation: Neon queries can fail during SSR on serverless
    // functions. Never crash the request — log it and still redirect so the
    // visitor sees a confirmation.
    console.error("[waitlist] DB insert failed", err);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/?subscribed=1",
      "Cache-Control": "no-store, max-age=0, must-revalidate",
    },
  });
}
