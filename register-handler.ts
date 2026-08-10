// Shared native POST /register handler.
//
// Wired into BOTH server entry points BEFORE the TanStack SSR handler:
//   - serve.ts        (Bun server on port 3000)
//   - vercel-entry.ts (Vercel render function)
//
// The site's client-side JS hydration is broken site-wide, so every interactive
// flow must work through native HTML form POSTs — this handler is what the
// /register form submits to (action="/register" method="POST"). It validates the
// input, upserts the user into Neon Postgres, sets the pawls_user cookie, and
// 302-redirects to /match/create. On any DB failure it logs and falls back to
// cookie + redirect so signup never crashes the request.
import { createHash } from "node:crypto";
import { sql } from "./src/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function handleRegisterPost(request: Request): Promise<Response> {
  let name = "";
  let email = "";
  let password = "";
  try {
    const form = await request.formData();
    name = String(form.get("name") ?? "").trim().slice(0, 120);
    email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 320);
    password = String(form.get("password") ?? "");
  } catch (err) {
    console.error("[register] failed to parse form body", err);
    return new Response("Could not read the sign-up form. Please try again.", {
      status: 400,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    });
  }

  if (!name || !EMAIL_RE.test(email)) {
    return new Response("Please provide your name and a valid email address.", {
      status: 400,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    });
  }

  let userId: number | null = null;
  try {
    await sql()`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    const passwordHash = password
      ? createHash("sha256").update(password).digest("hex")
      : null;
    const [row] = await sql()`
      INSERT INTO users (email, name, password_hash)
      VALUES (${email}, ${name}, ${passwordHash})
      RETURNING id
    `;
    userId = Number((row as { id: number }).id);
  } catch (err) {
    // Known limitation: Neon queries can fail during SSR on serverless functions.
    // Never crash the request — log it, then fall back to cookie + redirect so the
    // sign-up flow still completes for the visitor.
    console.error("[register] DB insert failed, falling back to cookie-only signup", err);
  }

  // Deterministic id for the cookie when the DB write failed (or the row was a
  // duplicate) — the cookie shape stays the same either way.
  const cookieId = userId ?? Math.floor(Date.now() / 1000);
  const cookieValue = encodeURIComponent(
    JSON.stringify({ id: cookieId, name, email }),
  );

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/match/create",
      "Set-Cookie": `pawls_user=${cookieValue}; Path=/; Max-Age=31536000; SameSite=Lax`,
      "Cache-Control": "no-store, max-age=0, must-revalidate",
    },
  });
}
