import { jsonLdScraper } from './json-ld';
import type { ScrapedJob, Scraper } from './types';

export type { ScrapedJob, Scraper } from './types';
export { jsonLdScraper, parseJobPostingJsonLd } from './json-ld';

/** Site-specific scrapers go first; the generic JSON-LD scraper is the fallback. */
export const scrapers: Scraper[] = [jsonLdScraper];

export function scrapePage(doc: Document, url: URL): ScrapedJob | undefined {
  for (const scraper of scrapers) {
    if (!scraper.matches(url)) continue;
    try {
      const result = scraper.scrape(doc, url);
      if (result) return result;
    } catch {
      // A broken scraper must never break the page or the popup.
    }
  }
  return undefined;
}
