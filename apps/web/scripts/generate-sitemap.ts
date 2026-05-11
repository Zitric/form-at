#!/usr/bin/env tsx
/**
 * Emits `public/sitemap.xml` listing every public route — including dynamic
 * ones built from the data layer (`djs`, `sets`, `events`). Crawlers discover
 * detail pages without having to follow links from the listings.
 *
 * Runs as part of `pnpm build` so the deployed sitemap matches the deployed data.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { djs } from "../app/data/djs";
import { events } from "../app/data/events";
import { sets } from "../app/data/sets";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITE = "https://formatglasgow.com";

const staticRoutes = ["/", "/sets", "/events", "/djs"] as const;
const djRoutes = djs.map((d) => `/djs/${d.id}`);
const setRoutes = sets.map((s) => `/sets/${s.id}`);
const eventRoutes = events.map((e) => `/events/${e.id}`);

const allRoutes = [...staticRoutes, ...djRoutes, ...setRoutes, ...eventRoutes];

const today = new Date().toISOString().slice(0, 10);

const urls = allRoutes
  .map((path) => `  <url><loc>${SITE}${path}</loc><lastmod>${today}</lastmod></url>`)
  .join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

const outPath = join(ROOT, "public", "sitemap.xml");
writeFileSync(outPath, xml);

console.log(`✓ public/sitemap.xml (${allRoutes.length} URLs)`);
