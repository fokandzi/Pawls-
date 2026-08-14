import { createFileRoute } from "@tanstack/react-router";

const BASE = "https://pawls.club";

// Deliberate sitemap (owner directive 2026-08-14): public, indexable launch
// pages ONLY. Auth/registration flows (/register, /login, /match/create,
// /match/matches, /book/register, /breed/register …) do not need SEO indexing,
// demo breeder/rescue detail slugs must never be indexed as real supply, and
// /breed/membership prices an unlaunched product — all excluded.
const staticRoutes: { path: string; lastmod: string; priority: string; changefreq: string }[] = [
  { path: "/", lastmod: "2026-08-14", priority: "1.0", changefreq: "weekly" },
  { path: "/match", lastmod: "2026-08-14", priority: "0.9", changefreq: "weekly" },
  { path: "/book", lastmod: "2026-08-14", priority: "0.9", changefreq: "weekly" },
  { path: "/breed", lastmod: "2026-08-14", priority: "0.9", changefreq: "weekly" },
  { path: "/rescue", lastmod: "2026-08-14", priority: "0.9", changefreq: "weekly" },
  { path: "/connect", lastmod: "2026-08-14", priority: "0.8", changefreq: "weekly" },
  { path: "/venues", lastmod: "2026-08-14", priority: "0.8", changefreq: "weekly" },
  { path: "/plus", lastmod: "2026-08-14", priority: "0.8", changefreq: "weekly" },
  { path: "/press", lastmod: "2026-08-14", priority: "0.6", changefreq: "monthly" },
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

  // Static public routes only — no demo-data detail slugs, no auth/private routes.
  for (const r of staticRoutes) {
    entries.push(urlEntry(`${BASE}${r.path}`, r.lastmod, r.priority, r.changefreq));
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
