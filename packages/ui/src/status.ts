import type { JobStatus, SalaryPeriod, WorkType } from '@pocket-career/core';

export const STATUS_LABELS: Record<JobStatus, string> = {
  saved: 'Saved',
  applied: 'Applied',
  assessment: 'Assessment',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  ghosted: 'Ghosted',
  withdrawn: 'Withdrawn',
};

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
};

export const PERIOD_LABELS: Record<SalaryPeriod, string> = {
  hour: 'per hour',
  month: 'per month',
  year: 'per year',
};

/** Full class names so Tailwind can detect them. */
export const STATUS_DOT: Record<JobStatus, string> = {
  saved: 'bg-status-saved',
  applied: 'bg-status-applied',
  assessment: 'bg-status-assessment',
  interview: 'bg-status-interview',
  offer: 'bg-status-offer',
  rejected: 'bg-status-rejected',
  ghosted: 'bg-status-ghosted',
  withdrawn: 'bg-status-withdrawn',
};
