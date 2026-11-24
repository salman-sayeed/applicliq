import { JOB_STATUSES, type JobStatus } from '../types';

/** The job fields a CSV column can fill. */
export const IMPORT_FIELDS = [
  'title',
  'company',
  'url',
  'location',
  'status',
  'appliedAt',
  'salary',
  'source',
  'notes',
  'tags',
  'resumeVersion',
  'contactName',
  'contactEmail',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  title: 'Job title',
  company: 'Company',
  url: 'Job link',
  location: 'Location',
  status: 'Status',
  appliedAt: 'Date applied',
  salary: 'Salary',
  source: 'Source',
  notes: 'Notes',
  tags: 'Tags',
  resumeVersion: 'Resume',
  contactName: 'Contact name',
  contactEmail: 'Contact email',
};

/** Which column (index) fills each field; a missing field is left empty. */
export type ColumnMapping = Partial<Record<ImportField, number>>;

/** Lowercase words only: "Date_Applied (UTC)" → "date applied utc". */
export function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Header names per field. `exact` names win; `words` match a header containing that word (or
 * phrase) at a word start, e.g. "Company Name" for `company`.
 */
const GUESSES: Record<ImportField, { exact: string[]; words: string[] }> = {
  title: {
    exact: ['title', 'job title', 'job', 'position', 'role', 'job name', 'position title', 'name'],
    words: ['title', 'position', 'role'],
  },
  company: {
    exact: ['company', 'company name', 'employer', 'organization', 'organisation', 'org'],
    words: ['company', 'employer', 'organi'],
  },
  url: {
    exact: ['url', 'link', 'job url', 'job link', 'posting', 'posting url', 'job posting'],
    words: ['url', 'link', 'website'],
  },
  location: {
    exact: ['location', 'city', 'place', 'job location'],
    words: ['location', 'city'],
  },
  status: {
    exact: ['status', 'stage', 'state', 'application status', 'pipeline', 'list'],
    words: ['status', 'stage'],
  },
  appliedAt: {
    exact: ['date applied', 'applied date', 'application date', 'applied on', 'applied', 'date'],
    words: ['applied', 'application date', 'date'],
  },
  salary: {
    exact: ['salary', 'compensation', 'pay', 'salary range', 'wage', 'pay range'],
    words: ['salary', 'compensation', 'pay'],
  },
  source: {
    exact: ['source', 'job board', 'board', 'platform', 'site', 'found on', 'found via', 'via'],
    words: ['source', 'board', 'platform'],
  },
  notes: {
    exact: ['notes', 'note', 'comments', 'comment', 'details', 'remarks'],
    words: ['note', 'comment', 'remark'],
  },
  tags: {
    exact: ['tags', 'tag', 'labels', 'label', 'categories', 'category'],
    words: ['tag', 'label'],
  },
  resumeVersion: {
    exact: ['resume', 'resume name', 'resume version', 'cv', 'cv version'],
    words: ['resume', 'cv'],
  },
  contactName: {
    exact: ['contact', 'contact name', 'recruiter', 'recruiter name', 'hiring manager'],
    words: ['recruiter', 'contact name'],
  },
  contactEmail: {
    exact: ['email', 'contact email', 'recruiter email', 'e mail'],
    words: ['email'],
  },
};

/**
 * Guesses which column fills which field from the header names. Each column fills at most one
 * field; exact names beat partial ones, and fields earlier in `IMPORT_FIELDS` win ties.
 */
