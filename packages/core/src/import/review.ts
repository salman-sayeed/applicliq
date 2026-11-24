import { parseSalary } from '../scrapers/text';
import { firstAppliedAt } from '../stats';
import type { Job, JobStatus, Salary } from '../types';
import { normalizeUrl } from '../url';
import type { CsvTable } from './csv-parse';
import {
  type ColumnMapping,
  type DateOrder,
  type ImportField,
  guessStatus,
  parseImportDate,
  statusKey,
} from './fields';

/** One job ready to be added by an import (see `JobRepository.importJobs`). */
export type ImportDraft = {
  title: string;
  company: string;
  /** '' when the row has no usable link. */
  url: string;
  location?: string;
  status: JobStatus;
  /** When the application was sent (or the job saved, for `saved`). */
  appliedAt?: number;
  salary?: Salary;
  source?: string;
  notes?: string;
  tags?: string[];
  resumeVersion?: string;
  contact?: { name?: string; email?: string };
};

export type ImportOptions = {
  mapping: ColumnMapping;
  /** Status per raw value (keyed by `statusKey`); unlisted values fall back to `guessStatus`. */
  statusMap?: Record<string, JobStatus>;
  /** Status when the row has none or it isn't recognised: applied if dated, else saved. */
  defaultStatus?: JobStatus;
  /** For numeric dates that could be read either way. */
  dateOrder: DateOrder;
  /** Used when no column gives a source (e.g. "linkedin"). */
  defaultSource?: string;
  /** Columns copied into the notes as "Header: value" lines. */
  noteColumns?: number[];
  /** The user's own status names, also recognised in the status column. */
  statusLabels?: Partial<Record<JobStatus, string>>;
};

export type ImportRowKind = 'new' | 'duplicate' | 'error';

export type ImportRow = {
  /** Index in `table.rows`. */
  index: number;
  kind: ImportRowKind;
  /** Missing only for errors. */
  draft?: ImportDraft;
  /** What's wrong with an error row, in plain words. */
  problem?: string;
  /** What a duplicate matches: a saved job (with its id) or an earlier row of this file. */
  duplicateOf?: { id?: string; title: string; company: string; row?: number };
};

const MAX_LINE = 300;
const MAX_NOTES = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A same company + title within this many days of each other is the same application. */
export const DUPLICATE_WINDOW_MS = 3 * DAY_MS;

const line = (value: string | undefined) => value?.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE);

/** An http(s) link from a cell, adding `https://` to a bare `www.example.com/job`. */
function readUrl(value: string): string {
  const text = value.trim();
  if (!text) return '';
  const candidate = /^https?:\/\//i.test(text)
    ? text
    : /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(text)
      ? `https://${text}`
      : '';
  try {
    return candidate ? new URL(candidate).href : '';
  } catch {
    return '';
  }
}

function readEmail(value: string): string | undefined {
  const text = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : undefined;
}

/** Tags from "remote; dream job, startup". */
function readTags(value: string): string[] | undefined {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of value.split(/[,;|]/)) {
    const tag = raw.trim().slice(0, 40);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
  }
  return tags.length ? tags.slice(0, 20) : undefined;
}

/** The job one row describes, or the reason it can't be imported. */
export function rowToDraft(
  cells: readonly string[],
  headers: readonly string[],
  options: ImportOptions,
): { draft: ImportDraft } | { problem: string } {
  const { mapping } = options;
  const get = (field: ImportField) => {
    const column = mapping[field];
    return column === undefined ? '' : (cells[column] ?? '').trim();
  };

  const title = line(get('title')) ?? '';
  const company = line(get('company')) ?? '';
  if (!title && !company) return { problem: 'No job title or company' };

  const dateText = get('appliedAt');
  const appliedAt = parseImportDate(dateText, options.dateOrder);
  if (appliedAt === null) return { problem: `Unreadable date “${dateText.slice(0, 40)}”` };

  const rawStatus = get('status');
  const status =
    (rawStatus &&
      (options.statusMap?.[statusKey(rawStatus)] ??
        guessStatus(rawStatus, options.statusLabels))) ||
    options.defaultStatus ||
    (appliedAt !== undefined ? 'applied' : 'saved');

  const noteLines: string[] = [];
  const notes = get('notes');
  if (notes) noteLines.push(notes);
  for (const column of options.noteColumns ?? []) {
    const value = (cells[column] ?? '').trim();
    if (value && column !== mapping.notes) noteLines.push(`${headers[column]}: ${value}`);
  }

  const draft: ImportDraft = {
    title: title || '(untitled)',
    company,
    url: readUrl(get('url')),
    status,
  };
  if (appliedAt !== undefined) draft.appliedAt = appliedAt;
  const location = line(get('location'));
  if (location) draft.location = location;
  const salary = parseSalary(get('salary'));
  if (salary) draft.salary = salary;
  const source = line(get('source')) || options.defaultSource;
  if (source) draft.source = source;
  if (noteLines.length) draft.notes = noteLines.join('\n').slice(0, MAX_NOTES);
  const tags = readTags(get('tags'));
  if (tags) draft.tags = tags;
  const resume = line(get('resumeVersion'))?.slice(0, 60);
  if (resume) draft.resumeVersion = resume;
  const contactName = line(get('contactName'));
  const contactEmail = readEmail(get('contactEmail'));
  if (contactName || contactEmail) {
    draft.contact = {};
    if (contactName) draft.contact.name = contactName;
    if (contactEmail) draft.contact.email = contactEmail;
  }
  return { draft };
}

