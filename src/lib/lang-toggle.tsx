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
 *
 * Copy fix (2026-11-26): the FILLED pill marks the language currently shown;
 * the plain label beside it is the language the button switches TO. Before this,
 * the filled pill advertised the switch-to language, so a French visitor saw
 * "English" highlighted as if English were already selected.
 */
export function LangToggle({ lang, next = "/match", className = "" }: { lang: Lang; next?: string; className?: string }) {
  const other: Lang = lang === "fr" ? "en" : "fr";
  return (
    <form
      method="POST"
      action="/api/match/lang"
      role="group"
      aria-label={t("lang.label", lang)}
      className={`inline-flex items-center gap-1 rounded-full border border-[var(--pawls-cream-200)] bg-white px-2 py-1 text-xs ${className}`}
    >
      <input type="hidden" name="lang" value={other} />
      <input type="hidden" name="next" value={next} />
      {/* Current language — filled, never a submit target. */}
      <span
        aria-current="true"
        lang={lang}
        className="rounded-full bg-[var(--pawls-terracotta-500)] px-2.5 py-0.5 font-semibold text-white"
      >
        {lang.toUpperCase()}
      </span>
      {/* The language the button switches to. */}
      <button
        type="submit"
        lang={other}
        aria-label={`${t("lang.label", lang)} — ${t("lang.switchTo", lang)}`}
        className="px-1 font-medium text-gray-400 transition-colors hover:text-[var(--pawls-ink-700)]"
      >
        {t("lang.switchTo", lang)}
      </button>
    </form>
  );
}
