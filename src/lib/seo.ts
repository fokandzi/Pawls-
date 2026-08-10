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
      "Pawls is the all-in-one platform for dog people. Find playmates, book walkers & groomers, connect with ethical breeders, rescue dogs, and join local dog communities.",
  } as SEOPage,

  match: {
    title: "Match Your Dog — Find Playmates Nearby | Pawls",
    description:
      "Swipe right to find compatible dog playmates near you. Filter by temperament, size, energy level, and location. Make playdates happen with Pawls Match.",
    path: "/match",
  } as SEOPage,
  register: {
    title: "Sign Up for Pawls — Create Your Free Account",
    description:
      "Create your free Pawls account and start matching your dog with compatible playmates, booking services, and more.",
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

  book: {
    title: "Book Dog Services — Walkers, Groomers, Sitters & Vets | Pawls",
    description:
      "Find and book trusted dog services in Paris: walkers, groomers, sitters, trainers, and veterinarians. Instant online booking with verified providers.",
    path: "/book",
  } as SEOPage,

  "book/register": {
    title: "List Your Dog Service — Join Pawls as a Provider",
    description:
      "Are you a dog walker, groomer, sitter, or trainer in Paris? List your services on Pawls and get booked by local dog owners.",
    path: "/book/register",
  } as SEOPage,

  breed: {
    title: "Ethical Dog Breeders — Find Healthy Puppies | Pawls",
    description:
      "Connect with vetted, ethical dog breeders in Paris and Île-de-France. Browse health-tested litters, learn about breeds, and find your perfect puppy responsibly.",
    path: "/breed",
  } as SEOPage,

  "breed/register": {
    title: "Register as a Breeder — Pawls Breeder Network",
    description:
      "Join the Pawls ethical breeder network. List your litters, showcase health testing, and connect with responsible dog owners.",
    path: "/breed/register",
  } as SEOPage,

  "breed/membership": {
    title: "Breeder Memberships — Pawls Premium Listings",
    description:
      "Upgrade your breeder listing with Pawls membership tiers. Get verified, featured placement, and reach more qualified puppy buyers.",
    path: "/breed/membership",
  } as SEOPage,

  rescue: {
    title: "Adopt a Dog — Rescue Dogs in Paris | Pawls",
    description:
      "Browse adoptable dogs from shelters and rescues across Paris. Find your new best friend — search by breed, size, age, and temperament.",
    path: "/rescue",
  } as SEOPage,

  connect: {
    title: "Dog Community — Groups, Events & Meetups | Pawls",
    description:
      "Join local dog groups, discover dog-friendly events, and connect with dog owners in Paris. From hiking clubs to puppy socials — find your pack.",
    path: "/connect",
  } as SEOPage,

  venues: {
    title: "Dog-Friendly Venues in Paris — Parks, Cafés & More | Pawls",
    description:
      "Discover dog-friendly parks, cafés, bars, and trails in Paris and Île-de-France. Filter by features like off-leash areas, water stations, and more.",
    path: "/venues",
  } as SEOPage,

  plus: {
    title: "Pawls Plus — Premium Dog App Features | Pawls",
    description:
      "Upgrade to Pawls Plus for unlimited swipes, advanced filters, priority booking, verified profile badge, and early access to new features. €8/month.",
    path: "/plus",
  } as SEOPage,

  "plus/success": {
    title: "Welcome to Pawls Plus! | Pawls",
    description:
      "Your Pawls Plus subscription is active. Enjoy unlimited swipes, priority booking, and all premium features.",
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

  paris: {
    title: "Pawls — The Dog App for Paris | Match, Book, Breed & Rescue",
    description:
      "Pawls is the all-in-one dog app for Paris. Find playmates in the 11e, book dog walkers in the Marais, discover ethical breeders in Île-de-France, and adopt rescue dogs across the city.",
    path: "/paris",
  } as SEOPage,

  privacy: {
    title: "Privacy Policy — Pawls",
    description:
      "Pawls Privacy Policy — learn how we collect, use, and protect your personal data. GDPR-compliant. Covers data collection, cookies, third-party services (Stripe, Neon), and your rights.",
    path: "/privacy",
    noIndex: true,
  } as SEOPage,

  press: {
    title: "Press Kit — Pawls | Media Resources & Brand Assets",
    description:
      "Pawls press kit for journalists and media professionals. Download brand assets (logos, wordmarks), key stats, founder info, app screenshots, and media contact details.",
    path: "/press",
  } as SEOPage,
};

/** 20 Paris arrondissements */
export const ARRONDISSEMENTS = [
  { num: "1er", name: "Louvre", center: "Louvre, Palais-Royal, Les Halles" },
  { num: "2e", name: "Bourse", center: "Bourse, Grands Boulevards, Sentier" },
  { num: "3e", name: "Temple", center: "Marais, Temple, Arts-et-Métiers" },
  { num: "4e", name: "Hôtel-de-Ville", center: "Marais, Notre-Dame, Île de la Cité" },
  { num: "5e", name: "Panthéon", center: "Latin Quarter, Sorbonne, Jardin des Plantes" },
  { num: "6e", name: "Luxembourg", center: "Saint-Germain-des-Prés, Luxembourg" },
  { num: "7e", name: "Palais-Bourbon", center: "Eiffel Tower, Invalides, Champ de Mars" },
  { num: "8e", name: "Élysée", center: "Champs-Élysées, Madeleine, Parc Monceau" },
  { num: "9e", name: "Opéra", center: "Opéra Garnier, Pigalle, Trudaine" },
  { num: "10e", name: "Entrepôt", center: "Canal Saint-Martin, Gare du Nord, République" },
  { num: "11e", name: "Popincourt", center: "Bastille, Oberkampf, République" },
  { num: "12e", name: "Reuilly", center: "Gare de Lyon, Bercy, Bois de Vincennes" },
  { num: "13e", name: "Gobelins", center: "Place d'Italie, Bibliothèque, Butte-aux-Cailles" },
  { num: "14e", name: "Observatoire", center: "Montparnasse, Parc Montsouris, Denfert" },
  { num: "15e", name: "Vaugirard", center: "Tour Eiffel, Parc André Citroën, Convention" },
  { num: "16e", name: "Passy", center: "Trocadéro, Bois de Boulogne, Auteuil" },
  { num: "17e", name: "Batignolles-Monceau", center: "Batignolles, Place Clichy, Wagram" },
  { num: "18e", name: "Butte-Montmartre", center: "Montmartre, Sacré-Cœur, Barbès" },
  { num: "19e", name: "Buttes-Chaumont", center: "Parc des Buttes-Chaumont, La Villette, Belleville" },
  { num: "20e", name: "Ménilmontant", center: "Belleville, Père Lachaise, Gambetta" },
];

/** Generate SEO for a paris arrondissement page */
export function seoArrondissement(arr: { num: string; name: string; center: string }): SEOPage {
  return {
    title: `Pawls in Paris ${arr.num} (${arr.name}) — Dog Services, Playmates & Breeders`,
    description: `Find dog playmates, book walkers & groomers, discover breeders, and adopt rescue dogs in Paris ${arr.num} (${arr.name}). Pawls covers ${arr.center} and surrounding areas.`,
    path: `/paris/${arr.num.toLowerCase()}`,
  };
}

/** Generate SEO for a breeder detail page */
export function seoBreeder(breederName: string, breedSpecialty: string): SEOPage {
  return {
    title: `${breederName} — ${breedSpecialty} Breeder | Pawls`,
    description: `${breederName} — ethical ${breedSpecialty} breeder. Health-tested puppies, verified breeder on Pawls. Learn about available litters and breeding practices.`,
    path: `/breed/${encodeURIComponent(breederName.toLowerCase().replace(/\s+/g, "-"))}`,
  };
}

/** Generate SEO for a rescue dog detail page */
export function seoRescueDog(dogName: string, breed: string): SEOPage {
  return {
    title: `Adopt ${dogName} — ${breed} for Adoption in Paris | Pawls`,
    description: `${dogName} is a ${breed} looking for a forever home in Paris. Learn more about ${dogName}'s temperament, compatibility, and how to adopt through Pawls Rescue.`,
    path: `/rescue/${encodeURIComponent(dogName.toLowerCase())}`,
  };
}

/** Generate SEO for a service provider detail page */
export function seoProvider(providerName: string, category: string): SEOPage {
  const catLabel = category.charAt(0).toUpperCase() + category.slice(1);
  return {
    title: `${providerName} — Dog ${catLabel} in Paris | Pawls`,
    description: `Book ${providerName}, a trusted dog ${category} in Paris. View services, ratings, and availability. Instant online booking on Pawls.`,
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
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "1240",
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
