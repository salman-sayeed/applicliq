import type { Job, StatusChange } from '../types';

/**
 * "Same job on two sites": the same posting saved from, say, LinkedIn and the company's own
 * careers page. Matched on the company (normalized) and the title (token similarity), within a
 * time window. Everything here is pure and runs on this device.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Title similarity at or above this counts as the same job. */
export const DUPLICATE_SIMILARITY = 0.8;
/** Jobs saved further apart than this are never duplicates (a re-posting is a new application). */
export const DUPLICATE_WINDOW_DAYS = 60;

/** Legal-form words dropped from company names. */
const COMPANY_SUFFIXES = new Set([
  'inc',
  'incorporated',
  'ltd',
  'limited',
  'llc',
  'llp',
  'gmbh',
  'ag',
  'co',
  'corp',
  'corporation',
  'company',
  'plc',
  'sa',
  'sas',
  'srl',
  'bv',
  'nv',
  'pvt',
  'pty',
  'oy',
  'ab',
  'as',
  'kg',
  'se',
]);

/** Splits on anything that isn't a letter or digit (any script). */
function words(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** "Acme, Inc." → "acme"; "ACME GmbH & Co. KG" → "acme". */
export function normalizeCompany(name: string): string {
  // Dots go first, so "S.A." and "Co." read as the words "sa" and "co".
  const parts = words(name.replace(/\./g, '').replace(/&/g, ' '));
  // Only trailing legal forms go: "The Company Store" keeps its middle word.
  while (parts.length > 1 && COMPANY_SUFFIXES.has(parts[parts.length - 1]!)) parts.pop();
  return parts.join(' ');
}

/**
 * Title words without the noise boards add: anything in brackets ("(Senior)", "[Remote]",
 * "(m/w/d)") and punctuation.
 */
export function titleTokens(title: string): string[] {
  const plain = title.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' ');
  return words(plain);
}

export function normalizeTitle(title: string): string {
  return titleTokens(title).join(' ');
}

/**
 * Sørensen–Dice coefficient of two titles' word sets: 2·|A∩B| / (|A|+|B|), from 0 (nothing in
 * common) to 1 (same words). "Frontend Engineer" vs "Senior Frontend Engineer" scores 0.8.
 */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(titleTokens(a));
  const tb = new Set(titleTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return (2 * common) / (ta.size + tb.size);
}

/** Key of an unordered pair of job ids, as stored in `notDuplicatePairs`. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

type Comparable = Pick<Job, 'company' | 'title'> & { id?: string; createdAt?: number };

/** Whether two jobs look like the same posting (company, title, and time window). */
export function looksLikeSameJob(
  a: Comparable,
  b: Comparable,
  windowDays: number = DUPLICATE_WINDOW_DAYS,
): boolean {
  const company = normalizeCompany(a.company);
  if (!company || company !== normalizeCompany(b.company)) return false;
  if (a.createdAt !== undefined && b.createdAt !== undefined) {
    if (Math.abs(a.createdAt - b.createdAt) > windowDays * DAY_MS) return false;
  }
  return titleSimilarity(a.title, b.title) >= DUPLICATE_SIMILARITY;
}

export type DuplicateOptions = {
  /** Pairs the user said aren't duplicates (`pairKey`s). */
  notDuplicates?: Iterable<string>;
  windowDays?: number;
};

/**
 * Saved jobs that look like `candidate` (a job about to be saved, or a saved one), most similar
 * first. A candidate without a `createdAt` is treated as created `now`.
 */
export function findDuplicates(
  candidate: Comparable & { url?: string },
  jobs: readonly Job[],
  { notDuplicates = [], windowDays = DUPLICATE_WINDOW_DAYS }: DuplicateOptions = {},
  now: number = Date.now(),
): Job[] {
  const skip = new Set(notDuplicates);
  const self = { ...candidate, createdAt: candidate.createdAt ?? now };
  return jobs
    .filter(
      (job) =>
        job.id !== candidate.id &&
        !(candidate.id && skip.has(pairKey(candidate.id, job.id))) &&
        looksLikeSameJob(self, job, windowDays),
    )
    .map((job) => ({ job, score: titleSimilarity(candidate.title, job.title) }))
    .sort((a, b) => b.score - a.score || b.job.createdAt - a.job.createdAt)
    .map((m) => m.job);
}

