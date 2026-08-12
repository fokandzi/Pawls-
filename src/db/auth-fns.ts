import { createServerFn } from "@tanstack/react-start";
import { getSessionUser } from "../lib/auth/session";

/** Current session user (SSR + client-safe). Identity from cookie → DB only. */
export const getMe = createServerFn({ method: "GET" }).handler(async (ctx: any) => {
  const request = ctx?.request as Request | undefined;
  if (!request) return { user: null };
  const user = await getSessionUser(request);
  if (!user) return { user: null };
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      verified: user.emailVerified,
      role: user.role,
      preferredLanguage: user.preferredLanguage,
      country: user.country,
      city: user.city,
      timezone: user.timezone,
    },
  };
});
