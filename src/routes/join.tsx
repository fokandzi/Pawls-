import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { seoHead } from "../lib/seo";
import { t, DEFAULT_LANG, type Lang } from "../lib/i18n";
import { trackEvent } from "../lib/analytics";

/**
 * /join — Priority-2 acquisition landing route.
 *
 * French-first, mobile-first single page whose entire job is to convert a
 * QR/social visitor into a registered, dog-profile-complete Pawls user, while
 * recording which campaign/source brought them.
 *
 * Attribution model:
 * - `?c=<slug>` (venue `v-` / event `e-` / provider `p-` / ad `a-` / general
 *   `g-`) and `?src=<source>` are parsed + validated in a SERVER-ONLY
 *   createServerFn. Keeping this in a server fn (not client code) both keeps
 *   node:crypto out of the client bundle and ensures the HMAC signing secret
 *   is never exposed client-side.
 * - Unknown / malformed campaign identifiers fail safe: they are dropped, the
 *   page renders the generic experience, and nothing fake is minted.
 * - For a valid campaign, the server fn mints an HMAC-signed opaque token
 *   carried into `/register?c=<token>` and persisted server-side at
 *   registration. Attribution is metadata only and grants no entitlement.
 * - Consent-gated analytics (`landing_view`, `cta_click`) fire through the
 *   existing PostHog path, which stays OFF until a real phc_ key exists.
 */
const resolveAttribution = createServerFn({ method: "GET" }).handler(
  async ({ campaignRaw, srcRaw }: { campaignRaw: string; srcRaw: string }) => {
    const { parseCampaignSlug, sanitizeSource, makeAttributionToken } = await import(
      "../lib/attribution"
    );
    const campaign = parseCampaignSlug(campaignRaw);
    const source = sanitizeSource(srcRaw);
    const token = campaign ? makeAttributionToken({ campaign, source }) : "";
    const registerHref = campaign
      ? `/register?c=${encodeURIComponent(token)}&camp=${encodeURIComponent(campaign)}`
      : "/register";
    return { campaign, source, registerHref };
  },
);

export const Route = createFileRoute("/join")({
  head: () => ({
    ...seoHead({
      title: t("join.seoTitle", DEFAULT_LANG),
      description: t("join.seoDesc", DEFAULT_LANG),
      path: "/join",
    }),
  }),
  loader: async (ctx: any) => {
    const rawSearch = ctx.location?.search;
    const search = (typeof rawSearch === "string"
      ? Object.fromEntries(
          new URLSearchParams(rawSearch.startsWith("?") ? rawSearch.slice(1) : rawSearch).entries(),
        )
      : (rawSearch ?? {})) as Record<string, unknown>;
    const campaignRaw = typeof search.c === "string" ? search.c : "";
    const srcRaw = typeof search.src === "string" ? search.src : "";
    return resolveAttribution({ campaignRaw, srcRaw });
  },
  component: JoinPage,
});

function JoinPage() {
  const L: Lang = DEFAULT_LANG;
  const { campaign, source, registerHref } = Route.useLoaderData();
  const props = { campaign: campaign ?? undefined, source: source ?? undefined };

  // Consent-gated acquisition analytics (OFF until a real phc_ key exists).
  useEffect(() => {
    trackEvent("landing_view", props);
  }, []);

  const onCta = () => {
    trackEvent("cta_click", props);
  };

  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 pb-12 pt-10 text-center sm:pb-16">
        <div className="pointer-events-none absolute left-2 top-3 rotate-[-20deg] select-none text-3xl opacity-10">
          🐾
        </div>
        <div className="pointer-events-none absolute right-2 top-8 rotate-[15deg] select-none text-2xl opacity-10">
          🐾
        </div>

        <img
          src="/logo-full.png"
          alt="Pawls"
          className="mb-5 block h-20 w-20 object-contain sm:h-28 sm:w-28"
        />

        <span className="mb-5 inline-flex items-center rounded-full bg-[var(--pawls-cream-100)] px-4 py-1.5 text-xs font-semibold text-[var(--pawls-ink-700)] sm:text-sm">
          {t("join.betaBadge", L)}
        </span>

        <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-4xl md:text-5xl">
          {t("join.heading", L)}
        </h1>

        <p className="mt-4 max-w-xl text-base leading-relaxed text-gray-600 sm:text-lg">
          {t("join.sub", L)}
        </p>

        <a
          href={registerHref}
          onClick={onCta}
          className="mt-8 inline-flex w-full max-w-md items-center justify-center rounded-full bg-[var(--pawls-terracotta-500)] px-8 py-4 text-base font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors duration-200 hover:bg-[var(--pawls-terracotta-700)] sm:text-lg"
        >
          {t("join.cta", L)}
          <svg className="ml-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </a>
        <p className="mt-3 text-xs font-medium text-gray-400 sm:text-sm">
          {t("join.ctaNote", L)}
        </p>
      </section>

      {/* How it works */}
      <section className="bg-white px-6 py-12">
        <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-3">
          {[
            { n: "1", title: t("join.step1Title", L), body: t("join.step1Body", L) },
            { n: "2", title: t("join.step2Title", L), body: t("join.step2Body", L) },
            { n: "3", title: t("join.step3Title", L), body: t("join.step3Body", L) },
          ].map((s) => (
            <div
              key={s.n}
              className="rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/40 p-5 text-center"
            >
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--pawls-terracotta-500)] text-lg font-bold text-white">
                {s.n}
              </div>
              <h3 className="text-base font-semibold text-gray-900">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Honest private-beta note + trust */}
      <section className="bg-gradient-to-b from-white to-[var(--pawls-cream-50)]/40 px-6 py-12">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-sm leading-relaxed text-gray-600">{t("join.betaNote", L)}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-5">
              <div className="text-2xl">🎁</div>
              <h3 className="mt-2 text-sm font-semibold text-gray-900">
                {t("join.trustFreeTitle", L)}
              </h3>
              <p className="mt-1 text-xs text-gray-500">{t("join.trustFreeBody", L)}</p>
            </div>
            <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-5">
              <div className="text-2xl">🔒</div>
              <h3 className="mt-2 text-sm font-semibold text-gray-900">
                {t("join.trustSafeTitle", L)}
              </h3>
              <p className="mt-1 text-xs text-gray-500">{t("join.trustSafeBody", L)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-[var(--pawls-cream-100)] bg-white px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <img src="/logo-full.png" alt="Pawls" className="h-8" />
            <span className="text-xs text-gray-400">{t("join.footer", L)}</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <Link to="/privacy" className="hover:text-[var(--pawls-terracotta-500)]">
              {t("footer.privacy", L)}
            </Link>
            <Link to="/terms" className="hover:text-[var(--pawls-terracotta-500)]">
              {t("footer.terms", L)}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
