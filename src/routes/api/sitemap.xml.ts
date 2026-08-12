import { createFileRoute } from "@tanstack/react-router";

const BASE = "https://pawls.club";

// Static routes with their lastmod
const staticRoutes: { path: string; lastmod: string; priority: string; changefreq: string }[] = [
  { path: "/", lastmod: "2026-07-20", priority: "1.0", changefreq: "weekly" },
  { path: "/match", lastmod: "2026-07-20", priority: "0.9", changefreq: "weekly" },
  { path: "/match/create", lastmod: "2026-07-20", priority: "0.7", changefreq: "monthly" },
  { path: "/match/matches", lastmod: "2026-07-20", priority: "0.6", changefreq: "daily" },
  { path: "/book", lastmod: "2026-07-20", priority: "0.9", changefreq: "weekly" },
  { path: "/book/register", lastmod: "2026-07-20", priority: "0.7", changefreq: "monthly" },
  { path: "/breed", lastmod: "2026-07-20", priority: "0.9", changefreq: "weekly" },
  { path: "/breed/register", lastmod: "2026-07-20", priority: "0.7", changefreq: "monthly" },
  { path: "/breed/membership", lastmod: "2026-07-20", priority: "0.6", changefreq: "monthly" },
  { path: "/rescue", lastmod: "2026-07-20", priority: "0.9", changefreq: "weekly" },
  { path: "/connect", lastmod: "2026-07-20", priority: "0.8", changefreq: "weekly" },
  { path: "/venues", lastmod: "2026-07-20", priority: "0.8", changefreq: "weekly" },
  { path: "/plus", lastmod: "2026-07-20", priority: "0.8", changefreq: "weekly" },
];

function urlEntry(loc: string, lastmod: string, priority: string, changefreq: string): string {
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function generateSitemap(): string {
  const entries: string[] = [];

  // Static routes
  for (const r of staticRoutes) {
    entries.push(urlEntry(`${BASE}${r.path}`, r.lastmod, r.priority, r.changefreq));
  }


  // Breeder detail pages (seeded data — IDs 1-6)
  const breederSlugs = [
    "labradors-dile-de-france",
    "corgis-de-paris",
    "golden-retrievers-de-seine",
    "border-collies-de-france",
    "french-bulldogs-de-paris",
    "berneses-dile-de-france",
  ];
  for (const slug of breederSlugs) {
    entries.push(urlEntry(`${BASE}/breed/${slug}`, "2026-07-20", "0.7", "weekly"));
  }

  // Rescue dog detail pages (seeded data — IDs 1-16)
  const rescueDogs = [
    "bella", "rocky", "toby", "nala",
    "charlie", "daisy", "oscar",
    "lola", "max", "zara", "milo",
    "finn", "kiki", "duke",
  ];
  for (const dog of rescueDogs) {
    entries.push(urlEntry(`${BASE}/rescue/${dog}`, "2026-07-20", "0.7", "weekly"));
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>`;
}

export const Route = createFileRoute("/api/sitemap/xml")({
  methods: ["GET"],
  handler: async () => {
    const xml = generateSitemap();
    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  },
});
