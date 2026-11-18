import type { Job, NewJob, SalaryPeriod, WorkType } from '@pocket-career/core';

/** The popup form's editable state (strings, so inputs can be empty). */
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
};

export function draftFrom(job: Partial<Job>, url: string): Draft {
  return {
    url: job.url ?? url,
    title: job.title ?? '',
    company: job.company ?? '',
    location: job.location ?? '',
    workType: job.workType ?? '',
    salaryMin: job.salary?.min?.toString() ?? '',
    salaryMax: job.salary?.max?.toString() ?? '',
    currency: job.salary?.currency ?? '',
    period: job.salary?.period ?? '',
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

/** Converts the form into the repository's input; empty optional fields are left out. */
export function toNewJob(draft: Draft): NewJob {
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
  if (draft.descriptionSnapshot) job.descriptionSnapshot = draft.descriptionSnapshot;
  if (min !== undefined || max !== undefined) {
    job.salary = { min: min ?? max, max: max ?? min };
    const currency = draft.currency.trim().toUpperCase();
    if (currency) job.salary.currency = currency;
    if (draft.period) job.salary.period = draft.period;
  }
  return job;
}
