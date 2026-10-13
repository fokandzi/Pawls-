/**
 * Route-level effective language (batch D2).
 *
 * The shipped FR-first matrix renders FR by default and switches the visitor to
 * their PERSISTED language (users.preferred_language) when the request carries a
 * session. `resolveRequestLang` does that resolution on the SERVER, so a route's
 * server-rendered HTML is already in the right language (not just after
 * hydration) — which is what makes FR-default / EN-toggle verifiable over real
 * HTTP. `resolveRouteLang` exposes the same thing as a server function for
 * routes whose loader does not already receive a Request.
 *
 * Never throws: an anonymous visitor, a broken session or an unreachable DB all
 * fall back to the FR default (DEFAULT_LANG), never to a mix of languages.
 */
import { createServerFn } from "@tanstack/react-start";
import { getSessionUser } from "../auth/session";
import { normalizeLang, DEFAULT_LANG, type Lang } from ".";

export async function resolveRequestLang(request: Request | null | undefined): Promise<Lang> {
  try {
    if (!request) return DEFAULT_LANG;
    const user = await getSessionUser(request);
    return normalizeLang(user?.preferredLanguage ?? null);
  } catch {
    return DEFAULT_LANG;
  }
}

export const resolveRouteLang = createServerFn({ method: "GET" }).handler(
  async ({ request }): Promise<Lang> => resolveRequestLang(request),
);
