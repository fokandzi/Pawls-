import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { readFile } from "node:fs/promises";
import { useEffect, useState } from "react";
import { captureRefFromURL, claimReward, getReferredBy, hasClaimedReward } from "../lib/referral";
import { TrustBadges } from "../lib/social-proof";
import { subscribeToWaitlist } from "../db/schema";
import { AppHeader } from "../lib/app-header";
import { AppIcon } from "../lib/app-icon";
import { trackEvent } from "../lib/analytics";

const getBusinessName = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const cfg = JSON.parse(await readFile("site.json", "utf8")) as {
      businessName?: string;
    };
    return cfg.businessName?.trim() ?? "Pawls";
  } catch {
    return "Pawls";
  }
});

import { seoHead, SEO, organizationJsonLd } from "../lib/seo";

export const Route = createFileRoute("/")({
  head: () => {
    const seo = seoHead(SEO.home);
    return {
      ...seo,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(organizationJsonLd()),
        },
      ],
    };
  },
  loader: () => getBusinessName(),
  component: Home,
});

const features = [
  {
    icon: "match" as const,
    title: "Match",
    description:
      "Find compatible playmates for your dog nearby with temperament, size, and energy-level filters.",
  },
  {
    icon: "breed" as const,
    title: "Breed Responsibly",
    description:
      "Connect with vetted, ethical breeders. Browse health-tested listings and breed education resources.",
  },
  {
    icon: "rescue" as const,
    title: "Rescue",
    description:
      "Browse adoptable dogs from shelters and rescues in one unified feed. Give a dog a forever home.",
  },
  {
    icon: "book" as const,
    title: "Book Services",
    description:
      "On-demand booking for walkers, groomers, sitters, trainers, and vets — all in one place.",
  },
  {
    icon: "connect" as const,
    title: "Connect",
    description:
      "Join a community of dog owners. Groups, events, and local meetups for you and your pup.",
  },
];

