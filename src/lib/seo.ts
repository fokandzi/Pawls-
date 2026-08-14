/**
 * SEO helper — generates consistent meta tags for all routes.
 */

export const SITE_NAME = "Pawls";
export const SITE_TAGLINE = "The all-in-one app for dog people";
export const SITE_URL = "https://pawls.club";
export const OG_IMAGE = `${SITE_URL}/logo.png`;

export interface SEOPage {
  title: string;
  description: string;
  path?: string;
  ogImage?: string;
  ogType?: string;
  noIndex?: boolean;
}

/** Generate the full head() return value for a route. */
export function seoHead(page: SEOPage) {
  const url = page.path ? `${SITE_URL}${page.path}` : SITE_URL;
  const image = page.ogImage ?? OG_IMAGE;
  const fullTitle = page.title.includes(SITE_NAME) ? page.title : `${page.title} | ${SITE_NAME}`;

  const meta: Array<Record<string, string>> = [
    { title: fullTitle },
    { name: "description", content: page.description },
    // Open Graph
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: page.description },
    { property: "og:image", content: image },
    { property: "og:url", content: url },
    { property: "og:type", content: page.ogType ?? "website" },
    { property: "og:site_name", content: SITE_NAME },
    // Twitter Card
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: page.description },
    { name: "twitter:image", content: image },
    // Canonical
    { rel: "canonical", href: url },
  ];

  if (page.noIndex) {
    meta.push({ name: "robots", content: "noindex, nofollow" });
  }

  return { meta };
}

// ── Page-specific SEO definitions ──────────────────────────────────────────────

export const SEO = {
  home: {
    title: "Pawls — The All-in-One Dog App | Match, Book, Breed & Rescue",
    description:
      "Pawls is the all-in-one platform for dog people. Match your dog with playmates, explore breeder and rescue listings, and discover dog-friendly services — all in one place. Match is live in beta; more features are coming soon.",
  } as SEOPage,

  match: {
    title: "Match Your Dog — Find Playmates | Pawls",
    description:
      "Try Pawls Match (beta) — swipe through dog profiles to find potential playmates for your pup. Currently in beta with demo profiles while we roll out to your city.",
    path: "/match",
  } as SEOPage,
  register: {
    title: "Sign Up for Pawls — Create Your Free Account",
    description:
      "Create your free Pawls account and set up your dog's profile. Sign-up is open — Match is live in beta, and more features are coming soon.",
    path: "/register",
  } as SEOPage,

  "match/create": {
    title: "Create Your Dog Profile — Join Pawls Match",
    description:
      "Set up your dog's profile on Pawls. Add breed, temperament, energy level, and find perfect playmates in your area.",
    path: "/match/create",
  } as SEOPage,

  "match/matches": {
    title: "Your Dog Matches — Pawls",
    description:
      "View your dog's playdate matches. Chat with other dog owners and arrange meetups at dog-friendly venues.",
    path: "/match/matches",
  } as SEOPage,
  "match/conversations": {
    title: "Your Messages — Pawls",
    description: "Chat with your dog's matches on Pawls. Private 1:1 conversations with owners you've matched with.",
    path: "/match/conversations",
    noIndex: true,
  } as SEOPage,
  "match/conversations/$id": {
    title: "Conversation — Pawls",
    description: "Private conversation with a Pawls match.",
    path: "/match/conversations",
    noIndex: true,
  } as SEOPage,

  book: {
    title: "Dog Services — Walkers, Groomers, Sitters & Vets | Pawls",
    description:
      "Explore dog services in Paris: walkers, groomers, sitters, trainers, and veterinarians. Online booking is coming soon — current provider listings are demo profiles.",
    path: "/book",
  } as SEOPage,

  "book/register": {
    title: "List Your Dog Service — Join Pawls as a Provider",
    description:
      "Are you a dog walker, groomer, sitter, or trainer in Paris? Register your business on Pawls. Provider sign-up is opening soon.",
    path: "/book/register",
  } as SEOPage,

  breed: {
    title: "Dog Breeders & Ethical Breeding Guide | Pawls",
    description:
      "Browse breeder profiles and learn what ethical, health-tested breeding looks like. Breeder verification is coming soon — current listings are demo profiles.",
    path: "/breed",
  } as SEOPage,

  "breed/register": {
    title: "Register as a Breeder — Pawls Breeder Network",
    description:
      "Join the Pawls breeder network. List your litters, showcase health testing, and connect with responsible dog owners. Breeder registration is opening soon.",
    path: "/breed/register",
  } as SEOPage,

  "breed/membership": {
    title: "Breeder Memberships — Pawls Premium Listings",
    description:
      "Learn about Pawls breeder membership tiers for verified listings and featured placement. Memberships are coming soon.",
    path: "/breed/membership",
  } as SEOPage,

  rescue: {
    title: "Adopt a Dog — Rescue Dogs | Pawls",
    description:
      "Browse rescue dog profiles from shelters across the Paris region. Current listings are demo profiles — live shelter partnerships are coming soon.",
    path: "/rescue",
  } as SEOPage,

  connect: {
    title: "Dog Community — Groups, Events & Meetups | Pawls",
    description:
      "Local dog groups, events, and meetups for dog owners — the community layer is coming soon to Pawls.",
    path: "/connect",
  } as SEOPage,

  venues: {
    title: "Dog-Friendly Venues in Paris — Parks, Cafés & More | Pawls",
    description:
      "Discover dog-friendly parks, cafés, bars, and trails in Paris and Île-de-France. Filter by features like off-leash areas, water stations, and more.",
    path: "/venues",
  } as SEOPage,

  plus: {
    title: "Pawls Plus — Coming Soon | Pawls",
    description:
      "Pawls Plus is a premium tier for dog owners that's still in development. See what's planned and join the waitlist — no pricing announced yet.",
    path: "/plus",
  } as SEOPage,

  "plus/success": {
    title: "Thank You — Pawls",
    description:
      "Thank you for supporting Pawls. Your payment was received — premium features are coming soon and Plus members get early access.",
    path: "/plus/success",
    noIndex: true,
  } as SEOPage,

  "book/booking-success": {
    title: "Booking Confirmed — Pawls",
    description: "Your dog service booking has been confirmed. View details and manage your appointment.",
    path: "/book/booking-success",
    noIndex: true,
  } as SEOPage,

  viral: {
    title: "Viral Paws — Trending Dogs on Pawls | Most Popular Plus Dogs",
    description:
      "See the most popular dogs on Pawls. Trending Plus community dogs ranked by likes. The top dogs making waves — see who's hot right now.",
    path: "/viral",
  } as SEOPage,

  privacy: {
    title: "Privacy Policy — Pawls",
    description:
      "Pawls Privacy Policy — learn how we collect, use, and protect your personal data. GDPR-compliant. Covers data collection, cookies, third-party services (Stripe, Neon), and your rights.",
    path: "/privacy",
    noIndex: true,
  } as SEOPage,

  press: {
    title: "Press — Pawls",
    description: "Pawls press information.",
  },
  login: {
    title: "Log in — Pawls",
    description: "Log in to Pawls to match, book and connect with the dog community.",
  },
  "forgot-password": {
    title: "Reset your password — Pawls",
    description: "Request a password reset link for your Pawls account.",
  },
  "reset-password": {
    title: "Choose a new password — Pawls",
    description: "Set a new password for your Pawls account.",
  },
  "verify-email": {
    title: "Verify your email — Pawls",
    description: "Confirm your email address to activate your Pawls account.",
  },
  settings: {
    title: "Account settings — Pawls",
    description: "Manage your Pawls account: email verification, password and account deletion.",
  },
  press: {
    title: "Press Kit — Pawls | Media Resources & Brand Assets",
    description:
      "Pawls press kit for journalists and media professionals. Download brand assets (logos, wordmarks), key stats, founder info, app screenshots, and media contact details.",
    path: "/press",
  } as SEOPage,
};

