import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { readFile } from "node:fs/promises";
import { TrustBadges } from "../lib/social-proof";
import { AppHeader } from "../lib/app-header";
import { AppIcon } from "../lib/app-icon";
import { t, DEFAULT_LANG } from "../lib/i18n";

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
  loader: async (ctx: any) => {
    const businessName = await getBusinessName();
    // Read ?subscribed=1 (set by the native POST /api/waitlist handler) so the
    // waitlist section can show an honest confirmation without client JS.
    const rawSearch = ctx.location?.search;
    const search = (typeof rawSearch === "string"
      ? Object.fromEntries(new URLSearchParams(rawSearch.startsWith("?") ? rawSearch.slice(1) : rawSearch).entries())
      : (rawSearch ?? {})) as Record<string, unknown>;
    const subscribed = String(search.subscribed ?? "") === "1";
    return { businessName, subscribed };
  },
  component: Home,
});

type FeatureStatus = "beta" | "coming-soon";

const features: {
  icon: "match" | "breed" | "rescue" | "book" | "connect" | "venues";
  title: string;
  description: string;
  status: FeatureStatus;
  statusLabel: string;
}[] = [
  {
    icon: "match",
    title: "Match",
    description:
      "Swipe through dog profiles and find potential playmates for your pup. Live in beta with demo profiles while we roll out to your city.",
    status: "beta",
    statusLabel: "Beta — live",
  },
  {
    icon: "breed",
    title: "Breed Responsibly",
    description:
      "Browse breeder profiles and learn what ethical, health-tested breeding looks like. Live breeder verification is coming soon.",
    status: "coming-soon",
    statusLabel: "Coming soon",
  },
  {
    icon: "rescue",
    title: "Rescue",
    description:
      "Browse adoptable dog profiles from shelters and rescues. Live shelter partnerships are coming soon.",
    status: "coming-soon",
    statusLabel: "Coming soon",
  },
  {
    icon: "book",
    title: "Book Services",
    description:
      "Explore walkers, groomers, sitters, trainers, and vets. Online booking is coming soon.",
    status: "coming-soon",
    statusLabel: "Coming soon",
  },
  {
    icon: "connect",
    title: "Connect",
    description:
      "Join a community of dog owners — groups, events, and local meetups. Coming soon.",
    status: "coming-soon",
    statusLabel: "Coming soon",
  },
  {
    icon: "venues",
    title: "Venues",
    description:
      "Discover dog-friendly parks, cafés, and trails. Coming soon to Paris.",
    status: "coming-soon",
    statusLabel: "Coming soon",
  },
];

function Home() {
  const { businessName, subscribed } = Route.useLoaderData();

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />

      {/* Hero Section */}
      <section className="relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-4 pb-12 pt-8 text-center sm:px-6 sm:pb-20 sm:pt-14">
        {/* Decorative paw prints */}
        <div className="pointer-events-none absolute left-2 top-4 rotate-[-20deg] select-none text-3xl opacity-10 sm:left-8 sm:top-8 sm:text-4xl sm:opacity-20">
          🐾
        </div>
        <div className="pointer-events-none absolute right-2 top-8 rotate-[15deg] select-none text-2xl opacity-8 sm:right-12 sm:top-16 sm:text-3xl sm:opacity-15">
          🐾
        </div>

        {/* Logo */}
        <Link to="/home" className="mb-4 inline-block">
          <img
            src="/logo-full.png"
            alt="Pawls"
            className="block h-24 w-24 object-contain sm:h-32 sm:w-32 md:h-40 md:w-40"
          />
        </Link>

        <span className="mb-5 inline-flex items-center rounded-full bg-[var(--pawls-cream-100)] px-3 py-1 text-xs font-semibold text-[var(--pawls-ink-700)] sm:px-4 sm:py-1.5 sm:text-sm">
          {t("home.betaBadge", DEFAULT_LANG)}
        </span>

        <h1 className="max-w-3xl text-2xl font-extrabold tracking-tight text-gray-900 sm:text-4xl md:text-5xl">
          The all-in-one app for{" "}
          <span className="text-[var(--pawls-terracotta-500)]">dog people</span>
        </h1>

        <p className="mt-3 max-w-xl text-base leading-relaxed text-gray-600 sm:mt-5 sm:text-lg">
          {businessName} brings together matching, breeding, rescue, booking,
          and community — so you spend less time juggling apps and more time
          with your dog. Sign up free and create your dog's profile today.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/register"
            className="inline-flex items-center justify-center rounded-full bg-[var(--pawls-terracotta-500)] px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors duration-200 hover:bg-[var(--pawls-terracotta-700)] sm:px-8 sm:py-3.5 sm:text-base"
          >
            Create your dog's profile
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
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Link>
          <a
            href="#features"
            className="inline-flex items-center justify-center rounded-full border-2 border-[var(--pawls-cream-200)] bg-white px-7 py-3 text-sm font-semibold text-gray-700 transition-colors duration-200 hover:border-[var(--pawls-terracotta-500)] hover:text-[var(--pawls-terracotta-500)] sm:px-8 sm:py-3.5 sm:text-base"
          >
            Explore features
          </a>
        </div>
      </section>

      {/* Trust Section — only claims that are factually true today */}
      <section className="bg-gradient-to-b from-white to-[var(--pawls-cream-50)]/50 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div>
            <TrustBadges />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="bg-white px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-14 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Everything your dog needs,{" "}
              <span className="text-[var(--pawls-terracotta-500)]">all in one place</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              Stop switching between apps. {businessName} is the single
              platform for every part of your dog's life — some parts are live
              now, others are in the works.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group relative rounded-2xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-6 transition-all duration-300 hover:border-[var(--pawls-cream-200)] hover:bg-[var(--pawls-cream-50)] hover:shadow-md"
              >
                <div className="mb-4 flex items-start justify-between">
                  <AppIcon name={feature.icon} size={40} />
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      feature.status === "beta"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-[var(--pawls-cream-100)] text-[var(--pawls-gold-500)]"
                    }`}
                  >
                    {feature.statusLabel}
                  </span>
                </div>
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

      {/* Waitlist Section — native form POST, works without client JS */}
      <section
        id="waitlist"
        className="bg-gradient-to-b from-[var(--pawls-cream-50)] to-[var(--pawls-terracotta-500)]/5 px-6 py-20"
      >
        <div className="mx-auto max-w-lg text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Get early access
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Join the list to be first to know when new features launch in your
            area — live booking, verified breeders, shelters, and community.
          </p>

          {subscribed ? (
            <div className="mt-8 rounded-2xl border border-green-200 bg-green-50 p-6">
              <div className="mb-3 text-4xl">🐾</div>
              <p className="text-lg font-semibold text-green-800">
                You're on the list!
              </p>
              <p className="mt-1 text-sm text-green-600">
                We'll be in touch with launch news. Woof!
              </p>
            </div>
          ) : (
            <form
              action="/api/waitlist"
              method="POST"
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
            >
              <input
                type="email"
                name="email"
                required
                placeholder="Enter your email"
                className="flex-1 rounded-full border border-[var(--pawls-cream-200)] bg-white px-5 py-3.5 text-gray-900 placeholder:text-gray-400 transition-shadow focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-[var(--pawls-terracotta-500)] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors duration-200 hover:bg-[var(--pawls-terracotta-700)]"
              >
                Notify me
              </button>
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