function Home() {
  const businessName = Route.useLoaderData();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refBanner, setRefBanner] = useState(false);
  const [refBannerDismissed, setRefBannerDismissed] = useState(false);
  const [rewardClaimed, setRewardClaimed] = useState(true);

  // Capture referral code from URL and show welcome banner
  useEffect(() => {
    trackEvent("landing_page_viewed");
    const refCode = captureRefFromURL();
    if (refCode) trackEvent("referral_signup");
    const referredBy = getReferredBy();
    const claimed = hasClaimedReward();
    setRewardClaimed(claimed);

    if (refCode || (referredBy && !claimed)) {
      setRefBanner(true);
    }
  }, []);

  const handleClaimAndDismiss = () => {
    claimReward();
    setRewardClaimed(true);
    setRefBanner(false);
    setRefBannerDismissed(true);
  };

  const dismissBanner = () => {
    setRefBanner(false);
    setRefBannerDismissed(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) return;

    setLoading(true);
    try {
      const result = await subscribeToWaitlist({ data: { email: email.trim() } });
      // subscribeToWaitlist returns { success, alreadySubscribed } — both are good outcomes
      setSubmitted(true);
      trackEvent("waitlist_signed_up");
      setEmail("");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />

      {/* Referral Welcome Banner */}
      {refBanner && !rewardClaimed && (
        <div className="bg-gradient-to-r from-[var(--pawls-gold-400)] via-[var(--pawls-terracotta-500)] to-[var(--pawls-cream-50)]0 px-4 py-3 shadow-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl"></span>
              <p className="text-sm font-semibold text-white sm:text-base">
                You've been invited! Enjoy <span className="underline decoration-white/50">1 free month of Pawls Plus</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClaimAndDismiss}
                className="whitespace-nowrap rounded-full bg-white px-4 py-1.5 text-sm font-bold text-[var(--pawls-terracotta-500)] shadow transition-all hover:bg-[var(--pawls-cream-50)] active:scale-95"
              >
                 Claim
              </button>
              <button
                onClick={dismissBanner}
                className="text-lg text-white/70 hover:text-white"
                aria-label="Dismiss"
              >
                
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Referral Activated Banner */}
      {refBannerDismissed && rewardClaimed && (
        <div className="bg-gradient-to-r from-emerald-400 to-emerald-600 px-4 py-3 shadow-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl"></span>
              <p className="text-sm font-semibold text-white sm:text-base">
                Your free month of Pawls Plus is active! Enjoy all premium features.
              </p>
            </div>
            <Link
              to="/match"
              className="whitespace-nowrap rounded-full bg-white px-4 py-1.5 text-sm font-bold text-emerald-700 shadow transition-all hover:bg-emerald-50"
            >
               Start Matching
            </Link>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-4 pb-12 pt-8 text-center sm:px-6 sm:pb-20 sm:pt-14">
        {/* Decorative paw prints */}
        <div className="pointer-events-none absolute left-2 top-4 rotate-[-20deg] select-none text-3xl opacity-10 sm:left-8 sm:top-8 sm:text-4xl sm:opacity-20">
          
        </div>
        <div className="pointer-events-none absolute right-2 top-8 rotate-[15deg] select-none text-2xl opacity-8 sm:right-12 sm:top-16 sm:text-3xl sm:opacity-15">
          
        </div>

        {/* Logo */}
        <Link to="/home" className="mb-4 inline-block">
          <img
            src="/logo-full.png"
            alt="Pawls"
            className="h-14 sm:h-20 md:h-24"
          />
        </Link>

        <span className="mb-5 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-cream-100)] px-3 py-1 text-xs font-semibold text-[var(--pawls-ink-700)] sm:px-4 sm:py-1.5 sm:text-sm">
          <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--pawls-cream-50)]0 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--pawls-gold-500)] sm:h-2 sm:w-2" />
          </span>
          Launching soon for dog people
        </span>

        <h1 className="max-w-3xl text-2xl font-extrabold tracking-tight text-gray-900 sm:text-4xl md:text-5xl">
          The all-in-one app for{" "}
          <span className="text-[var(--pawls-terracotta-500)]">dog people</span>
        </h1>

        <p className="mt-3 max-w-xl text-base leading-relaxed text-gray-600 sm:mt-5 sm:text-lg">
          {businessName} brings together matching, breeding, rescue, booking,
          and community — so you spend less time juggling apps and more time
          with your dog.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row">
          <a
            href="#waitlist"
            className="inline-flex items-center justify-center rounded-full bg-[var(--pawls-terracotta-500)] px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors duration-200 hover:bg-[var(--pawls-terracotta-700)] sm:px-8 sm:py-3.5 sm:text-base"
          >
            Join the Waitlist
            <svg
              className="ml-2 h-4 w-4 sm:h-5 sm:w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </a>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="bg-gradient-to-b from-white to-[var(--pawls-cream-50)]/50 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div>
            <TrustBadges />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-white px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-14 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Everything your dog needs,{" "}
              <span className="text-[var(--pawls-terracotta-500)]">all in one place</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              Stop switching between apps. {businessName} is the single
              platform for every part of your dog's life.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group relative rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-6 transition-all duration-300 hover:border-[var(--pawls-cream-200)] hover:bg-[var(--pawls-cream-50)] hover:shadow-md"
              >
                <AppIcon name={feature.icon} size={40} className="mb-4" />
                <h3 className="mb-2 text-lg font-semibold text-gray-900">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-gray-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Waitlist Section */}
      <section
        id="waitlist"
        className="bg-gradient-to-b from-[var(--pawls-cream-50)] to-[var(--pawls-terracotta-500)]/5 px-6 py-20"
      >
        <div className="mx-auto max-w-lg text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Join the Pawls waitlist
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Be among the first dog people in your area to use {businessName} when we launch.
          </p>

          {submitted ? (
            <div className="mt-8 rounded-2xl border border-green-200 bg-green-50 p-6">
              <div className="mb-3 text-4xl"></div>
              <p className="text-lg font-semibold text-green-800">
                You're on the list!
              </p>
              <p className="mt-1 text-sm text-green-600">
                We'll be in touch soon. Woof!
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                disabled={loading}
                className="flex-1 rounded-full border border-[var(--pawls-cream-200)] bg-white px-5 py-3.5 text-gray-900 placeholder:text-gray-400 transition-shadow focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-[var(--pawls-terracotta-500)] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors duration-200 hover:bg-[var(--pawls-terracotta-700)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Joining..." : "Notify me"}
              </button>
              {error && (
                <p className="w-full text-sm text-red-600">{error}</p>
              )}
            </form>
          )}

          <p className="mt-4 text-xs text-gray-400">
            No spam, just launch news. Unsubscribe anytime.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-[var(--pawls-cream-100)] bg-white px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <img src="/logo-full.png" alt="Pawls" className="h-8" />
          </div>
          <p className="text-sm text-gray-500">
            The all-in-one platform for dog people.
          </p>
        </div>
      </footer>
    </div>
  );
}
