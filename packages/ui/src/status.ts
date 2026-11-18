import type { AccentColor, JobStatus, SalaryPeriod, TagColor, WorkType } from '@pocket-career/core';

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

/** Tag chip colours (full class names for Tailwind). */
export const TAG_CLASSES: Record<TagColor, string> = {
  gray: 'bg-surface-muted text-ink-muted',
  red: 'bg-red-500/15 text-red-700 dark:text-red-300',
  orange: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  amber: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  green: 'bg-green-500/15 text-green-700 dark:text-green-300',
  teal: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  blue: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  pink: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
};

/** Swatches for the colour pickers. */
export const TAG_SWATCH: Record<TagColor, string> = {
  gray: 'bg-zinc-400',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  green: 'bg-green-500',
  teal: 'bg-teal-500',
  blue: 'bg-blue-500',
  violet: 'bg-violet-500',
  pink: 'bg-pink-500',
};

export const ACCENT_SWATCH: Record<AccentColor, string> = {
  indigo: '#4f46e5',
  blue: '#2563eb',
  teal: '#0f766e',
  green: '#15803d',
  amber: '#b45309',
  rose: '#e11d48',
};