/** Generate SEO for a breeder detail page */
export function seoBreeder(breederName: string, breedSpecialty: string): SEOPage {
  return {
    title: `${breederName} — ${breedSpecialty} Breeder | Pawls`,
    description: `${breederName} — ${breedSpecialty} breeder profile on Pawls. Demo listing — breeder verification is coming soon. Learn about available litters and breeding practices.`,
    path: `/breed/${encodeURIComponent(breederName.toLowerCase().replace(/\s+/g, "-"))}`,
  };
}

/** Generate SEO for a rescue dog detail page */
export function seoRescueDog(dogName: string, breed: string): SEOPage {
  return {
    title: `Adopt ${dogName} — ${breed} for Adoption | Pawls`,
    description: `${dogName} is a ${breed} looking for a forever home. Demo listing — live shelter partnerships are coming soon. Learn about ${dogName}'s temperament and compatibility.`,
    path: `/rescue/${encodeURIComponent(dogName.toLowerCase())}`,
  };
}

/** Generate SEO for a service provider detail page */
export function seoProvider(providerName: string, category: string): SEOPage {
  const catLabel = category.charAt(0).toUpperCase() + category.slice(1);
  return {
    title: `${providerName} — Dog ${catLabel} | Pawls`,
    description: `Explore ${providerName}, a dog ${category} in Paris. Demo listing — online booking is coming soon. View services and availability.`,
    path: `/book/${encodeURIComponent(providerName.toLowerCase().replace(/\s+/g, "-"))}`,
  };
}

/** Generate JSON-LD Organization structured data */
export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    description: SITE_TAGLINE,
    url: SITE_URL,
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Web, iOS, Android",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "EUR",
    },
  };
}

/** Generate BreadcrumbList JSON-LD */
export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
