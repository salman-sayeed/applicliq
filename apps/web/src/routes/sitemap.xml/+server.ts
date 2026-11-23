import { SITE_URL } from '#lib/links.ts';

export const prerender = true;

/** Public pages; the dashboard (/app) is personal and marked noindex. */
const PAGES = ['/', '/install', '/privacy'];

export function GET(): Response {
  const urls = PAGES.map((path) => `  <url><loc>${SITE_URL}${path}</loc></url>`).join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml' } },
  );
}
