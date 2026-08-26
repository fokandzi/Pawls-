import { describe, expect, test } from "bun:test";
import { likeDeckResult, type DeckDog } from "./match-ui";

const Sushi: DeckDog = { id: 132, dog_name: "Sushi" };
const Popcorn: DeckDog = { id: 135, dog_name: "Popcorn" };
const Cookie: DeckDog = { id: 145, dog_name: "Cookie" };

describe("likeDeckResult — Match success banner identity (bug fix 2026-08-26)", () => {
  test("(a) mutual match: deck advances AND success UI keeps the MATCHED dog's name", () => {
    // User swipes LIKE on current dog Sushi. The swipe creates a mutual match.
    const r = likeDeckResult(Sushi, true, [Sushi, Popcorn, Cookie]);

    // Deck advanced normally (Sushi removed, Popcorn now head).
    expect(r.nextDogs.map((d) => d.dog_name)).toEqual(["Popcorn", "Cookie"]);
    // Banner shows, and its identity is the MATCHED dog (Sushi) — NOT the new
    // deck head (Popcorn). This is the regression the bug introduced: reading
    // dogs[0] after the slice would have returned "Popcorn".
    expect(r.showBanner).toBe(true);
    expect(r.matchedDogName).toBe("Sushi");
    expect(r.matchedDogName).not.toBe(r.nextDogs[0]!.dog_name);
  });

  test("(b) ordinary like with NO match: deck advances normally, NO banner", () => {
    const r = likeDeckResult(Sushi, false, [Sushi, Popcorn, Cookie]);

    expect(r.showBanner).toBe(false);
    expect(r.nextDogs.map((d) => d.dog_name)).toEqual(["Popcorn", "Cookie"]);
  });

  test("(b2) pass (not a match) likewise advances the deck with no banner", () => {
    // Pass is rendered by the UI as the same deck-advance without a banner.
    const r = likeDeckResult(Sushi, false, [Sushi, Popcorn]);
    expect(r.showBanner).toBe(false);
    expect(r.nextDogs.map((d) => d.dog_name)).toEqual(["Popcorn"]);
  });

  test("banner identity is inert when there is no current dog (safety fallback)", () => {
    const r = likeDeckResult(null, true, [Popcorn]);
    expect(r.matchedDogName).toBeNull();
    expect(r.nextDogs.map((d) => d.dog_name)).toEqual([]);
  });

  test("banner identity is independent of the advanced deck head by construction", () => {
    // Even when a match is created, matchedDogName always equals the swiped dog,
    // so the success banner can never leak the next card's name.
    for (const swiped of [Sushi, Popcorn, Cookie]) {
      const deck = [
        swiped,
        ...[Sushi, Popcorn, Cookie].filter((d) => d.id !== swiped.id),
      ];
      const r = likeDeckResult(swiped, true, deck);
      expect(r.showBanner).toBe(true);
      expect(r.matchedDogName).toBe(swiped.dog_name);
      expect(r.nextDogs.length).toBe(2);
    }
  });
});
