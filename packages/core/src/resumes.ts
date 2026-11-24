import type { Settings } from './settings';
import { isFeatureEnabled } from './features';
import { type Job, type Resume, type ResumeRecord, isLiveJob, type JobRecord } from './types';

/** Longest resume kept (characters); a pasted resume is a few thousand. */
export const MAX_RESUME_TEXT = 100_000;
export const MAX_RESUME_NAME = 60;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Checks a resume record from outside this device (Drive, a backup file). Returns a clean
 * record, or undefined when it is unusable. Tombstones are reduced to `{ id, deletedAt }`.
 */
export function sanitizeResumeRecord(value: unknown): ResumeRecord | undefined {
  if (!isObject(value) || typeof value.id !== 'string' || !value.id) return undefined;
  if (isTime(value.deletedAt)) return { id: value.id, deletedAt: value.deletedAt };
  if (value.deletedAt !== undefined && value.deletedAt !== null) return undefined;
  const { name, text, createdAt, updatedAt } = value;
  if (typeof name !== 'string' || typeof text !== 'string') return undefined;
  if (!isTime(createdAt) || !isTime(updatedAt)) return undefined;
  return {
    id: value.id,
    name: name.trim().slice(0, MAX_RESUME_NAME) || 'Resume',
    text: text.slice(0, MAX_RESUME_TEXT),
    createdAt,
    updatedAt,
  };
}

/** Sanitizes a list of untrusted resume records; malformed ones are dropped. */
export function sanitizeResumeRecords(values: unknown): ResumeRecord[] {
  if (!Array.isArray(values)) return [];
  return values.map(sanitizeResumeRecord).filter((r): r is ResumeRecord => r !== undefined);
}

/** Words in a resume, as shown in Settings → Resumes. */
export function wordCount(text: string): number {
  return text.match(/\S+/g)?.length ?? 0;
}

/**
 * Whether resumes go to Google Drive: the user's choice, or by default only when encrypted sync
 * is on (resume text is personal; plain Drive files are readable by anyone with the account).
 */
export function resumeSyncEnabled(settings: Pick<Settings, 'resumes' | 'features'>): boolean {
  return settings.resumes.sync ?? isFeatureEnabled(settings, 'encryptedSync');
}

const sameName = (a: string, b: string) =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/**
 * The resume a job's old free-text label names, if one exists (case-insensitive). The newest
 * wins when two have the same name.
 */
export function resumeForLabel(label: string, resumes: readonly Resume[]): Resume | undefined {
  if (!label.trim()) return undefined;
  return resumes
    .filter((r) => sameName(r.name, label))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

/**
 * The migration from `Job.resumeVersion` (free text) to `Job.resumeId`: jobs whose label names
 * a resume get linked to it and lose the label; the others keep it, shown as a label. Returns
 * only the jobs that change.
 */
export function linkResumeLabels(
  records: readonly JobRecord[],
  resumes: readonly Resume[],
): { job: Job; resumeId: string }[] {
  const out: { job: Job; resumeId: string }[] = [];
  for (const record of records) {
    if (!isLiveJob(record) || record.resumeId || !record.resumeVersion) continue;
    const resume = resumeForLabel(record.resumeVersion, resumes);
    if (resume) out.push({ job: record, resumeId: resume.id });
  }
  return out;
}

/**
 * The resume to compare a job with: the one linked to the job, then the default, then the most
 * recently updated.
 */
export function pickResume(
  resumes: readonly Resume[],
  { jobResumeId, defaultId }: { jobResumeId?: string; defaultId?: string } = {},
): Resume | undefined {
  return (
    resumes.find((r) => r.id === jobResumeId) ??
    resumes.find((r) => r.id === defaultId) ??
    [...resumes].sort((a, b) => b.updatedAt - a.updatedAt)[0]
  );
}

/** A copy's name: "Frontend (copy)", "Frontend (copy 2)"… unused among `resumes`. */
export function copyName(name: string, resumes: readonly Resume[]): string {
  const base = name.replace(/ \(copy(?: \d+)?\)$/, '');
  for (let n = 1; ; n++) {
    const candidate = `${base} (copy${n === 1 ? '' : ` ${n}`})`.slice(0, MAX_RESUME_NAME);
    if (!resumes.some((r) => sameName(r.name, candidate))) return candidate;
  }
}