export function guessMapping(headers: readonly string[]): ColumnMapping {
  const names = headers.map(normalizeLabel);
  const candidates: { field: ImportField; column: number; score: number }[] = [];
  IMPORT_FIELDS.forEach((field, fieldIndex) => {
    const { exact, words } = GUESSES[field];
    names.forEach((name, column) => {
      if (!name) return;
      const exactAt = exact.indexOf(name);
      let score = 0;
      if (exactAt >= 0) score = 100 - exactAt;
      else if (words.some((w) => ` ${name}`.includes(` ${w}`))) score = 10;
      // Ties: earlier fields first, then earlier columns.
      if (score) candidates.push({ field, column, score: score - fieldIndex / 100 });
    });
  });
  candidates.sort((a, b) => b.score - a.score || a.column - b.column);
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  for (const { field, column } of candidates) {
    if (mapping[field] !== undefined || used.has(column)) continue;
    mapping[field] = column;
    used.add(column);
  }
  return mapping;
}

// ---------------------------------------------------------------------------------------------
// Status values

/** Checked in order: the first pattern that matches decides. */
const STATUS_PATTERNS: [RegExp, JobStatus][] = [
  [/\b(no offer|not (selected|moving|successful)|unsuccessful|reject|declined|denied)/, 'rejected'],
  [/\b(not interested|withdr|retract|cancel|archiv)/, 'withdrawn'],
  [/\b(not (yet )?applied|to apply|not started|todo|to do)\b/, 'saved'],
  [/\b(offer|accepted|hired)/, 'offer'],
  [/\b(ghost|no (response|reply|answer)|unresponsive|silent)/, 'ghosted'],
  [/\b(interview|screen|onsite|on site|final round|phone|call)/, 'interview'],
  [/\b(assess|test|take ?home|challenge|assignment|exercise|case study|quiz|coding)/, 'assessment'],
  [/\b(appl|submitted|sent|pending|waiting|under review|in review|in progress)/, 'applied'],
  [/\b(sav|wish|bookmark|interest|draft|plan|prospect|lead|backlog|consider)/, 'saved'],
];

/**
 * The status a value like "Interviewing" or "Not selected" means, or undefined if it isn't
 * recognised. `labels` are the user's own status names (Settings → Statuses), matched first.
 */
export function guessStatus(
  value: string,
  labels: Partial<Record<JobStatus, string>> = {},
): JobStatus | undefined {
  const text = normalizeLabel(value);
  if (!text) return undefined;
  for (const status of JOB_STATUSES) {
    if (text === status || text === normalizeLabel(labels[status] ?? '')) return status;
  }
  return STATUS_PATTERNS.find(([pattern]) => pattern.test(text))?.[1];
}

/** The key a raw status value is mapped under (case and spacing don't matter). */
export const statusKey = (value: string): string => normalizeLabel(value);

// ---------------------------------------------------------------------------------------------
// Dates

/** How to read numeric dates like 03/04/2024: day first or month first. */
export type DateOrder = 'dmy' | 'mdy';

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(am|pm)?$/;
const NUMERIC = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/;
const ISO = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})$/i;

function year(text: string): number {
  const n = Number(text);
  return text.length <= 2 ? 2000 + n : n;
}

/** A local date, or undefined when the parts don't make a real day (e.g. 31 February). */
function makeDate(y: number, m: number, d: number, time = [0, 0, 0]): number | undefined {
  if (y < 1970 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const date = new Date(y, m - 1, d, time[0], time[1], time[2]);
  return date.getMonth() === m - 1 && date.getDate() === d ? date.getTime() : undefined;
}

function parseTime(text: string): number[] | undefined {
  if (!text) return [0, 0, 0];
  const m = TIME.exec(text.toLowerCase());
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3] ?? 0);
  if (m[4]) {
    if (h < 1 || h > 12) return undefined;
    h = (h % 12) + (m[4] === 'pm' ? 12 : 0);
  }
  return h < 24 && min < 60 && s < 60 ? [h, min, s] : undefined;
}

function monthIndex(word: string): number | undefined {
  const i = MONTHS.indexOf(word.slice(0, 3).toLowerCase() as (typeof MONTHS)[number]);
  return i >= 0 && (word.length === 3 || /^[a-z]+\.?$/i.test(word)) ? i + 1 : undefined;
}

