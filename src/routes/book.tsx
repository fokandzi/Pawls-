import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppHeader, AppFooter } from "../lib/app-header";
import { DEFAULT_LANG, type Lang } from "../lib/i18n";
import { resolveRouteLang } from "../lib/i18n/route-lang";

/**
 * /book layout (batch D2 — FR-first).
 *
 * The language is resolved SERVER-SIDE from the session's persisted
 * `users.preferred_language` (FR default, never throws) so the shared header and
 * footer of every Book page are already in the visitor's language. Each Book
 * surface resolves its own copy the same way.
 */
export const Route = createFileRoute("/book")({
  loader: async (): Promise<{ lang: Lang }> => {
    try {
      return { lang: await resolveRouteLang() };
    } catch {
      return { lang: DEFAULT_LANG };
    }
  },
  component: BookLayout,
});

function BookLayout() {
  const data = Route.useLoaderData() as { lang?: Lang } | undefined;
  const lang: Lang = data?.lang ?? DEFAULT_LANG;
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader active="book" lang={lang} />
      <Outlet />
      <AppFooter lang={lang} />
    </div>
  );
}
