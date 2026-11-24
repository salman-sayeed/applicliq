/**
 * A small RFC 4180 CSV reader for imports: quoted fields (with `""` escapes and line breaks),
 * CRLF / LF / CR line ends, a UTF-8 BOM, empty lines. The delimiter and the header row are
 * detected, since spreadsheets export with `,`, `;` (European Excel) or tabs, and some put a
 * title or notes above the header.
 */

export const CSV_DELIMITERS = [',', ';', '\t', '|'] as const;
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

/** A parsed file: named columns and the rows under them (each padded to the header's width). */
export type CsvTable = {
  headers: string[];
  rows: string[][];
  delimiter: CsvDelimiter;
  /** 1-based number of the header row (empty lines not counted); data rows follow it. */
  headerLine: number;
};

/** Parses CSV text into rows of trimmed cells; lines with only empty cells are dropped. */
export function parseCsvRows(text: string, delimiter: CsvDelimiter = ','): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  /** The current cell started with a quote (so its content is taken literally). */
  let wasQuoted = false;

  const endCell = () => {
    row.push(wasQuoted ? cell : cell.trim());
    cell = '';
    wasQuoted = false;
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      wasQuoted = true;
      cell = '';
    } else if (ch === delimiter) {
      endCell();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      endRow();
    } else if (!wasQuoted) {
      cell += ch;
    }
    // Text after a closing quote ("a"b) is dropped, like most spreadsheet apps do.
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

/** The first `maxChars` of the text, cut at a line end so no row is split. */
function sample(text: string, maxChars = 64 * 1024): string {
  if (text.length <= maxChars) return text;
  const cut = text.lastIndexOf('\n', maxChars);
  return text.slice(0, cut > 0 ? cut : maxChars);
}

/**
 * Picks the delimiter that splits the first rows into the most columns, consistently. Ties go to
 * the comma.
 */
export function detectDelimiter(text: string): CsvDelimiter {
  const head = sample(text);
  let best: CsvDelimiter = ',';
  let bestScore = 0;
  for (const delimiter of CSV_DELIMITERS) {
    const rows = parseCsvRows(head, delimiter).slice(0, 30);
    if (rows.length === 0) continue;
    const widths = new Map<number, number>();
    for (const r of rows) widths.set(r.length, (widths.get(r.length) ?? 0) + 1);
    // The most common width, and how many rows have it.
    const [width, count] = [...widths].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]!;
    if (width < 2) continue;
    const score = (count / rows.length) * Math.log2(width + 1);
    if (score > bestScore + 1e-9) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

const looksLikeData = (cell: string) =>
  /^[\d\s.,:/$€£%+-]+$/.test(cell) || /^https?:\/\//i.test(cell);

/**
 * The header row: the first of the opening rows that is about as wide as the table and holds
 * distinct labels rather than numbers, dates or links. Skips a title line or notes above it.
 */
export function detectHeaderRow(rows: string[][]): number {
  const width = Math.max(0, ...rows.slice(0, 50).map((r) => r.filter((c) => c !== '').length));
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = rows[i]!.filter((c) => c !== '');
    if (cells.length < Math.max(2, Math.ceil(width * 0.6))) continue;
    const labels = cells.filter((c) => !looksLikeData(c) && c.length <= 80);
    const distinct = new Set(cells.map((c) => c.toLowerCase())).size === cells.length;
    if (labels.length === cells.length && distinct) return i;
  }
  return 0;
}

/** Header names: blanks become "Column 3", repeats get " (2)". */
function cleanHeaders(raw: string[], width: number): string[] {
  const seen = new Map<string, number>();
  const headers: string[] = [];
  for (let i = 0; i < width; i++) {
    const base = raw[i]?.trim() || `Column ${i + 1}`;
    const n = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), n);
    headers.push(n === 1 ? base : `${base} (${n})`);
  }
  return headers;
}

/**
 * Reads a CSV file's text into a table. `headerRow` (0-based, among non-empty rows) and
 * `delimiter` override the detection.
 */
export function readCsvTable(
  text: string,
  { delimiter, headerRow }: { delimiter?: CsvDelimiter; headerRow?: number } = {},
): CsvTable {
  const used = delimiter ?? detectDelimiter(text);
  const all = parseCsvRows(text, used);
  const header = headerRow ?? detectHeaderRow(all);
  const body = all.slice(header + 1);
  const width = Math.max(all[header]?.length ?? 0, ...body.slice(0, 1000).map((r) => r.length));
  const headers = cleanHeaders(all[header] ?? [], width);
  const rows = body.map((r) =>
    r.length >= width ? r.slice(0, width) : [...r, ...Array<string>(width - r.length).fill('')],
  );
  return { headers, rows, delimiter: used, headerLine: header + 1 };
}
