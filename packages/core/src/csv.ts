import type { Job, JobStatus } from './types';

/** One CSV field: quoted when it holds a comma, quote or line break (RFC 4180). */
function field(value: unknown): string {
  if (value === undefined || value === null) return '';
  let text = String(value);
  // Spreadsheet apps run cells starting with these as formulas; a leading quote defuses them.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const iso = (ms: number | undefined) => (ms === undefined ? '' : new Date(ms).toISOString());

const COLUMNS: [string, (job: Job, label: (s: JobStatus) => string) => unknown][] = [
  ['Title', (j) => j.title],
  ['Company', (j) => j.company],
  ['Status', (j, label) => label(j.status)],
  ['URL', (j) => j.url],
  ['Location', (j) => j.location],
  ['Work type', (j) => j.workType],
  ['Salary min', (j) => j.salary?.min],
  ['Salary max', (j) => j.salary?.max],
  ['Currency', (j) => j.salary?.currency],
  ['Salary period', (j) => j.salary?.period],
  ['Source', (j) => j.source],
  ['Tags', (j) => j.tags?.join('; ')],
  ['Resume version', (j) => j.resumeVersion],
  ['Contact name', (j) => j.contact?.name],
  ['Contact email', (j) => j.contact?.email],
  ['Interview', (j) => iso(j.interviewAt)],
  ['Follow up', (j) => iso(j.followUpAt)],
  ['Notes', (j) => j.notes],
  ['Created', (j) => iso(j.createdAt)],
  ['Updated', (j) => iso(j.updatedAt)],
];

/**
 * A spreadsheet-friendly export of live jobs (one row each). Read-only: the JSON export is the
 * backup format. `statusLabel` writes statuses as the user named them.
 */
export function jobsToCsv(
  jobs: readonly Job[],
  statusLabel: (status: JobStatus) => string = (s) => s,
): string {
  const rows = [COLUMNS.map(([name]) => name)];
  for (const job of jobs) rows.push(COLUMNS.map(([, get]) => field(get(job, statusLabel))));
  return `${rows.map((row) => row.join(',')).join('\r\n')}\r\n`;
}
