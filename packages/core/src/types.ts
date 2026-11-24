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

/** Offer pay is compared per month and per year only. */
export type OfferPeriod = 'month' | 'year';

/** The details of an offer (Smart helpers → Offer comparison). */
export type Offer = {
  /** Base pay, per `period`. */
  base?: number;
  /** ISO 4217 code. */
  currency?: string;
  period?: OfferPeriod;
  bonus?: string;
  equity?: string;
  benefits?: string[];
  startDate?: number;
  /** When the offer must be answered; a reminder comes a day before. */
  deadline?: number;
  pros?: string;
  cons?: string;
};

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
  /** The resume sent for this job (`Resume.id`). */
  resumeId?: string;
  /**
   * Free-text resume label from before resumes existed (and from imports). Kept as a label; when
   * a resume of the same name exists, the job is linked to it instead (`linkResumeLabels`).
   */
  resumeVersion?: string;
  contact?: { name?: string; email?: string };
  interviewAt?: number;
  followUpAt?: number;
  descriptionSnapshot?: string;
  /**
   * Other postings of the same job (e.g. the company's own site and LinkedIn), kept when two
   * saved jobs were merged. `getJobByUrl` matches these too.
   */
  alternateUrls?: string[];
  offer?: Offer;
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

/**
 * A resume the user pasted (Settings → Resumes), for Resume match. Stored locally; synced to
 * Drive only when `settings.resumes.sync` says so. Deleting one leaves a tombstone, as for jobs.
 */
export type Resume = {
  id: string;
  name: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: undefined;
};

export type ResumeTombstone = { id: string; deletedAt: number };

export type ResumeRecord = Resume | ResumeTombstone;

export function isLiveResume(record: ResumeRecord): record is Resume {
  return record.deletedAt === undefined;
}
