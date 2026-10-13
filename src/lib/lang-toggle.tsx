import { t, type Lang } from "./i18n";

/**
 * Explicit FR|EN toggle. Persists via the user's preferred_language
 * (POST /api/match/lang), then reloads so every surface renders in the new
 * language. Works without JS (native form POST).
 *
 * `next` is the route the visitor returns to after switching (defaults to
 * /match). Batch D2 wires it on the Book surfaces so switching language does not
 * throw the visitor out of the booking journey; /api/match/lang only accepts a
 * relative path or the Pawls hosts (no open redirect).
 */
export function LangToggle({ lang, next = "/match", className = "" }: { lang: Lang; next?: string; className?: string }) {
  return (
    <form method="POST" action="/api/match/lang" className={`inline-flex items-center gap-1 rounded-full border border-[var(--pawls-cream-200)] bg-white px-2 py-1 text-xs ${className}`}>
      <input type="hidden" name="lang" value={lang === "fr" ? "en" : "fr"} />
      <input type="hidden" name="next" value={next} />
      <span className="px-1 font-medium text-gray-400">{lang.toUpperCase()}</span>
      <button type="submit" className="rounded-full bg-[var(--pawls-terracotta-500)] px-2.5 py-0.5 font-semibold text-white transition-colors hover:bg-[var(--pawls-terracotta-700)]">
        {t("lang.switchTo", lang)}
      </button>
    </form>
  );
}
