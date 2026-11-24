import type { Job, Salary, WorkType } from '../types';
import { type PostingDates, parseRelativePosted } from '../smart/red-flags';
import { normalizeUrl } from '../url';
import { extractJsonLd } from './json-ld';
import { extractMeta } from './meta';
import { findAdapter } from './sites';
import {
  cleanText,
  detectCurrency,
  detectWorkType,
  detectWorkTypeInDescription,
  parseSalary,
  truncateUtf8,
} from './text';
import type { ExtractedFields, ExtractedJob, SiteAdapter } from './types';

/** How much each strategy is trusted (multiplies a field's weight in the confidence). */
const TRUST = {
  jsonLd: 1,
  adapter: 0.9,
  detected: 0.7,
  meta: 0.5,
  guessed: 0.4,
} as const;

/** Share of the confidence each field carries. Sums to 1. */
const WEIGHTS = {
  title: 0.35,
  company: 0.3,
  descriptionSnapshot: 0.15,
  location: 0.1,
  workType: 0.05,
  salary: 0.05,
} as const;

type Field = keyof typeof WEIGHTS;
type Values = {
  title: string;
  company: string;
  location: string;
  descriptionSnapshot: string;
  workType: WorkType;
  salary: Salary;
};

/** Runs a strategy; a broken one must never break extraction. */
function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/**
 * Extracts a job posting from the current page. Never throws and never makes network requests.
 *
 * Strategies, in priority order (a field keeps the first value found):
 * 1. schema.org JobPosting JSON-LD,
 * 2. the site adapter for known boards (LinkedIn, Indeed, Glassdoor, Bdjobs, Wellfound,
 *    Greenhouse, Lever, Workday),
 * 3. Open Graph / meta tags / `<title>`.
 * Work type and salary currency are then filled in from the page text if still missing.
 */
export function extractJob(doc: Document, url: URL, now: number = Date.now()): ExtractedJob {
  const adapter: SiteAdapter | undefined = attempt(() => findAdapter(url));
  const found: { [F in Field]?: { value: Values[F]; trust: number } } = {};
  const sources = new Set<string>();

  function offer<F extends Field>(
    field: F,
    value: Values[F] | undefined,
    trust: number,
    source: string,
  ) {
    if (value === undefined || found[field]) return;
    if (typeof value === 'string' && !value.trim()) return;
    (found as Record<Field, { value: unknown; trust: number }>)[field] = { value, trust };
    sources.add(source);
  }

  const posting: PostingDates = {};

  function offerFields(fields: ExtractedFields | undefined, trust: number, source: string) {
    if (!fields) return;
    posting.datePosted ??= fields.datePosted ?? parseRelativePosted(fields.postedText, now);
    posting.validThrough ??= fields.validThrough;
    const trustOf = (f: keyof ExtractedFields) =>
      fields.guessed?.includes(f) ? Math.min(trust, TRUST.guessed) : trust;
    offer('title', cleanText(fields.title), trustOf('title'), source);
    offer('company', cleanText(fields.company), trustOf('company'), source);
    offer('location', cleanText(fields.location), trustOf('location'), source);
    offer('descriptionSnapshot', fields.description?.trim(), trustOf('description'), source);
    offer('workType', fields.workType, trustOf('workType'), source);
    offer('workType', detectWorkType(fields.workplaceText), trustOf('workplaceText'), source);
    const salary = fields.salary ?? parseSalary(fields.salaryText, url.hostname);
    offer('salary', salary, trustOf(fields.salary ? 'salary' : 'salaryText'), source);
  }

  offerFields(
    attempt(() => extractJsonLd(doc)),
    TRUST.jsonLd,
    'json-ld',
  );
  if (adapter) {
    offerFields(
      attempt(() => adapter.extract(doc, url)),
      TRUST.adapter,
      adapter.id,
    );
  }
  offerFields(
    attempt(() => extractMeta(doc)),
    TRUST.meta,
    'meta',
  );

  // Text detection for what structured data left out.
  const description = found.descriptionSnapshot?.value;
  const header = [found.title?.value, found.location?.value].filter(Boolean).join(' · ');
  offer('workType', detectWorkType(header), TRUST.detected, 'text');
  offer('workType', detectWorkTypeInDescription(description), TRUST.detected, 'text');

  let salary = found.salary?.value;
  if (salary && !salary.currency) {
    const currency =
      detectCurrency(description, url.hostname) ?? adapter?.defaultCurrency ?? undefined;
    if (currency) {
      salary = { ...salary, currency };
      sources.add('text');
    }
  }

  const canonical = attempt(() => adapter?.canonicalUrl?.(url));
  const job: Partial<Job> = {
    url: normalizeUrl(canonical ?? url.href),
    source: adapter?.id ?? url.hostname,
  };
  if (found.title) job.title = found.title.value;
  if (found.company) job.company = found.company.value;
  if (found.location) job.location = found.location.value;
  if (found.workType) job.workType = found.workType.value;
  if (salary) job.salary = salary;
  if (description) job.descriptionSnapshot = truncateUtf8(description);

  let confidence = 0;
  for (const field of Object.keys(WEIGHTS) as Field[]) {
    confidence += WEIGHTS[field] * (found[field]?.trust ?? 0);
  }

  const result: ExtractedJob = {
    job,
    confidence: Math.round(confidence * 100) / 100,
    sources: [...sources],
  };
  if (posting.datePosted !== undefined || posting.validThrough !== undefined) {
    result.posting = Object.fromEntries(
      Object.entries(posting).filter(([, v]) => v !== undefined),
    ) as PostingDates;
  }
  return result;
}
