export const JOB_STATUSES = [
  'saved',
  'applied',
  'assessment',
  'interview',
  'offer',
  'rejected',
  'ghosted',
  'withdrawn',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export type WorkType = 'remote' | 'hybrid' | 'onsite';

export type SalaryPeriod = 'hour' | 'month' | 'year';

export type Salary = {
  min?: number;
  max?: number;
  currency?: string;
  period?: SalaryPeriod;
};

export type StatusChange = { status: JobStatus; at: number };

export type Job = {
  id: string;
  url: string;
  title: string;
  company: string;
  location?: string;
  workType?: WorkType;
  salary?: Salary;
  source?: string;
  status: JobStatus;
  history: StatusChange[];
  notes?: string;
  tags?: string[];
  resumeVersion?: string;
  contact?: { name?: string; email?: string };
  interviewAt?: number;
  followUpAt?: number;
  descriptionSnapshot?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
};

/**
 * A deleted job. Only the id and the deletion time are kept so the deletion can
 * propagate through sync. Tombstones are hidden from the UI and purged after
 * {@link TOMBSTONE_TTL_MS}.
 */
export type JobTombstone = { id: string; deletedAt: number };

/** What is actually stored locally and in Drive. */
export type JobRecord = Job | JobTombstone;

export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function isTombstone(record: JobRecord): record is JobTombstone {
  return record.deletedAt !== undefined;
}

export function isLiveJob(record: JobRecord): record is Job {
  return record.deletedAt === undefined;
}

/** Timestamp used to decide which version of a record wins a merge. */
export function recordTimestamp(record: JobRecord): number {
  return isTombstone(record) ? record.deletedAt : record.updatedAt;
}

export type Theme = 'system' | 'light' | 'dark';

/** Application targets; 0 turns a goal off. */
export type Goals = {
  daily: number;
  weekly: number;
  monthly: number;
};

/** Local-only app preferences (one row in the `settings` table). */
export type Settings = {
  goals: Goals;
  /** An `applied` job with no update for this many days is suggested as ghosted. */
  ghostedAfterDays: number;
  theme: Theme;
};

export type SettingsPatch = Partial<Omit<Settings, 'goals'>> & { goals?: Partial<Goals> };

export const DEFAULT_SETTINGS: Settings = {
  goals: { daily: 2, weekly: 10, monthly: 40 },
  ghostedAfterDays: 30,
  theme: 'system',
};