export type DuplicatePair = { a: Job; b: Job };

/**
 * Every pair of saved jobs that look like the same posting, for the dashboard's "Possible
 * duplicates" panel. Pairs the user dismissed are left out. The older job comes first.
 */
export function duplicatePairs(
  jobs: readonly Job[],
  { notDuplicates = [], windowDays = DUPLICATE_WINDOW_DAYS }: DuplicateOptions = {},
): DuplicatePair[] {
  const skip = new Set(notDuplicates);
  // Grouped by company first, so the comparison stays cheap with many jobs.
  const byCompany = new Map<string, Job[]>();
  for (const job of jobs) {
    const key = normalizeCompany(job.company);
    if (key) byCompany.set(key, [...(byCompany.get(key) ?? []), job]);
  }
  const pairs: DuplicatePair[] = [];
  for (const group of byCompany.values()) {
    const sorted = [...group].sort((x, y) => x.createdAt - y.createdAt || (x.id < y.id ? -1 : 1));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!;
        const b = sorted[j]!;
        if (skip.has(pairKey(a.id, b.id))) continue;
        if (looksLikeSameJob(a, b, windowDays)) pairs.push({ a, b });
      }
    }
  }
  return pairs.sort((x, y) => y.b.createdAt - x.b.createdAt);
}

function joinText(a: string | undefined, b: string | undefined): string | undefined {
  const x = a?.trim();
  const y = b?.trim();
  if (!x) return y || undefined;
  if (!y || x === y || x.includes(y)) return x;
  return `${x}\n\n${y}`;
}

/**
 * Folds `other` into `keep`: `other`'s URL (and its alternates) become alternate URLs, notes and
 * tags are combined, the earliest `createdAt` stays, histories are merged in date order, and
 * fields `keep` lacks are taken from `other`. The caller tombstones `other`. `updatedAt` is left
 * to the repository.
 */
export function mergeDuplicateJobs(keep: Job, other: Job): Job {
  const urls = [other.url, ...(other.alternateUrls ?? []), ...(keep.alternateUrls ?? [])];
  const alternateUrls = [...new Set(urls)].filter((u) => u && u !== keep.url);

  const tags: string[] = [];
  for (const tag of [...(keep.tags ?? []), ...(other.tags ?? [])]) {
    if (!tags.some((t) => t.toLowerCase() === tag.toLowerCase())) tags.push(tag);
  }

  const seen = new Set<string>();
  const history: StatusChange[] = [...keep.history, ...other.history]
    .sort((a, b) => a.at - b.at)
    .filter((h) => {
      const key = `${h.status}@${h.at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const merged: Job = {
    ...other,
    ...stripUndefined(keep),
    history,
    createdAt: Math.min(keep.createdAt, other.createdAt),
  };
  const notes = joinText(keep.notes, other.notes);
  if (notes) merged.notes = notes;
  else delete merged.notes;
  if (tags.length) merged.tags = tags;
  else delete merged.tags;
  if (alternateUrls.length) merged.alternateUrls = alternateUrls;
  else delete merged.alternateUrls;
  // Fields that describe one record, not the job: keep's own.
  for (const key of ['importBatchId', 'importedAt'] as const) {
    if (keep[key] === undefined) delete merged[key];
  }
  delete merged.deletedAt;
  return merged;
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const SOURCE_NAMES: Record<string, string> = {
  linkedin: 'LinkedIn',
  indeed: 'Indeed',
  glassdoor: 'Glassdoor',
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  workday: 'Workday',
  wellfound: 'Wellfound',
  bdjobs: 'Bdjobs',
};

/** Where a job was saved from, for people: "LinkedIn", "careers.acme.com". */
export function sourceName(job: Pick<Job, 'source' | 'url'>): string {
  const source = job.source?.trim();
  if (source) return SOURCE_NAMES[source.toLowerCase()] ?? source.replace(/^www\./, '');
  try {
    return new URL(job.url).hostname.replace(/^www\./, '');
  } catch {
    return 'another site';
  }
}
