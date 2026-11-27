/**
 * Structural + dictionary checks for the FR-first SSR titles (P2 item 5).
 *
 * Run: `bun test src/lib/seo-titles.test.ts`
 *
 * The audit found EN-only SSR <title> on /match/my-dogs, /match/matches,
 * /match/conversations(+/$id), /viral, /invite, /breed/$id, /rescue/$id and the
 * root/404 title. Those routes now resolve their title from the i18n dictionary
 * (the pattern /match, /book and /venues already used) instead of the static
 * EN-only `SEO` map. This test locks that in without needing a browser:
 *   1. every new key resolves in FR and in EN, reads "… — Pawls"/"… | Pawls"
 *      and is not a raw-key fallback;
 *   2. each route file actually calls `t("<key>", <lang>)`, where <lang> is the
 *      route's resolved language (`L`, derived from the loader with
 *      `?? DEFAULT_LANG`) or `DEFAULT_LANG` itself on the routes that resolve
 *      no route language; `DEFAULT_LANG` stays the fallback, `seoHead(` is used,
 *      and no hardcoded title string survives;
 *   3. the root route no longer hard-codes the EN default title/description.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { t } from "./i18n";

const ROUTES = join(import.meta.dir, "..", "routes");
const read = (file: string) => readFileSync(join(ROUTES, file), "utf8");

/**
 * [route file, i18n key used for the SSR title, language expression passed to `t`]
 *
 * `L` = the route's resolved language (FR-first, read from the loader). Routes
 * that resolve no route language must still pass `DEFAULT_LANG` explicitly.
 */
type TitleWiring = { file: string; key: string; lang: "L" | "DEFAULT_LANG" };

const TITLE_WIRING: TitleWiring[] = [
  { file: "match.my-dogs.tsx", key: "mydogs.title", lang: "DEFAULT_LANG" },
  { file: "match.matches.tsx", key: "matches.title", lang: "DEFAULT_LANG" },
  { file: "match.conversations.tsx", key: "msg.title", lang: "DEFAULT_LANG" },
  { file: "match.conversations_.$id.tsx", key: "msg.threadTitle", lang: "DEFAULT_LANG" },
  { file: "viral.tsx", key: "viral.title", lang: "L" },
  { file: "invite.tsx", key: "invite.seoTitle", lang: "L" },
  { file: "breed.$breederId.tsx", key: "breederDetail.seoTitle", lang: "L" },
  { file: "rescue.$dogId.tsx", key: "rescueDetail.seoTitle", lang: "L" },
];

/** Every title/description key added by item 5 must resolve in both languages. */
const NEW_KEYS = [
  "root.title",
  "root.seoDesc",
  "mydogs.seoDesc",
  "matches.seoDesc",
  "msg.seoDesc",
  "msg.threadTitle",
  "msg.threadDesc",
  "viral.title",
  "viral.seoDesc",
  "invite.seoTitle",
  "invite.seoDesc",
  "breederDetail.seoTitle",
  "breederDetail.seoDesc",
  "breederDetail.seoNamedTitle",
  "breederDetail.seoNamedDesc",
  "rescueDetail.seoTitle",
  "rescueDetail.seoDesc",
  "rescueDetail.seoNamedTitle",
  "rescueDetail.seoNamedDesc",
];

const isTitle = (key: string) => key.endsWith(".title") || key.endsWith(".seoTitle") || key === "root.title";

describe("FR SEO title keys", () => {
  for (const key of NEW_KEYS) {
    test(`${key} resolves in FR and EN`, () => {
      const fr = t(key, "fr");
      const en = t(key, "en");
      expect(fr).not.toBe(key); // no raw-key fallback
      expect(en).not.toBe(key);
      expect(fr.length).toBeGreaterThan(0);
      expect(en.length).toBeGreaterThan(0);
    });
  }

  for (const key of NEW_KEYS.filter(isTitle)) {
    test(`${key} keeps the app's "… — Pawls" title pattern`, () => {
      const fr = t(key, "fr");
      expect(fr).toContain("Pawls");
      // Sibling routes use "—" (match.title, matches.title, mydogs.title) or "|".
      expect(fr.includes("—") || fr.includes("|")).toBe(true);
      // The title must be FR, not the EN string served by the old SEO map.
      expect(fr).not.toBe(t(key, "en"));
    });
  }
});

describe("route wiring (no EN-only titles left)", () => {
  for (const { file, key, lang } of TITLE_WIRING) {
    test(`${file} renders its title from t("${key}", ${lang})`, () => {
      const src = read(file);
      // The title is dictionary-driven, in the route's own language.
      expect(src).toContain(`t("${key}", ${lang})`);
      expect(src).toContain("seoHead(");
      // DEFAULT_LANG is still there as the fallback, never dropped.
      expect(src).toContain("DEFAULT_LANG");

      if (lang === "L") {
        // `L` must be the language the loader resolved, defaulting to DEFAULT_LANG
        // — not a bare constant and not a hardcoded "fr".
        expect(src).toMatch(
          /const L: Lang = \(loaderData as \{[^{}]*\}[^)]*\)\?\.lang \?\? DEFAULT_LANG;/,
        );
        expect(src).toContain("resolveRouteLang");
        expect(src).toContain("?? DEFAULT_LANG");
      }
    });

    test(`${file} has no hardcoded title string`, () => {
      const src = read(file);
      const titleLines = src
        .split("\n")
        .filter((line) => /^\s*title:/.test(line));
      expect(titleLines.length).toBeGreaterThan(0);
      for (const line of titleLines) {
        // Every SSR title must come from the dictionary, in a resolved language.
        expect(line).toMatch(
          /^\s*title: (seoFill\()?t\("[^"]+", (L|DEFAULT_LANG)\)/,
        );
      }
    });
  }

  test("the match/viral routes no longer read the EN-only SEO map", () => {
    for (const file of [
      "match.matches.tsx",
      "match.conversations.tsx",
      "match.conversations_.$id.tsx",
      "viral.tsx",
    ]) {
      const src = read(file);
      expect(src).not.toContain("SEO[");
      expect(src).not.toContain("SEO.viral");
    }
  });

  test("private pages keep noIndex", () => {
    expect(read("match.conversations.tsx")).toContain("noIndex: true");
    expect(read("match.conversations_.$id.tsx")).toContain("noIndex: true");
  });

  test("root route no longer hard-codes the EN default title/description", () => {
    const src = read("__root.tsx");
    expect(src).toContain('t("root.title", DEFAULT_LANG)');
    expect(src).toContain('t("root.seoDesc", DEFAULT_LANG)');
    expect(src).not.toContain("The all-in-one app for dog people");
    expect(src).not.toContain("Find playmates, book walkers & groomers");
  });
});
