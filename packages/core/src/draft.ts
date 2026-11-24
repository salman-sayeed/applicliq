import { detectWorkType, parseSalary } from './scrapers/text';
import type { PostingDates } from './smart/red-flags';
import type { Job, SalaryPeriod, WorkType } from './types';
import type { Settings } from './settings';
import type { NewJob } from './storage';
import { normalizeUrl } from './url';

/** The save form's editable state (strings, so inputs can be empty). */
export type Draft = {
  url: string;
  title: string;
  company: string;
  location: string;
  workType: WorkType | '';
  salaryMin: string;
  salaryMax: string;
  currency: string;
  period: SalaryPeriod | '';
  notes: string;
  /** Carried through unchanged from extraction. */
  source?: string;
  descriptionSnapshot?: string;
  /** The posting's dates, for the "Heads up" notes (not saved with the job). */
  posting?: PostingDates;
};

/** `defaults` (the regional settings) fill the currency and period the page didn't give. */
export function draftFrom(job: Partial<Job>, url: string, defaults?: Settings['regional']): Draft {
  return {
    url: job.url ?? url,
    title: job.title ?? '',
    company: job.company ?? '',
    location: job.location ?? '',
    workType: job.workType ?? '',
    salaryMin: job.salary?.min?.toString() ?? '',
    salaryMax: job.salary?.max?.toString() ?? '',
    currency: job.salary?.currency ?? defaults?.currency ?? '',
    period: job.salary?.period ?? defaults?.salaryPeriod ?? '',
    notes: '',
    source: job.source,
    descriptionSnapshot: job.descriptionSnapshot,
  };
}

export function isDraftValid(draft: Draft): boolean {
  return draft.title.trim() !== '' && draft.company.trim() !== '';
}

const toNumber = (value: string) => {
  const n = Number(value.replace(/[,\s]/g, ''));
  return value.trim() && Number.isFinite(n) && n >= 0 ? n : undefined;
};

/**
 * Converts the form into the repository's input; empty optional fields are left out, and so is
 * the description when `keepDescription` is off (the setting).
 */
export function toNewJob(draft: Draft, keepDescription = true): NewJob {
  const job: NewJob = {
    url: draft.url,
    title: draft.title.trim(),
    company: draft.company.trim(),
  };
  const location = draft.location.trim();
  const notes = draft.notes.trim();
  const min = toNumber(draft.salaryMin);
  const max = toNumber(draft.salaryMax);
  if (location) job.location = location;
  if (draft.workType) job.workType = draft.workType;
  if (notes) job.notes = notes;
  if (draft.source) job.source = draft.source;
  if (keepDescription && draft.descriptionSnapshot)
    job.descriptionSnapshot = draft.descriptionSnapshot;
  if (min !== undefined || max !== undefined) {
    job.salary = { min: min ?? max, max: max ?? min };
    const currency = draft.currency.trim().toUpperCase();
    if (currency) job.salary.currency = currency;
    if (draft.period) job.salary.period = draft.period;
  }
  return job;
}

// ---------------------------------------------------------------------------------------------
// Setting one field from text picked on the page (context menu, element picker).

export type DraftField = 'title' | 'company' | 'location' | 'salary' | 'notes';

export const DRAFT_FIELDS: readonly DraftField[] = [
  'title',
  'company',
  'location',
  'salary',
  'notes',
];

export const DRAFT_FIELD_LABELS: Record<DraftField, string> = {
  title: 'Title',
  company: 'Company',
  location: 'Location',
  salary: 'Salary',
  notes: 'Notes',
};

export function isDraftField(value: unknown): value is DraftField {
  return DRAFT_FIELDS.includes(value as DraftField);
}

/** Longest text kept for a one-line field / for notes. */
const MAX_LINE = 300;
const MAX_NOTES = 5000;

/**
 * Sets `field` from page text. One-line fields get the text with whitespace collapsed; notes get
 * it appended on a new line; salary is parsed into min/max/currency/period (`hostname` decides
 * what a bare `$` means). Returns undefined when the text holds nothing usable (empty, or no
 * amount for a salary), leaving the draft as it was.
 */
export function setDraftField(
  draft: Draft,
  field: DraftField,
  text: string,
  hostname?: string,
): Draft | undefined {
  if (field === 'notes') {
    const added = text
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!added) return undefined;
    const notes = draft.notes.trimEnd();
    return { ...draft, notes: (notes ? `${notes}\n${added}` : added).slice(0, MAX_NOTES) };
  }
  const line = text.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE);
  if (!line) return undefined;
  if (field === 'salary') {
    const salary = parseSalary(line, hostname);
    if (!salary) return undefined;
    return {
      ...draft,
      salaryMin: salary.min?.toString() ?? '',
      salaryMax: salary.max?.toString() ?? '',
      currency: salary.currency ?? draft.currency,
      period: salary.period ?? draft.period,
    };
  }
  if (field === 'location') {
    return { ...draft, location: line, workType: draft.workType || detectWorkType(line) || '' };
  }
  return { ...draft, [field]: line };
}

// ---------------------------------------------------------------------------------------------
// Draft storage: one unsaved form per page, kept briefly (the extension uses storage.session).

/** Drafts older than this are dropped. */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

const KEY_PREFIX = 'draft:';

/** The part of `browser.storage.StorageArea` the draft store uses. */
export type DraftStorageArea = {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
};

type StoredDraft = { draft: Draft; savedAt: number };

const DRAFT_STRINGS = [
  'url',
  'title',
  'company',
  'location',
  'workType',
  'salaryMin',
  'salaryMax',
  'currency',
  'period',
  'notes',
] as const;

function isStoredDraft(value: unknown): value is StoredDraft {
  if (typeof value !== 'object' || value === null) return false;
  const { draft, savedAt } = value as Partial<StoredDraft>;
  return (
    typeof savedAt === 'number' &&
    typeof draft === 'object' &&
    draft !== null &&
    DRAFT_STRINGS.every((key) => typeof draft[key] === 'string')
  );
}

/** Storage key of the page's draft: the page URL, normalized like saved job URLs. */
export function draftKey(pageUrl: string): string {
  return KEY_PREFIX + normalizeUrl(pageUrl);
}

export type DraftStore = ReturnType<typeof createDraftStore>;

/** Drafts keyed by the URL of the page they were made on (not the job's canonical URL). */
export function createDraftStore(area: DraftStorageArea, now: () => number = Date.now) {
  const fresh = (stored: StoredDraft) => now() - stored.savedAt < DRAFT_TTL_MS;

  return {
    /** The page's draft, unless there is none or it expired (expired ones are removed). */
    async get(pageUrl: string): Promise<Draft | undefined> {
      const key = draftKey(pageUrl);
      const { [key]: stored } = await area.get(key);
      if (stored === undefined) return undefined;
      if (isStoredDraft(stored) && fresh(stored)) return stored.draft;
      await area.remove(key);
      return undefined;
    },

    async save(pageUrl: string, draft: Draft): Promise<void> {
      await area.set({ [draftKey(pageUrl)]: { draft, savedAt: now() } satisfies StoredDraft });
    },

    async remove(pageUrl: string): Promise<void> {
      await area.remove(draftKey(pageUrl));
    },

    /** Removes every expired or unreadable draft; returns how many. */
    async purgeExpired(): Promise<number> {
      const all = await area.get(null);
      const stale = Object.entries(all)
        .filter(([key]) => key.startsWith(KEY_PREFIX))
        .filter(([, value]) => !isStoredDraft(value) || !fresh(value))
        .map(([key]) => key);
      if (stale.length) await area.remove(stale);
      return stale.length;
    },
  };
}
