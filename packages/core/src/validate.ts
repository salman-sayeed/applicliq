import { JOB_STATUSES, type Job, type JobRecord, type JobStatus, type StatusChange } from './types';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isText = (v: unknown): v is string => typeof v === 'string';
const isStatus = (v: unknown): v is JobStatus => JOB_STATUSES.includes(v as JobStatus);

/**
 * Checks a record that came from outside this device (Drive, an imported file).
 * Returns a clean record, or undefined if it is unusable. Tombstones are reduced to
 * `{ id, deletedAt }`; a live job needs its required fields and a well-typed history.
 */
export function sanitizeRecord(value: unknown): JobRecord | undefined {
  if (!isObject(value) || !isText(value.id) || !value.id) return undefined;
  if (isTime(value.deletedAt)) return { id: value.id, deletedAt: value.deletedAt };
  if (value.deletedAt !== undefined && value.deletedAt !== null) return undefined;

  const { url, title, company, status, history, createdAt, updatedAt } = value;
  if (!isText(url) || !isText(title) || !isText(company) || !isStatus(status)) return undefined;
  if (!isTime(createdAt) || !isTime(updatedAt) || !Array.isArray(history)) return undefined;

  const job = { ...value } as Job;
  delete job.deletedAt;
  job.history = history.filter(
    (h): h is StatusChange => isObject(h) && isStatus(h.status) && isTime(h.at),
  );
  return job;
}

/** Sanitizes a list of untrusted records, reporting how many were dropped. */
export function sanitizeRecords(values: unknown[]): { records: JobRecord[]; skipped: number } {
  const records: JobRecord[] = [];
  for (const value of values) {
    const record = sanitizeRecord(value);
    if (record) records.push(record);
  }
  return { records, skipped: values.length - records.length };
}
