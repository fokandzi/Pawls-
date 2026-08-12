/**
 * Minimal FR/EN i18n scaffold — Match-scoped (seed of the full i18n phase).
 *
 * - `t(key, lang)` resolves a translation key for the given language.
 * - Dictionaries live in separate resource files (fr.ts / en.ts) — no
 *   hard-coded duplicated UI strings in Match components.
 * - Language comes from `users.preferred_language` (default 'fr' for new
 *   users). Full-site i18n is its own phase; only Match-critical strings are
 *   covered here.
 */
import { fr } from "./i18n/fr";
import { en } from "./i18n/en";

export type Lang = "fr" | "en";
export const LANGS: Lang[] = ["fr", "en"];
export const DEFAULT_LANG: Lang = "fr";

const dicts: Record<Lang, Record<string, string>> = { fr, en };

export function normalizeLang(value: unknown, fallback: Lang = DEFAULT_LANG): Lang {
  return value === "en" ? "en" : value === "fr" ? "fr" : fallback;
}

export function langFromLocale(locale: string | null | undefined): Lang {
  return normalizeLang(locale?.toLowerCase().slice(0, 2));
}

export function t(key: string, lang: Lang): string {
  const dict = dicts[lang] ?? en;
  if (key in dict) return dict[key];
  if (lang !== "en" && key in en) return en[key];
  return key;
}
