import type { WorkType } from '../types';
import type { ScrapedJob, Scraper } from './types';

type JsonObject = Record<string, unknown>;

const MAX_DESCRIPTION = 20_000;

function asObject(value: unknown): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function findJobPosting(node: unknown): JsonObject | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return undefined;
  }
  const obj = asObject(node);
  if (!obj) return undefined;
  const type = obj['@type'];
  if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) return obj;
  return findJobPosting(obj['@graph']);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseLocation(posting: JsonObject): string | undefined {
  const locations = [posting.jobLocation].flat();
  const parts = locations
    .map((loc) => asObject(asObject(loc)?.address))
    .filter((a): a is JsonObject => !!a)
    .map((a) =>
      [a.addressLocality, a.addressRegion, a.addressCountry]
        .map((v) => asString(v) ?? asString(asObject(v)?.name))
        .filter(Boolean)
        .join(', '),
    )
    .filter(Boolean);
  return parts.length ? parts.join(' / ') : undefined;
}

/**
 * Parses schema.org JobPosting JSON-LD blocks. Pure (takes the raw script
 * contents) so it is easy to test; `jsonLdScraper` wraps it for real pages.
 */
export function parseJobPostingJsonLd(blocks: string[]): ScrapedJob | undefined {
  for (const block of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(block);
    } catch {
      continue;
    }
    const posting = findJobPosting(data);
    if (!posting) continue;

    const result: ScrapedJob = {
      title: asString(posting.title),
      company: asString(asObject(posting.hiringOrganization)?.name),
      location: parseLocation(posting),
    };

    const locationType = asString(posting.jobLocationType);
    if (locationType === 'TELECOMMUTE') result.workType = 'remote' satisfies WorkType;

    const salary = asObject(posting.baseSalary);
    const value = asObject(salary?.value);
    if (salary && value) {
      const unit = asString(value.unitText)?.toUpperCase();
      const min = Number(value.minValue ?? value.value);
      const max = Number(value.maxValue ?? value.value);
      result.salary = {
        currency: asString(salary.currency),
        min: Number.isFinite(min) ? min : undefined,
        max: Number.isFinite(max) ? max : undefined,
        period:
          unit === 'HOUR'
            ? 'hour'
            : unit === 'MONTH'
              ? 'month'
              : unit === 'YEAR'
                ? 'year'
                : undefined,
      };
    }

    const description = asString(posting.description);
    if (description) result.descriptionSnapshot = stripHtml(description).slice(0, MAX_DESCRIPTION);

    return result;
  }
  return undefined;
}

/** Generic fallback scraper for any site that publishes schema.org JobPosting data. */
export const jsonLdScraper: Scraper = {
  id: 'json-ld',
  matches: () => true,
  scrape(doc, url) {
    const blocks = [...doc.querySelectorAll('script[type="application/ld+json"]')].map(
      (el) => el.textContent ?? '',
    );
    const scraped = parseJobPostingJsonLd(blocks);
    return scraped && { ...scraped, url: url.href, source: url.hostname };
  },
};