/** Splits "1/15/24, 10:30 AM" into its date and time parts. */
function splitDateTime(text: string): [string, string] {
  const m = /^(.*?)(?:[,\sT]+(\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:[ap]m)?))?$/i.exec(text);
  return [m?.[1]?.trim() ?? text, m?.[2] ?? ''];
}

/**
 * Reads a date from a spreadsheet cell: ISO (`2024-01-15`, with or without time and zone),
 * numeric (`15/01/2024`, `1/15/24, 10:30 AM`, `15.01.2024`; `order` decides day vs month when both
 * could be either) and written months (`Jan 15, 2024`, `15 January 2024`, `Mon, Jan 15 2024`).
 *
 * Returns undefined for an empty cell and null for one it can't read, so the row can be flagged
 * rather than guessed.
 */
export function parseImportDate(value: string, order: DateOrder): number | null | undefined {
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text) return undefined;
  if (ISO.test(text)) {
    const ms = Date.parse(text.replace(' ', 'T'));
    return Number.isNaN(ms) ? null : ms;
  }
  const [datePart, timePart] = splitDateTime(text);
  const time = parseTime(timePart);
  if (!time) return null;

  const numeric = NUMERIC.exec(datePart);
  if (numeric) {
    const [a, b, c] = [numeric[1]!, numeric[2]!, numeric[3]!];
    if (a.length === 4) return makeDate(Number(a), Number(b), Number(c), time) ?? null;
    if (c.length !== 4 && c.length !== 2) return null;
    const [x, y] = [Number(a), Number(b)];
    // A part over 12 can only be the day; otherwise the order decides.
    const dayFirst = x > 12 ? true : y > 12 ? false : order === 'dmy';
    const [d, m] = dayFirst ? [x, y] : [y, x];
    return makeDate(year(c), m, d, time) ?? null;
  }

  // Written months. The weekday, commas and "of" are noise.
  const words = datePart
    .replace(/,/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w && !/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?$/i.test(w) && w !== 'of');
  if (words.length !== 3) return null;
  const monthAt = words.findIndex((w) => /^[a-z]/i.test(w));
  const month = monthAt >= 0 ? monthIndex(words[monthAt]!) : undefined;
  if (!month) return null;
  const numbers = words
    .filter((_, i) => i !== monthAt)
    .map((w) => w.replace(/(st|nd|rd|th)$/i, ''));
  if (!numbers.every((n) => /^\d+$/.test(n))) return null;
  const [first, second] = numbers as [string, string];
  // "2024 Jan 15" / "Jan 15 2024" / "15 Jan 2024"
  const [d, y] = first.length === 4 ? [second, first] : [first, second];
  if (y.length !== 4 && y.length !== 2) return null;
  return makeDate(year(y), month, Number(d), time) ?? null;
}

/**
 * Works out the order of numeric dates in a column: a first part over 12 means day first, a
 * second part over 12 means month first. Undefined when every date could be read either way
 * (the user picks) or when there are no numeric dates.
 */
export function detectDateOrder(values: readonly string[]): DateOrder | undefined {
  let dmy = 0;
  let mdy = 0;
  for (const value of values) {
    const m = NUMERIC.exec(splitDateTime(value.trim())[0]);
    if (!m || m[1]!.length === 4) continue;
    if (Number(m[1]) > 12) dmy++;
    else if (Number(m[2]) > 12) mdy++;
  }
  if (dmy === mdy) return undefined;
  return dmy > mdy ? 'dmy' : 'mdy';
}

/** Whether a column has numeric dates whose order can't be told from the values. */
export function hasAmbiguousDates(values: readonly string[]): boolean {
  return (
    detectDateOrder(values) === undefined &&
    values.some((v) => {
      const m = NUMERIC.exec(splitDateTime(v.trim())[0]);
      return !!m && m[1]!.length !== 4;
    })
  );
}
