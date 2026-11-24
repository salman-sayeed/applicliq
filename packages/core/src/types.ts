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
  /**
   * Set on jobs brought in by an import (LinkedIn, CSV): when it ran. Imported applications count
   * toward stats but not toward goals or streaks, and the ghosting clock starts here.
   */
  importedAt?: number;
  /** The import that created the job; undoing that import deletes the batch. */
  importBatchId?: string;
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
