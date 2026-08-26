/**
 * Match success-UI display logic (Pawls Phase-1).
 *
 * Bug fix (2026-08-26, owner-approved): the "C'est un match" success banner
 * previously rendered the identity of the *advanced* discovery deck head
 * (dogs[0] AFTER the deck slice on a successful mutual match), so on a match
 * the banner could show the NEXT card's dog name instead of the dog actually
 * involved in the match.
 *
 * Fix: the success banner identity is derived from a dedicated pure helper
 * that captures the dog the user swiped on (the "current"/matched dog) and the
 * post-advance deck in ONE pass, BEFORE any state update. The UI stores that
 * captured name in its own state so the banner never reads the advanced deck.
 *
 * This module has no imports and no side effects so it is trivially unit-testable
 * with the repo's bun-based suite and never pulls the Neon driver into the test.
 */

/** Minimal structural shape of a discovery dog — enough for the success UI.
 * (DiscoveryDog from match-core is structurally assignable to this.) */
export interface DeckDog {
  id: number;
  dog_name: string;
}

export interface LikeDeckResult<T extends DeckDog = DeckDog> {
  /** The remaining deck after advancing past the swiped dog. */
  nextDogs: T[];
  /** Name of the dog the user just swiped on — the correct match identity,
   * captured BEFORE the deck advances. null when there is no current dog. */
  matchedDogName: string | null;
  /** Whether a mutual match was created by this swipe (show success banner). */
  showBanner: boolean;
}

/** Pure decision for the "like → advance deck + maybe show success banner"
 * path. The banner's identity is locked to the swiped dog (never the advanced
 * deck head). Ordinary likes that do not create a match show no banner.
 * Generic over T so callers keep their concrete deck dog type. */
export function likeDeckResult<T extends DeckDog>(
  current: T | null,
  matchCreated: boolean,
  deck: T[],
): LikeDeckResult<T> {
  return {
    nextDogs: deck.slice(1),
    matchedDogName: current ? current.dog_name : null,
    showBanner: matchCreated,
  };
}
