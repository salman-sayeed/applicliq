import { JOB_STATUSES, type Job, type JobStatus, type WorkType } from './types';

export type JobFilter = {
  /** Free text; every word must appear somewhere in the job. */
  query?: string;
  status?: JobStatus;
  tag?: string;
  source?: string;
  workType?: WorkType;
};

export type JobSortKey =
  'updatedAt' | 'createdAt' | 'title' | 'company' | 'status' | 'interviewAt' | 'salary';

export type SortDirection = 'asc' | 'desc';

function searchText(job: Job): string {
  return [
    job.title,
    job.company,
    job.location,
    job.source,
    job.notes,
    job.resumeVersion,
    job.contact?.name,
    job.contact?.email,
    ...(job.tags ?? []),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

export function matchesFilter(job: Job, filter: JobFilter): boolean {
  if (filter.status && job.status !== filter.status) return false;
  if (filter.workType && job.workType !== filter.workType) return false;
  if (filter.source && job.source !== filter.source) return false;
  if (filter.tag) {
    const tag = filter.tag.toLowerCase();
    if (!job.tags?.some((t) => t.toLowerCase() === tag)) return false;
  }
  const words = filter.query?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  if (words.length) {
    const text = searchText(job);
    if (!words.every((w) => text.includes(w))) return false;
  }
  return true;
}

export function filterJobs(jobs: readonly Job[], filter: JobFilter): Job[] {
  return jobs.filter((job) => matchesFilter(job, filter));
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function sortValue(job: Job, key: JobSortKey): string | number | undefined {
  switch (key) {
    case 'title':
    case 'company':
      return job[key];
    case 'status':
      return JOB_STATUSES.indexOf(job.status);
    case 'salary':
      return job.salary?.max ?? job.salary?.min;
    default:
      return job[key];
  }
}

/**
 * Sorted copy. Missing values (no interview date, no salary) always go last, whatever the
 * direction; ties keep the most recently updated first.
 */
export function sortJobs(jobs: readonly Job[], key: JobSortKey, direction: SortDirection): Job[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...jobs].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === undefined || vb === undefined) {
      if (va !== vb) return va === undefined ? 1 : -1;
    } else {
      const order =
        typeof va === 'string' && typeof vb === 'string'
          ? collator.compare(va, vb)
          : (va as number) - (vb as number);
      if (order !== 0) return order * sign;
    }
    return b.updatedAt - a.updatedAt;
  });
}

/** Unique ignoring case (the first spelling wins), sorted. */
function uniqueSorted(values: (string | undefined)[]): string[] {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed && !byKey.has(trimmed.toLowerCase())) byKey.set(trimmed.toLowerCase(), trimmed);
  }
  return [...byKey.values()].sort(collator.compare);
}

/** Values present in the data, for filter menus and suggestions. */
export function jobFacets(jobs: readonly Job[]): {
  tags: string[];
  sources: string[];
  resumeVersions: string[];
} {
  return {
    tags: uniqueSorted(jobs.flatMap((j) => j.tags ?? [])),
    sources: uniqueSorted(jobs.map((j) => j.source)),
    resumeVersions: uniqueSorted(jobs.map((j) => j.resumeVersion)),
  };
}
