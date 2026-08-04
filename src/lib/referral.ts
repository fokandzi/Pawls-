/**
 * Client-side referral utilities — localStorage-based MVP.
 * Complements the server-side referrals table for cross-device tracking.
 */

const REFERRAL_CODE_KEY = "pawls_referral_code";
const REFERRED_BY_KEY = "pawls_referred_by";
const REWARD_CLAIMED_KEY = "pawls_referral_reward_claimed";

/** Get or generate this user's unique referral code. */
export function getReferralCode(): string {
  if (typeof window === "undefined") return "";
  let code = localStorage.getItem(REFERRAL_CODE_KEY);
  if (!code) {
    code = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
    localStorage.setItem(REFERRAL_CODE_KEY, code);
  }
  return code;
}

/** Build the full referral link. */
export function getReferralLink(): string {
  if (typeof window === "undefined") return "https://pawls.club/?ref=YOURCODE";
  const code = getReferralCode();
  return `${window.location.origin}/?ref=${code}`;
}

/** Get the referral code that brought this user here (if any). */
export function getReferredBy(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFERRED_BY_KEY);
}

/** Persist the referring code and return whether it was newly set. */
export function setReferredBy(code: string): boolean {
  if (typeof window === "undefined") return false;
  if (!code || typeof code !== "string" || code.length < 4) return false;
  if (localStorage.getItem(REFERRED_BY_KEY)) return false; // already set
  localStorage.setItem(REFERRED_BY_KEY, code);
  return true;
}

/** Whether this user has already claimed their referral reward (1 free month). */
export function hasClaimedReward(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(REWARD_CLAIMED_KEY) === "true";
}

/** Mark the referral reward as claimed and activate Pawls Plus. */
export function claimReward(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(REWARD_CLAIMED_KEY, "true");
  // Grant 1 free month of Pawls Plus
  localStorage.setItem("pawnder-plus", "true");
}

/** Read the URL param ?ref=CODE and store it. Returns the code if newly stored. */
export function captureRefFromURL(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && setReferredBy(ref)) {
      return ref;
    }
  } catch {
    // ignore malformed URLs
  }
  return null;
}