const nameKey = (company: string, title: string) =>
  `${company.trim().toLowerCase()}\u0000${title.trim().toLowerCase()}`;

type Known = { at?: number; ref: NonNullable<ImportRow['duplicateOf']> };

/**
 * Finds what a new row would duplicate: a job with the same link (ignoring tracking parameters),
 * or the same company and title with dates within 3 days of each other (a row without a date
 * matches any date). Checks saved jobs and the rows before it in the same file.
 */
export function createDuplicateFinder(existing: readonly Job[]) {
  const byUrl = new Map<string, Known['ref']>();
  const byName = new Map<string, Known[]>();
  const remember = (url: string, company: string, title: string, known: Known) => {
    if (url) byUrl.set(normalizeUrl(url), known.ref);
    const key = nameKey(company, title);
    byName.set(key, [...(byName.get(key) ?? []), known]);
  };
  for (const job of existing) {
    remember(job.url, job.company, job.title, {
      at: firstAppliedAt(job) ?? job.createdAt,
      ref: { id: job.id, title: job.title, company: job.company },
    });
  }
  return {
    find(draft: ImportDraft): Known['ref'] | undefined {
      const url = draft.url ? byUrl.get(normalizeUrl(draft.url)) : undefined;
      if (url) return url;
      return byName
        .get(nameKey(draft.company, draft.title))
        ?.find(
          (k) =>
            draft.appliedAt === undefined ||
            k.at === undefined ||
            Math.abs(k.at - draft.appliedAt) <= DUPLICATE_WINDOW_MS,
        )?.ref;
    },
    add(draft: ImportDraft, row: number) {
      remember(draft.url, draft.company, draft.title, {
        at: draft.appliedAt,
        ref: { title: draft.title, company: draft.company, row },
      });
    },
  };
}

/** Lets the browser paint between chunks of a long file. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Sorts every row of the table into new, duplicate or error, for the preview. Works through the
 * rows in chunks of `chunkSize`, yielding between them, so a large file doesn't freeze the page.
 */
export async function reviewImport(
  table: CsvTable,
  options: ImportOptions,
  existing: readonly Job[],
  { chunkSize = 500 }: { chunkSize?: number } = {},
): Promise<ImportRow[]> {
  const duplicates = createDuplicateFinder(existing);
  const out: ImportRow[] = [];
  for (let index = 0; index < table.rows.length; index++) {
    if (index > 0 && index % chunkSize === 0) await nextTask();
    const result = rowToDraft(table.rows[index]!, table.headers, options);
    if ('problem' in result) {
      out.push({ index, kind: 'error', problem: result.problem });
      continue;
    }
    const match = duplicates.find(result.draft);
    if (match) {
      out.push({ index, kind: 'duplicate', draft: result.draft, duplicateOf: match });
    } else {
      duplicates.add(result.draft, index);
      out.push({ index, kind: 'new', draft: result.draft });
    }
  }
  return out;
}

/** Distinct raw status values in a column (by `statusKey`), with how often each appears. */
export function statusValues(
  table: CsvTable,
  column: number | undefined,
): { key: string; value: string; count: number }[] {
  if (column === undefined) return [];
  const found = new Map<string, { key: string; value: string; count: number }>();
  for (const row of table.rows) {
    const value = (row[column] ?? '').trim();
    const key = statusKey(value);
    if (!key) continue;
    const entry = found.get(key);
    if (entry) entry.count++;
    else found.set(key, { key, value, count: 1 });
  }
  return [...found.values()].sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------------------------
// Import history

export type ImportBatch = { id: string; importedAt: number; count: number; source?: string };

/** The imports whose jobs are still here (newest first), each with what undo would delete. */
export function importBatches(jobs: readonly Job[]): ImportBatch[] {
  const batches = new Map<string, ImportBatch & { sources: Map<string, number> }>();
  for (const job of jobs) {
    if (!job.importBatchId) continue;
    let batch = batches.get(job.importBatchId);
    if (!batch) {
      batch = {
        id: job.importBatchId,
        importedAt: job.importedAt ?? 0,
        count: 0,
        sources: new Map(),
      };
      batches.set(job.importBatchId, batch);
    }
    batch.count++;
    if (job.source) batch.sources.set(job.source, (batch.sources.get(job.source) ?? 0) + 1);
  }
  return [...batches.values()]
    .map(({ sources, ...batch }) => {
      const top = [...sources].sort((a, b) => b[1] - a[1])[0];
      return top ? { ...batch, source: top[0] } : batch;
    })
    .sort((a, b) => b.importedAt - a.importedAt);
}
