import { daysSince, lastAppliedAt } from '../history';
import type { Job, Salary } from '../types';
import { normalizeCompany } from './duplicates';

/** What the posting itself says about its dates (JSON-LD or a site adapter). */
export type PostingDates = {
  /** When it was posted, epoch ms. */
  datePosted?: number;
  /** When applications close, epoch ms. */
  validThrough?: number;
};

export type RedFlagKind = 'old-posting' | 'possibly-closed' | 'no-salary' | 'applied-before';

export type RedFlag = {
  kind: RedFlagKind;
  /** Short, neutral wording for the "Heads up" row. */
  text: string;
  /** For `applied-before`: the earlier job, to link to. */
  jobId?: string;
};

export type RedFlagInput = {
  posting?: PostingDates;
  /** The job on the page as the form or the saved job has it. */
  job: { company?: string; salary?: Salary; id?: string };
  /** Saved jobs, to find earlier applications at the same company. */
  jobs?: readonly Job[];
  oldPostingDays: number;
  appliedBeforeDays: number;
  /** Whether the page was read (no-salary is only said about a page that was). */
  pageRead?: boolean;
  now?: number;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "45 days", "3 months". */
function age(days: number): string {
  return days < 60 ? plural(days, 'day') : plural(Math.floor(days / 30), 'month');
}

/**
 * The "Heads up" notes for a job page. A note is only given when the data is known: no posting
 * date, no note about its age.
 */
export function redFlags({
  posting,
  job,
  jobs = [],
  oldPostingDays,
  appliedBeforeDays,
  pageRead = true,
  now = Date.now(),
}: RedFlagInput): RedFlag[] {
  const flags: RedFlag[] = [];

  if (posting?.validThrough !== undefined && posting.validThrough < now) {
    flags.push({ kind: 'possibly-closed', text: 'The posting’s closing date has passed' });
  } else if (posting?.datePosted !== undefined && posting.datePosted <= now) {
    const days = daysSince(posting.datePosted, now);
    if (days >= oldPostingDays)
      flags.push({ kind: 'old-posting', text: `Posted ${age(days)} ago` });
  }

  const salary = job.salary;
  if (pageRead && salary?.min === undefined && salary?.max === undefined) {
    flags.push({ kind: 'no-salary', text: 'No salary listed' });
  }

  const company = normalizeCompany(job.company ?? '');
  if (company) {
    let best: { job: Job; at: number } | undefined;
    for (const other of jobs) {
      if (other.id === job.id || normalizeCompany(other.company) !== company) continue;
      const at = lastAppliedAt(other);
      if (
        at !== undefined &&
        now - at <= appliedBeforeDays * 86_400_000 &&
        (!best || at > best.at)
      ) {
        best = { job: other, at };
      }
    }
    if (best) {
      const days = daysSince(best.at, now);
      flags.push({
        kind: 'applied-before',
        text: `You applied here ${days === 0 ? 'today' : `${age(days)} ago`}`,
        jobId: best.job.id,
      });
    }
  }
  return flags;
}

/**
 * A date from a posting: ISO 8601 (`2026-03-01`, `2026-03-01T10:00:00Z`) or epoch ms/seconds.
 * Date-only values are local midnight. Undefined for anything else or an absurd year.
 */
export function parsePostingDate(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e11 ? value * 1000 : value;
    return sane(ms);
  }
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnly) {
    const [, y, m, d] = dateOnly.map(Number) as [number, number, number, number];
    return sane(new Date(y, m - 1, d).getTime());
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) return undefined;
  return sane(Date.parse(text));
}

function sane(ms: number): number | undefined {
  if (!Number.isFinite(ms)) return undefined;
  const year = new Date(ms).getFullYear();
  return year >= 1990 && year <= 2200 ? ms : undefined;
}

const UNIT_DAYS: Record<string, number> = {
  minute: 0,
  hour: 0,
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

/**
 * "Posted 3 days ago", "2 weeks ago", "Reposted 1 month ago", "today", "30+ days ago" →
 * when it was posted (start of that many days back). Undefined when no age is found.
 */
export function parseRelativePosted(text: string | undefined, now: number = Date.now()) {
  if (!text) return undefined;
  const lower = text.toLowerCase();
  if (/\b(just now|today|just posted)\b/.test(lower)) return now;
  if (/\byesterday\b/.test(lower)) return now - 86_400_000;
  const match = /(\d+)\+?\s*(minute|min|hour|hr|day|week|wk|month|mo|year|yr)s?\s+ago/.exec(lower);
  if (!match) return undefined;
  const unit =
    { min: 'minute', hr: 'hour', wk: 'week', mo: 'month', yr: 'year' }[match[2]!] ?? match[2]!;
  const days = Number(match[1]) * (UNIT_DAYS[unit] ?? 0);
  return now - days * 86_400_000;
}
