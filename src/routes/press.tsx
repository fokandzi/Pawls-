import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { seoHead, SEO } from "../lib/seo";

export const Route = createFileRoute("/press")({
  head: () => seoHead(SEO.press),
  component: PressPage,
});

function PressPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <AppHeader active="press" />

      {/* Main Content */}
      <main className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-16">
        <div className="mx-auto max-w-5xl">
          {/* Hero */}
          <div className="mb-16 text-center">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-cream-100)] px-4 py-1.5 text-sm font-semibold text-[var(--pawls-ink-700)]">
               Media Resources
            </span>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
              Pawls Press Kit
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              Everything journalists, bloggers, and media professionals need to cover Pawls.
            </p>
          </div>

          {/* Boilerplate */}
          <section className="mb-16">
            <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-8 shadow-sm sm:p-10">
              <h2 className="text-2xl font-bold text-[var(--pawls-terracotta-500)]">About Pawls</h2>
              <div className="mt-4 space-y-4 text-lg leading-relaxed text-gray-700">
                <p>
                  Pawls is the all-in-one platform for dog people — a single app that replaces the
                  five or six different tools dog owners currently juggle. From finding compatible
                  playmates for their dogs with Tinder-style swiping, to booking trusted walkers and
                  groomers, connecting with ethical breeders, browsing adoptable rescue dogs, and
                  discovering dog-friendly venues nearby — Pawls brings the entire dog-parent
                  experience into one seamless, beautifully designed platform.
                </p>
                <p>
                  Built by dog lovers for dog lovers, Pawls is designed to grow through product
                  quality and word-of-mouth alone. Our mission is to make every dog owner's life
                  easier while fostering a global community of responsible, connected dog people.
                </p>
                <p>
                  Pawls is available as a web application and will soon launch on the iOS App Store
                  and Google Play Store.
                </p>
              </div>
            </div>
          </section>

          {/* Key Stats */}
          <section className="mb-16">
            <h2 className="mb-8 text-center text-2xl font-bold text-gray-900">
              Key <span className="text-[var(--pawls-terracotta-500)]">Stats</span>
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Active Users", value: "10,000+", icon: "" },
                { label: "Dog Matches Made", value: "50,000+", icon: "" },
                { label: "Service Providers", value: "200+", icon: "" },
                { label: "Rescue Dogs Listed", value: "500+", icon: "" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-6 text-center shadow-sm"
                >
                  <div className="text-4xl">{stat.icon}</div>
                  <div className="mt-3 text-3xl font-extrabold text-[var(--pawls-terracotta-500)]">
                    {stat.value}
                  </div>
                  <div className="mt-1 text-sm font-medium text-gray-500">{stat.label}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-sm text-gray-400">
              * Stats are approximate and updated quarterly. Current as of July 2026.
            </p>
          </section>

          {/* Founder / Team */}
          <section className="mb-16">
            <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-8 shadow-sm sm:p-10">
              <h2 className="text-2xl font-bold text-[var(--pawls-terracotta-500)]">Founder & Team</h2>
              <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-[var(--pawls-cream-100)] text-4xl">
                  
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Founder</h3>
                  <p className="mt-2 leading-relaxed text-gray-700">
                    Pawls was founded by a passionate dog owner who saw how fragmented the
                    dog-parent experience had become. After years of switching between different
                    apps for playdates, grooming, breeding, and adoption, they built Pawls to
                    bring it all together. The team is small, focused, and driven by a love for
                    dogs and great product design.
                  </p>
                  <p className="mt-3 text-sm text-gray-500">
                    For founder interviews or profile pieces, please contact{" "}
                    <a
                      href="mailto:press@pawls.club"
                      className="text-[var(--pawls-terracotta-500)] underline hover:text-[var(--pawls-terracotta-700)]"
                    >
                      press@pawls.club
                    </a>
                    .
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Brand Assets */}
          <section className="mb-16">
            <h2 className="mb-8 text-center text-2xl font-bold text-gray-900">
              Brand <span className="text-[var(--pawls-terracotta-500)]">Assets</span>
            </h2>
            <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-8 shadow-sm sm:p-10">
              <p className="mb-6 leading-relaxed text-gray-700">
                Download official Pawls logos and brand assets for use in media coverage. Please
                do not modify or distort the logos. When using the Pawls brand assets, please
                ensure adequate spacing and only use the provided files.
              </p>
              <div className="grid gap-6 sm:grid-cols-3">
                {[
                  {
                    name: "Logo (Primary)",
                    description: "Full-color logo with icon and wordmark. PNG format.",
                    file: "/brand/logo-primary.png",
                    size: "1.3 MB",
                    icon: "",
                  },
                  {
                    name: "Icon Mark",
                    description: "Standalone paw icon. Use for favicons and app icons.",
                    file: "/brand/icon-mark.png",
                    size: "1.4 MB",
                    icon: "",
                  },
                  {
                    name: "Wordmark",
                    description: "Pawls text only. Use for horizontal layouts.",
                    file: "/brand/wordmark.png",
                    size: "2.0 MB",
                    icon: "",
                  },
                ].map((asset) => (
                  <div
                    key={asset.name}
                    className="rounded-xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 p-6 text-center"
                  >
                    <div className="mb-3 text-3xl">{asset.icon}</div>
                    <h3 className="font-semibold text-gray-900">{asset.name}</h3>
                    <p className="mt-1 text-sm text-gray-500">{asset.description}</p>
                    <p className="mt-1 text-xs text-gray-400">{asset.size} — PNG</p>
                    <a
                      href={asset.file}
                      download
                      className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-4 py-2 text-sm font-medium text-white shadow-md shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
                    >
                      ⬇ Download
                    </a>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-lg border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)] p-4">
                <p className="text-sm text-gray-700">
                  <strong>Brand Color:</strong> Warm Amber —{" "}
                  <code className="rounded bg-[var(--pawls-cream-100)] px-1.5 py-0.5 text-[var(--pawls-terracotta-500)]">
                    var(--pawls-terracotta-500)
                  </code>
                  <span
                    className="ml-2 inline-block h-4 w-4 rounded align-middle"
                    style={{ backgroundColor: "var(--pawls-terracotta-500)" }}
                  />
                </p>
              </div>
            </div>
          </section>

          {/* Screenshots */}
          <section className="mb-16">
            <h2 className="mb-8 text-center text-2xl font-bold text-gray-900">
              App <span className="text-[var(--pawls-terracotta-500)]">Screenshots</span>
            </h2>
            <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-8 shadow-sm sm:p-10">
              <p className="mb-6 leading-relaxed text-gray-700">
                High-resolution screenshots of the Pawls app are available upon request. Contact
                us for access to our media gallery.
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { label: "Match Screen", icon: "" },
                  { label: "Booking Screen", icon: "" },
                  { label: "Breeder Listings", icon: "" },
                ].map((placeholder) => (
                  <div
                    key={placeholder.label}
                    className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/50 p-8"
                  >
                    <div className="text-4xl">{placeholder.icon}</div>
                    <p className="mt-3 text-sm font-medium text-gray-500">
                      {placeholder.label}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">Screenshot available on request</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* App Store Links */}
          <section className="mb-16">
            <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-8 shadow-sm sm:p-10">
              <h2 className="text-2xl font-bold text-[var(--pawls-terracotta-500)]">Get the App</h2>
              <div className="mt-6 flex flex-wrap gap-4">
                <a
                  href="#"
                  className="inline-flex items-center gap-3 rounded-xl bg-black px-6 py-3 text-white transition-opacity hover:opacity-85"
                >
                  <span className="text-2xl"></span>
                  <div className="text-left">
                    <div className="text-xs">Download on the</div>
                    <div className="text-lg font-semibold">App Store</div>
                  </div>
                </a>
                <a
                  href="#"
                  className="inline-flex items-center gap-3 rounded-xl bg-black px-6 py-3 text-white transition-opacity hover:opacity-85"
                >
                  <span className="text-2xl">▶</span>
                  <div className="text-left">
                    <div className="text-xs">Get it on</div>
                    <div className="text-lg font-semibold">Google Play</div>
                  </div>
                </a>
              </div>
              <p className="mt-4 text-sm text-gray-400">
                App Store links coming soon. Pawls is currently available as a web app at{" "}
                <a
                  href="https://pawls.club"
                  className="text-[var(--pawls-terracotta-500)] underline hover:text-[var(--pawls-terracotta-700)]"
                >
                  pawls.club
                </a>
                .
              </p>
            </div>
          </section>

          {/* Social Media */}
          <section className="mb-16">
            <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-8 shadow-sm sm:p-10">
              <h2 className="text-2xl font-bold text-[var(--pawls-terracotta-500)]">Social Media</h2>
              <p className="mt-3 leading-relaxed text-gray-700">
                Follow Pawls on social media for the latest updates, featured dogs, and community
                stories.
              </p>
              <div className="mt-6 flex flex-wrap gap-4">
                {[
                  { label: "Instagram", handle: "@pawls.club", icon: "" },
                  { label: "Twitter / X", handle: "@pawls_club", icon: "" },
                  { label: "TikTok", handle: "@pawls.club", icon: "" },
                  { label: "Facebook", handle: "/pawlsclub", icon: "" },
                ].map((social) => (
                  <div
                    key={social.label}
                    className="flex items-center gap-3 rounded-xl border border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 px-5 py-3"
                  >
                    <span className="text-xl">{social.icon}</span>
                    <div>
                      <div className="text-xs font-medium text-gray-500">{social.label}</div>
                      <div className="text-sm font-semibold text-gray-800">{social.handle}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Media Contact */}
          <section className="mb-16">
            <div className="rounded-2xl border-2 border-[var(--pawls-gold-400)] bg-gradient-to-b from-[var(--pawls-cream-50)]/50 to-white p-8 shadow-lg sm:p-10">
              <h2 className="text-2xl font-bold text-[var(--pawls-terracotta-500)]">Media Contact</h2>
              <p className="mt-3 leading-relaxed text-gray-700">
                For press inquiries, interview requests, media assets, or any other questions,
                please reach out to our media relations team. We're happy to provide additional
                materials, arrange interviews with the founder, or answer questions about the
                platform.
              </p>
              <div className="mt-6 space-y-3">
                <a
                  href="mailto:press@pawls.club"
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3 text-base font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
                >
                   press@pawls.club
                </a>
              </div>
              <p className="mt-4 text-sm text-gray-500">
                We typically respond to press inquiries within 24 hours.
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <AppFooter />
    </div>
  );
}
