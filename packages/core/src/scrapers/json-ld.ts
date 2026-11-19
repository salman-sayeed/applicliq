import type { Salary, SalaryPeriod } from '../types';
import { cleanText, htmlToText } from './text';
import type { ExtractedFields } from './types';

type JsonObject = Record<string, unknown>;

const MAX_DEPTH = 6;

function asObject(value: unknown): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

/** Schema.org allows most properties to be a single value or an array. */
function asList(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' ? cleanText(value) : undefined;
}

/** A Thing's name, whether given as a string or `{ name }`. */
function nameOf(value: unknown): string | undefined {
  for (const item of asList(value)) {
    const name = asString(item) ?? asString(asObject(item)?.name);
    if (name) return name;
  }
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const digits = value.replace(/[^\d.]/g, '');
  const n = Number(digits);
  return digits && Number.isFinite(n) ? n : undefined;
}

function isJobPosting(obj: JsonObject): boolean {
  return asList(obj['@type']).some((t) => typeof t === 'string' && /JobPosting$/.test(t));
}

/** Finds the first JobPosting anywhere in a JSON-LD tree (arrays, `@graph`, nested values). */
function findJobPosting(node: unknown, depth = 0): JsonObject | undefined {
  if (depth > MAX_DEPTH) return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findJobPosting(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const obj = asObject(node);
  if (!obj) return undefined;
  if (isJobPosting(obj)) return obj;
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const found = findJobPosting(value, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

/** Parses a JSON-LD block, tolerating the HTML comments and raw newlines some sites emit. */
function parseBlock(block: string): unknown {
  try {
    return JSON.parse(block);
  } catch {
    const cleaned = block
      .replace(/^\s*(<!--|\/\/\s*<!\[CDATA\[)/, '')
      .replace(/(-->|\/\/\s*\]\]>)\s*$/, '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f]+/g, ' ');
    try {
      return JSON.parse(cleaned);
    } catch {
      return undefined;
    }
  }
}

function decode(value: string | undefined, doc: Document): string | undefined {
  return value && /&(#\d+|#x[\da-f]+|[a-z]+);/i.test(value)
    ? cleanText(htmlToText(value, doc))
    : value;
}

function parseAddress(value: unknown): string | undefined {
  const text = asString(value);
  if (text) return text;
  const a = asObject(value);
  if (!a) return undefined;
  const parts = [a.addressLocality, a.addressRegion, a.addressCountry].map(nameOf);
  return [...new Set(parts.filter(Boolean))].join(', ') || undefined;
}

/** A list this long covers (nearly) every country: some boards list them all for "anywhere". */
const WORLDWIDE_COUNT = 100;
/** Longer lists show the first few and a count, so the field stays readable. */
const SHOWN_PLACES = 3;

let regionNames: Intl.DisplayNames | undefined | null;

/** "DE" → "Germany". Other names are returned unchanged. */
function countryName(value: string): string {
  if (!/^[A-Z]{2}$/.test(value)) return value;
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
    } catch {
      regionNames = null;
    }
  }
  return regionNames?.of(value) ?? value;
}

function summarizePlaces(places: string[]): string | undefined {
  const unique = [...new Set(places)];
  if (unique.length === 0) return undefined;
  if (unique.length >= WORLDWIDE_COUNT) return 'Anywhere';
  if (unique.length <= SHOWN_PLACES + 1) return unique.join(' / ');
  return `${unique.slice(0, SHOWN_PLACES).join(' / ')} +${unique.length - SHOWN_PLACES} more`;
}

function parseLocation(posting: JsonObject): string | undefined {
  const places = asList(posting.jobLocation)
    .map((loc) => {
      const place = asObject(loc);
      return place ? (parseAddress(place.address) ?? asString(place.name)) : asString(loc);
    })
    .filter((p): p is string => !!p);
  if (places.length) return summarizePlaces(places);
  // Remote postings often only say where applicants may live, sometimes as country codes.
  const regions = asList(posting.applicantLocationRequirements)
    .map(nameOf)
    .filter((r): r is string => !!r)
    .map(countryName);
  return summarizePlaces(regions);
}

function parsePeriod(unit: string | undefined): SalaryPeriod | undefined {
  switch (unit?.toUpperCase()) {
    case 'HOUR':
      return 'hour';
    case 'MONTH':
      return 'month';
    case 'YEAR':
      return 'year';
    default:
      return undefined;
  }
}

/** `baseSalary` / `estimatedSalary`: MonetaryAmount with a number or QuantitativeValue. */
function parseSalary(posting: JsonObject): Salary | undefined {
  const amounts = [...asList(posting.baseSalary), ...asList(posting.estimatedSalary)];
  for (const item of amounts) {
    const amount = asObject(item);
    if (!amount) continue;
    const value = asObject(asList(amount.value)[0]);
    const single = asNumber(value?.value ?? amount.value);
    const min = asNumber(value?.minValue ?? amount.minValue) ?? single;
    const max = asNumber(value?.maxValue ?? amount.maxValue) ?? single ?? min;
    if (min === undefined && max === undefined) continue;
    const salary: Salary = { min, max };
    const currency = asString(amount.currency ?? value?.currency)?.toUpperCase();
    const period = parsePeriod(asString(value?.unitText ?? amount.unitText));
    if (currency) salary.currency = currency;
    if (period) salary.period = period;
    return salary;
  }
  return undefined;
}

/** Fields from the first schema.org JobPosting in the given JSON-LD blocks. */
export function parseJobPostingJsonLd(
  blocks: string[],
  doc: Document,
): ExtractedFields | undefined {
  for (const block of blocks) {
    const posting = findJobPosting(parseBlock(block));
    if (!posting) continue;

    // Raw, not cleaned: line breaks in a plain-text description are meaningful.
    const description = typeof posting.description === 'string' ? posting.description : undefined;
    const locationType = asList(posting.jobLocationType).map(asString).join(' ');
    return {
      title: decode(asString(posting.title) ?? asString(posting.name), doc),
      company: decode(nameOf(posting.hiringOrganization), doc),
      location: decode(parseLocation(posting), doc),
      description: description?.trim() ? htmlToText(description, doc) : undefined,
      salary: parseSalary(posting),
      workType: /TELECOMMUTE|REMOTE/i.test(locationType)
        ? 'remote'
        : /HYBRID/i.test(locationType)
          ? 'hybrid'
          : undefined,
    };
  }
  return undefined;
}

/** JobPosting fields from the page's `<script type="application/ld+json">` blocks. */
export function extractJsonLd(doc: Document): ExtractedFields | undefined {
  const blocks = [...doc.querySelectorAll('script[type="application/ld+json"]')].map(
    (el) => el.textContent ?? '',
  );
  return parseJobPostingJsonLd(blocks, doc);
}
