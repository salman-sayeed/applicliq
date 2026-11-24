import { type CsvTable, parseCsvRows, readCsvTable } from './csv-parse';
import { type ColumnMapping, detectDateOrder, normalizeLabel } from './fields';
import type { ImportOptions } from './review';

/**
 * LinkedIn's data export ("Get a copy of your data") is a .zip of CSV files. Job applications
 * are in one (or, for long histories, several) of them, with the columns Application Date,
 * Contact Email, Contact Phone Number, Company Name, Job Title, Job Url, Resume Name and
 * Question And Answers. The file is found by those headers, not its name, which LinkedIn has
 * changed before.
 */

export const LINKEDIN_EXPORT_URL = 'https://www.linkedin.com/mypreferences/d/download-my-data';

/** The headers that identify the job applications file. */
const REQUIRED = ['application date', 'company name', 'job title'];

/** Also copied into the notes, when the file has them. */
const NOTE_HEADERS = ['contact phone number', 'question and answers'];

/** The LinkedIn source name, the same one jobs saved from linkedin.com get. */
export const LINKEDIN_SOURCE = 'linkedin';

export function isLinkedInApplicationsHeader(headers: readonly string[]): boolean {
  const names = new Set(headers.map(normalizeLabel));
  return REQUIRED.every((h) => names.has(h));
}

/** The header row among the first rows (LinkedIn sometimes puts notes above it), or -1. */
function findHeaderRow(text: string): number {
  const rows = parseCsvRows(text.slice(0, 16 * 1024), ',').slice(0, 10);
  return rows.findIndex((row) => isLinkedInApplicationsHeader(row));
}

/** The table, if this CSV text is a LinkedIn job applications file. */
export function readLinkedInCsv(text: string): CsvTable | undefined {
  const headerRow = findHeaderRow(text);
  return headerRow < 0 ? undefined : readCsvTable(text, { delimiter: ',', headerRow });
}

/** How the LinkedIn columns map to job fields; the rest of the useful ones go to the notes. */
export function linkedInImportOptions(table: CsvTable): ImportOptions {
  const names = table.headers.map(normalizeLabel);
  const column = (name: string) => {
    const i = names.indexOf(name);
    return i >= 0 ? i : undefined;
  };
  const mapping: ColumnMapping = {
    appliedAt: column('application date'),
    company: column('company name'),
    title: column('job title'),
    url: column('job url'),
    resumeVersion: column('resume name'),
    contactEmail: column('contact email'),
  };
  const dates =
    mapping.appliedAt === undefined ? [] : table.rows.map((r) => r[mapping.appliedAt!]!);
  return {
    mapping,
    // LinkedIn writes US-style dates ("1/15/24, 10:30 AM") unless the values say otherwise.
    dateOrder: detectDateOrder(dates) ?? 'mdy',
    defaultStatus: 'applied',
    defaultSource: LINKEDIN_SOURCE,
    noteColumns: NOTE_HEADERS.map(column).filter((c): c is number => c !== undefined),
  };
}

/** Puts several applications files (`Job Applications_1.csv`, ...) into one table. */
function combine(tables: CsvTable[]): CsvTable | undefined {
  const [first, ...rest] = tables;
  if (!first) return undefined;
  const names = first.headers.map(normalizeLabel);
  const rows = [...first.rows];
  for (const table of rest) {
    const order = names.map((name) => table.headers.map(normalizeLabel).indexOf(name));
    for (const row of table.rows) rows.push(order.map((i) => (i >= 0 ? (row[i] ?? '') : '')));
  }
  return { ...first, rows };
}

const decoder = () => new TextDecoder('utf-8');

/** Zip files start with "PK\x03\x04". */
export function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** CSVs bigger than this are skipped when searching a zip (messages, not applications). */
const MAX_CSV_BYTES = 30 * 1024 * 1024;

/**
 * Finds the job applications in a LinkedIn export: the .zip as downloaded, or the CSV taken out
 * of it. Returns undefined when there are none (exports without job activity lack the file).
 * The zip reader (fflate) is loaded only when a zip is dropped.
 */
export async function readLinkedInExport(bytes: Uint8Array): Promise<CsvTable | undefined> {
  if (!isZip(bytes)) return readLinkedInCsv(decoder().decode(bytes));
  const { unzipSync } = await import('fflate');
  const search = (pick: (name: string) => boolean) => {
    const files = unzipSync(bytes, {
      filter: (file) =>
        /\.csv$/i.test(file.name) && pick(file.name) && file.originalSize <= MAX_CSV_BYTES,
    });
    return Object.keys(files)
      .sort()
      .map((name) => readLinkedInCsv(decoder().decode(files[name]!)))
      .filter((t): t is CsvTable => t !== undefined);
  };
  // Files with "job" in their path are the likely ones; the rest only if none of those match.
  const likely = search((name) => /job/i.test(name));
  return combine(likely.length ? likely : search((name) => !/job/i.test(name)));
}
