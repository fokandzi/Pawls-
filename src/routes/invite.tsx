import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getReferralCode, getReferralLink, getReferredBy, hasClaimedReward } from "../lib/referral";
import { getReferralCount } from "../db/schema";
import { seoHead } from "../lib/seo";
import { t, DEFAULT_LANG, type Lang } from "../lib/i18n";
import { resolveRouteLang } from "../lib/i18n/route-lang";
import { trackEvent } from "../lib/analytics"

export const Route = createFileRoute("/invite")({
  loader: async (): Promise<{ lang: Lang }> => {
    try {
      return { lang: await resolveRouteLang() };
    } catch {
      return { lang: DEFAULT_LANG };
    }
  },
  // FR-first SSR title/meta (P2 item 5).
  head: ({ loaderData }) => {
    const L: Lang = (loaderData as { lang?: Lang } | undefined)?.lang ?? DEFAULT_LANG;
    return seoHead({
      title: t("invite.seoTitle", L),
      description: t("invite.seoDesc", L),
      path: "/invite",
    });
  },
  component: InvitePage,
});

function InvitePage() {
  const { lang: serverLang } = Route.useLoaderData() as { lang?: Lang };
  const L: Lang = serverLang ?? DEFAULT_LANG;
  const [referralCode, setReferralCode] = useState("");
  const [referralLink, setReferralLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [referralCount, setReferralCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [referredBy, setReferredBy] = useState<string | null>(null);
  const [rewardClaimed, setRewardClaimed] = useState(true);

  useEffect(() => {
    const code = getReferralCode();
    setReferralCode(code);
    setReferralLink(getReferralLink());
    setReferredBy(getReferredBy());
    setRewardClaimed(hasClaimedReward());

    // Fetch referral count from DB
    if (code) {
      getReferralCount({ data: { referrerCode: code } })
        .then((r) => setReferralCount(r.count))
        .catch(() => setReferralCount(0))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      trackEvent("referral_link_copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = referralLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      trackEvent("referral_link_copied");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <AppHeader active="invite" lang={L} />

      {/* Hero */}
      <section className="relative flex flex-col items-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 pb-12 pt-20 text-center">
        <div className="pointer-events-none absolute left-8 top-8 rotate-[-20deg] select-none text-4xl opacity-20">🐾</div>
        <div className="pointer-events-none absolute right-12 top-16 rotate-[15deg] select-none text-3xl opacity-15">🐾</div>

        <span className="mb-6 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-cream-100)] px-4 py-1.5 text-sm font-semibold text-[var(--pawls-ink-700)]">
          🐾 {t("invite.badge", L)}
        </span>

        <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
          {t("invite.titleLead", L)}{" "}
          <span className="text-[var(--pawls-terracotta-500)]">{t("invite.titleAccent", L)}</span>
        </h1>

        <p className="mt-4 max-w-lg text-lg text-gray-600">{t("invite.subtitle", L)}</p>
      </section>

      {/* Referral Link Section */}
      <section className="bg-white px-6 pb-12">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl border-2 border-[var(--pawls-cream-200)] bg-gradient-to-br from-[var(--pawls-cream-50)]/80 to-white p-8 shadow-lg">
            <h2 className="mb-2 text-2xl font-bold text-gray-900">🔗 {t("invite.linkTitle", L)}</h2>
            <p className="mb-6 text-sm text-gray-500">{t("invite.linkDesc", L)}</p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                readOnly
                aria-label={t("invite.linkTitle", L)}
                value={referralLink}
                className="flex-1 rounded-xl border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/50 px-4 py-3 text-sm text-gray-700 outline-none focus:border-[var(--pawls-terracotta-500)] focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/20"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={handleCopy}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--pawls-terracotta-500)] px-6 py-3 text-sm font-semibold text-white shadow-md shadow-[var(--pawls-terracotta-500)]/20 transition-all hover:bg-[var(--pawls-terracotta-700)] active:scale-95"
              >
                {copied ? `✅ ${t("invite.copied", L)}` : `📋 ${t("invite.copy", L)}`}
              </button>
            </div>

            {referralCode && (
              <p className="mt-4 text-center text-xs text-gray-400">
                {t("invite.code", L)} <span className="font-mono font-semibold text-[var(--pawls-gold-500)]">{referralCode}</span>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-white px-6 pb-16">
        <div className="mx-auto max-w-2xl">
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Referral Count */}
            <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-6 text-center shadow-sm">
              <div className="mb-2 text-4xl">👥</div>
              {loading ? (
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-3 border-[var(--pawls-cream-200)] border-t-[var(--pawls-terracotta-500)]" />
              ) : (
                <p className="text-3xl font-extrabold text-[var(--pawls-terracotta-500)]">{referralCount}</p>
              )}
              <p className="mt-1 text-sm text-gray-500">{t("invite.friendsReferred", L)}</p>
            </div>

            {/* Reward Status — honest: rewards are not live yet */}
            <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-6 text-center shadow-sm">
              <div className="mb-2 text-4xl">🎁</div>
              <p className="text-3xl font-extrabold text-[var(--pawls-terracotta-500)]">
                {t("invite.rewardSoon", L)}
              </p>
              <p className="mt-1 text-sm text-gray-500">{t("invite.rewardLabel", L)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-gradient-to-b from-[var(--pawls-cream-50)]/50 to-white px-6 pb-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-8 text-center text-2xl font-bold text-gray-900">{t("invite.howTitle", L)}</h2>
          <div className="space-y-5">
            {[
              {
                step: "1",
                emoji: "🔗",
                title: t("invite.step1Title", L),
                desc: t("invite.step1Desc", L),
              },
              {
                step: "2",
                emoji: "🐕",
                title: t("invite.step2Title", L),
                desc: t("invite.step2Desc", L),
              },
              {
                step: "3",
                emoji: "🎁",
                title: t("invite.step3Title", L),
                desc: t("invite.step3Desc", L),
              },
            ].map((item) => (
              <div
                key={item.step}
                className="flex items-start gap-4 rounded-xl border border-[var(--pawls-cream-100)] bg-white p-5 shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--pawls-cream-100)] text-lg font-bold text-[var(--pawls-terracotta-500)]">
                  {item.emoji}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Referred by someone — info only (P0-A: claim button removed; no
          client-side Plus self-grant. Rewards are server-side, post-auth.) */}
      {referredBy && !rewardClaimed && (
        <section className="bg-gradient-to-r from-[var(--pawls-cream-100)] to-[var(--pawls-cream-50)] px-6 py-16">
          <div className="mx-auto max-w-lg text-center">
            <div className="text-5xl">🎉</div>
            <h2 className="mt-4 text-2xl font-bold text-gray-900">{t("invite.invitedTitle", L)}</h2>
            <p className="mt-2 text-gray-600">{t("invite.invitedBody", L)}</p>
          </div>
        </section>
      )}

      {/* Already claimed */}
      {referredBy && rewardClaimed && (
        <section className="bg-gradient-to-r from-emerald-50 to-green-50 px-6 py-12">
          <div className="mx-auto max-w-lg text-center">
            <div className="text-4xl">✅</div>
            <h2 className="mt-3 text-xl font-bold text-emerald-800">{t("invite.onListTitle", L)}</h2>
            <p className="mt-1 text-sm text-emerald-600">{t("invite.onListBody", L)}</p>
          </div>
        </section>
      )}

      {/* Share CTA */}
      <section className="bg-white px-6 pb-20">
        <div className="mx-auto max-w-md text-center">
          <h2 className="text-xl font-bold text-gray-900">{t("invite.readyTitle", L)}</h2>
          <p className="mt-2 text-gray-600">{t("invite.readyBody", L)}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-all hover:bg-[var(--pawls-terracotta-700)]"
            >
              {copied ? `✅ ${t("invite.copied", L)}` : `📋 ${t("invite.copy", L)}`}
            </button>
            <Link
              to="/match"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--pawls-cream-200)] px-6 py-3 text-sm font-semibold text-[var(--pawls-terracotta-500)] transition-all hover:bg-[var(--pawls-cream-50)]"
            >
              🐾 {t("invite.startMatching", L)}
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <AppFooter lang={L} />
    </div>
  );
}
