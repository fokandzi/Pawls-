import { t, type Lang } from "./i18n";

/**
 * Explicit FR|EN toggle for the Match journey. Persists via the user's
 * preferred_language (POST /api/match/lang), then reloads so every Match
 * surface renders in the new language. Works without JS (native form POST).
 */
export function LangToggle({ lang, className = "" }: { lang: Lang; className?: string }) {
  return (
    <form method="POST" action="/api/match/lang" className={`inline-flex items-center gap-1 rounded-full border border-[var(--pawls-cream-200)] bg-white px-2 py-1 text-xs ${className}`}>
      <input type="hidden" name="lang" value={lang === "fr" ? "en" : "fr"} />
      <input type="hidden" name="next" value="/match" />
      <span className="px-1 font-medium text-gray-400">{lang.toUpperCase()}</span>
      <button type="submit" className="rounded-full bg-[var(--pawls-terracotta-500)] px-2.5 py-0.5 font-semibold text-white transition-colors hover:bg-[var(--pawls-terracotta-700)]">
        {t("lang.switchTo", lang)}
      </button>
    </form>
  );
}
