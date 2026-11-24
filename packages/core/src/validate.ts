import {
  JOB_STATUSES,
  type Job,
  type JobRecord,
  type JobStatus,
  type Offer,
  type StatusChange,
} from './types';

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
  if (job.importedAt !== undefined && !isTime(job.importedAt)) delete job.importedAt;
  if (job.importBatchId !== undefined && !isText(job.importBatchId)) delete job.importBatchId;
  if (job.alternateUrls !== undefined) {
    const urls = Array.isArray(job.alternateUrls)
      ? [...new Set(job.alternateUrls.filter((u) => isText(u) && u.trim()))]
      : [];
    if (urls.length) job.alternateUrls = urls.slice(0, 20);
    else delete job.alternateUrls;
  }
  if (job.offer !== undefined) {
    const offer = sanitizeOffer(job.offer);
    if (offer) job.offer = offer;
    else delete job.offer;
  }
  job.history = history.filter(
    (h): h is StatusChange => isObject(h) && isStatus(h.status) && isTime(h.at),
  );
  return job;
}

const MAX_TEXT = 2000;

/** A clean offer from untrusted input; undefined when nothing usable is left. */
export function sanitizeOffer(value: unknown): Offer | undefined {
  if (!isObject(value)) return undefined;
  const offer: Offer = {};
  const text = (v: unknown) => (isText(v) && v.trim() ? v.trim().slice(0, MAX_TEXT) : undefined);
  if (isTime(value.base) && value.base >= 0) offer.base = value.base;
  if (isText(value.currency) && /^[A-Za-z]{3}$/.test(value.currency.trim())) {
    offer.currency = value.currency.trim().toUpperCase();
  }
  if (value.period === 'month' || value.period === 'year') offer.period = value.period;
  for (const key of ['bonus', 'equity', 'pros', 'cons'] as const) {
    const t = text(value[key]);
    if (t) offer[key] = t;
  }
  if (Array.isArray(value.benefits)) {
    const benefits = value.benefits.map(text).filter((b): b is string => !!b);
    if (benefits.length) offer.benefits = benefits.slice(0, 50);
  }
  if (isTime(value.startDate)) offer.startDate = value.startDate;
  if (isTime(value.deadline)) offer.deadline = value.deadline;
  return Object.keys(offer).length ? offer : undefined;
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
