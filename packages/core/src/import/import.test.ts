import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppliCliqDB, createJobRepository } from '../storage';
import { applicationStreak, goalProgress } from '../stats';
import { jobsToGhost } from '../reminders';
import type { Job } from '../types';
import { detectDelimiter, detectHeaderRow, parseCsvRows, readCsvTable } from './csv-parse';
import {
  detectDateOrder,
  guessMapping,
  guessStatus,
  hasAmbiguousDates,
  parseImportDate,
} from './fields';
import {
  LINKEDIN_SOURCE,
  isLinkedInApplicationsHeader,
  linkedInImportOptions,
  readLinkedInExport,
} from './linkedin';
import { type ImportDraft, importBatches, reviewImport, rowToDraft, statusValues } from './review';

const fixture = readFileSync(
  new URL('./__fixtures__/linkedin-job-applications.csv', import.meta.url),
  'utf8',
);

const local = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();

describe('parseCsvRows', () => {
  it('reads quoted fields with delimiters, escaped quotes and line breaks', () => {
    const text = 'a,b,c\r\n"x, y","say ""hi""","line 1\nline 2"\r\n';
    expect(parseCsvRows(text)).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'line 1\nline 2'],
    ]);
  });

  it('strips a BOM, skips empty lines and trims unquoted cells', () => {
    const text = '﻿name , age\n\n  Ann ,  3 \n,\n\r\nBob,4';
    expect(parseCsvRows(text)).toEqual([
      ['name', 'age'],
      ['Ann', '3'],
      ['Bob', '4'],
    ]);
  });

  it('keeps spaces inside quotes and handles CR-only line ends', () => {
    expect(parseCsvRows('a;b\r" x ";y', ';')).toEqual([
      ['a', 'b'],
      [' x ', 'y'],
    ]);
  });
});

describe('detectDelimiter', () => {
  it('finds commas, semicolons, tabs and pipes', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('Title;Company;Salary\nDev;Acme;"50,000"\nQA;Beta;"40,000"')).toBe(';');
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(detectDelimiter('a|b\n1|2')).toBe('|');
  });

  it('is not fooled by commas inside quoted cells', () => {
    expect(detectDelimiter('a;b\n"x, y, z";2\n"p, q";3')).toBe(';');
  });

  it('defaults to a comma for a single column', () => {
    expect(detectDelimiter('title\nDev\nQA')).toBe(',');
  });
});

describe('detectHeaderRow / readCsvTable', () => {
  it('skips a title line above the header', () => {
    const rows = parseCsvRows('My job search 2024\n\nCompany,Title,Date\nAcme,Dev,2024-01-02');
    expect(detectHeaderRow(rows)).toBe(1);
  });

  it('pads short rows, names blank headers and numbers repeats', () => {
    const table = readCsvTable('Title,,Title\nDev\nQA,x,y,extra', { headerRow: 0 });
    expect(table.headers).toEqual(['Title', 'Column 2', 'Title (2)', 'Column 4']);
    expect(table.rows).toEqual([
      ['Dev', '', '', ''],
      ['QA', 'x', 'y', 'extra'],
    ]);
  });
});

describe('guessMapping', () => {
  it('maps common export headers', () => {
    const headers = [
      'Job Title',
      'Company Name',
      'Job URL',
      'Location',
      'Status',
      'Date Applied',
      'Salary',
      'Source',
      'Notes',
      'Tags',
    ];
    expect(guessMapping(headers)).toEqual({
      title: 0,
      company: 1,
      url: 2,
      location: 3,
      status: 4,
      appliedAt: 5,
      salary: 6,
      source: 7,
      notes: 8,
      tags: 9,
    });
  });

  it('handles other spellings and leaves unknown columns out', () => {
    expect(guessMapping(['Employer', 'Position', 'Stage', 'Link', 'Mood', 'Applied On'])).toEqual({
      company: 0,
      title: 1,
      status: 2,
      url: 3,
      appliedAt: 5,
    });
  });

  it('gives a column to one field only, exact names first', () => {
    // "Date" could be the date applied, but "Application Date" is the better match.
    const mapping = guessMapping(['Date', 'Application Date', 'Company']);
    expect(mapping.appliedAt).toBe(1);
    expect(Object.values(mapping).filter((c) => c === 0)).toHaveLength(0);
  });
});

describe('guessStatus', () => {
  it.each([
    ['Interviewing', 'interview'],
    ['Phone screen', 'interview'],
    ['Rejected', 'rejected'],
    ['Not selected', 'rejected'],
    ['No offer', 'rejected'],
    ['Offer received', 'offer'],
    ['APPLIED', 'applied'],
    ['Application sent', 'applied'],
    ['Wishlist', 'saved'],
    ['Not applied yet', 'saved'],
    ['Take-home', 'assessment'],
    ['No response', 'ghosted'],
    ['Withdrew', 'withdrawn'],
    ['Not interested', 'withdrawn'],
  ] as const)('%s → %s', (value, status) => {
    expect(guessStatus(value)).toBe(status);
  });

  it('returns undefined for unknown values and knows custom labels', () => {
    expect(guessStatus('Purple')).toBeUndefined();
    expect(guessStatus('')).toBeUndefined();
    expect(guessStatus('Purple', { interview: 'purple' })).toBe('interview');
  });
});

describe('parseImportDate', () => {
  it('reads ISO dates, with and without time and zone', () => {
    expect(parseImportDate('2024-01-15', 'dmy')).toBe(local(2024, 1, 15));
    expect(parseImportDate('2024-01-15 09:30', 'dmy')).toBe(local(2024, 1, 15, 9, 30));
    expect(parseImportDate('2024-01-15T09:30:00Z', 'dmy')).toBe(Date.UTC(2024, 0, 15, 9, 30));
  });

  it('reads numeric dates in the given order unless a part is over 12', () => {
    expect(parseImportDate('03/04/2024', 'dmy')).toBe(local(2024, 4, 3));
    expect(parseImportDate('03/04/2024', 'mdy')).toBe(local(2024, 3, 4));
    expect(parseImportDate('25/12/2024', 'mdy')).toBe(local(2024, 12, 25));
    expect(parseImportDate('15.01.2024', 'dmy')).toBe(local(2024, 1, 15));
    expect(parseImportDate('1/15/24, 10:30 AM', 'mdy')).toBe(local(2024, 1, 15, 10, 30));
    expect(parseImportDate('1/15/24 12:05 am', 'mdy')).toBe(local(2024, 1, 15, 0, 5));
  });

  it('reads written months', () => {
    expect(parseImportDate('Jan 15, 2024', 'dmy')).toBe(local(2024, 1, 15));
    expect(parseImportDate('15 January 2024', 'mdy')).toBe(local(2024, 1, 15));
    expect(parseImportDate('Monday, January 15th, 2024', 'dmy')).toBe(local(2024, 1, 15));
    expect(parseImportDate('15-Jan-2024', 'dmy')).toBe(local(2024, 1, 15));
    expect(parseImportDate('January 15, 2024 3:45 PM', 'dmy')).toBe(local(2024, 1, 15, 15, 45));
  });

  it('returns undefined for empty cells and null for unreadable ones', () => {
    expect(parseImportDate('  ', 'dmy')).toBeUndefined();
    expect(parseImportDate('last Tuesday', 'dmy')).toBeNull();
    expect(parseImportDate('31/02/2024', 'dmy')).toBeNull();
    expect(parseImportDate('13/13/2024', 'dmy')).toBeNull();
    expect(parseImportDate('2024-01-15 25:00', 'dmy')).toBeNull();
    expect(parseImportDate('Smarch 3, 2024', 'dmy')).toBeNull();
  });

  it('detects the order of a column, or reports it as ambiguous', () => {
    expect(detectDateOrder(['01/02/2024', '25/02/2024'])).toBe('dmy');
    expect(detectDateOrder(['01/02/2024', '02/25/2024'])).toBe('mdy');
    expect(detectDateOrder(['01/02/2024', '03/04/2024'])).toBeUndefined();
    expect(hasAmbiguousDates(['01/02/2024', '03/04/2024'])).toBe(true);
    expect(hasAmbiguousDates(['2024-01-02', 'Jan 3, 2024'])).toBe(false);
  });
});

describe('rowToDraft', () => {
  const headers = ['Title', 'Company', 'URL', 'Status', 'Date', 'Salary', 'Tags', 'Notes', 'Extra'];
  const mapping = guessMapping(headers);

  it('builds a job from a row', () => {
    const cells = [
      'Dev',
      'Acme',
      'www.acme.test/jobs/1',
      'Interviewing',
      '2024-01-15',
      '$100k-$120k',
      'remote; dream',
      'Met at a meetup',
      'x',
    ];
    const result = rowToDraft(cells, headers, { mapping, dateOrder: 'dmy', noteColumns: [8] });
    expect(result).toEqual({
      draft: {
        title: 'Dev',
        company: 'Acme',
        url: 'https://www.acme.test/jobs/1',
        status: 'interview',
        appliedAt: local(2024, 1, 15),
        salary: { min: 100_000, max: 120_000, currency: 'USD' },
        tags: ['remote', 'dream'],
        notes: 'Met at a meetup\nExtra: x',
      },
    });
  });

  it('uses the status map and falls back to applied / saved', () => {
    const base = ['Dev', 'Acme', '', '', '', '', '', '', ''];
    const opts = { mapping, dateOrder: 'dmy' as const, statusMap: { purple: 'offer' as const } };
    const status = (cells: string[]) =>
      (rowToDraft(cells, headers, opts) as { draft: ImportDraft }).draft.status;
    expect(status(base)).toBe('saved');
    expect(status(base.map((c, i) => (i === 4 ? '2024-01-01' : c)))).toBe('applied');
    expect(status(base.map((c, i) => (i === 3 ? 'Purple' : c)))).toBe('offer');
  });

  it('flags unreadable dates and rows without a title or company', () => {
    const opts = { mapping, dateOrder: 'dmy' as const };
    expect(rowToDraft(['Dev', 'Acme', '', '', 'soon', '', '', '', ''], headers, opts)).toEqual({
      problem: 'Unreadable date “soon”',
    });
    expect(rowToDraft(['', '', 'https://x.test', '', '', '', '', '', ''], headers, opts)).toEqual({
      problem: 'No job title or company',
    });
  });

  it('drops links that are not links', () => {
    const result = rowToDraft(['Dev', 'Acme', 'n/a'], headers, { mapping, dateOrder: 'dmy' });
    expect((result as { draft: ImportDraft }).draft.url).toBe('');
  });
});

const existingJob = (extra: Partial<Job>): Job => ({
  id: 'existing',
  url: 'https://jobs.test/1',
  title: 'Dev',
  company: 'Acme',
  status: 'applied',
  history: [{ status: 'applied', at: local(2024, 1, 10) }],
  createdAt: local(2024, 1, 10),
  updatedAt: local(2024, 1, 10),
  ...extra,
});

describe('reviewImport (duplicates)', () => {
  const csv = [
    'Title,Company,URL,Date',
    'Dev,Acme,https://jobs.test/1?utm_source=x,2024-03-01', // same link as the saved job
    'dev,ACME,,2024-01-12', // same company + title, 2 days from the saved job
    'Dev,Acme,,2024-02-20', // same company + title, weeks later: a new application
    'QA,Beta,https://jobs.test/2,2024-01-01',
    'QA,Beta,https://jobs.test/2,2024-01-01', // repeated in the file
    'Ops,,,someday',
  ].join('\n');

  it('sorts rows into new, duplicate and error', async () => {
    const table = readCsvTable(csv);
    const options = { mapping: guessMapping(table.headers), dateOrder: 'dmy' as const };
    const rows = await reviewImport(table, options, [existingJob({})], { chunkSize: 2 });
    expect(rows.map((r) => r.kind)).toEqual([
      'duplicate',
      'duplicate',
      'new',
      'new',
      'duplicate',
      'error',
    ]);
    expect(rows[0]!.duplicateOf).toMatchObject({ id: 'existing' });
    expect(rows[4]!.duplicateOf).toMatchObject({ row: 3, title: 'QA' });
    expect(rows[5]!.problem).toMatch(/Unreadable date/);
  });

  it('matches an undated row on company and title alone', async () => {
    const table = readCsvTable('Title,Company\nDev,Acme');
    const rows = await reviewImport(
      table,
      { mapping: guessMapping(table.headers), dateOrder: 'dmy' },
      [existingJob({ url: '' })],
    );
    expect(rows[0]!.kind).toBe('duplicate');
  });

  it('handles a large file', async () => {
    const lines = ['Title,Company,Date'];
    for (let i = 0; i < 5000; i++) lines.push(`Job ${i},Company ${i % 50},2024-01-${(i % 28) + 1}`);
    const table = readCsvTable(lines.join('\n'));
    const rows = await reviewImport(
      table,
      { mapping: guessMapping(table.headers), dateOrder: 'dmy' },
      [],
    );
    expect(rows).toHaveLength(5000);
    expect(rows.every((r) => r.kind === 'new')).toBe(true);
  });
});

describe('statusValues', () => {
  it('lists distinct values with counts, most common first', () => {
    const table = readCsvTable('Status\nApplied\napplied \nPurple\n\nApplied');
    expect(statusValues(table, 0)).toEqual([
      { key: 'applied', value: 'Applied', count: 3 },
      { key: 'purple', value: 'Purple', count: 1 },
    ]);
  });
});

describe('LinkedIn export', () => {
  it('recognises the applications file by its headers', () => {
    const table = readCsvTable(fixture);
    expect(isLinkedInApplicationsHeader(table.headers)).toBe(true);
    expect(
      isLinkedInApplicationsHeader(['Saved Date', 'Job Url', 'Job Title', 'Company Name']),
    ).toBe(false);
  });

  it('maps the columns to jobs', async () => {
    const table = (await readLinkedInExport(strToU8(fixture)))!;
    const rows = await reviewImport(table, linkedInImportOptions(table), []);
    expect(rows.map((r) => r.kind)).toEqual(['new', 'new', 'new', 'new']);
    expect(rows[0]!.draft).toEqual({
      title: 'Frontend Engineer',
      company: 'Northwind Labs',
      url: 'https://www.linkedin.com/jobs/view/1000000001/',
      status: 'applied',
      appliedAt: local(2024, 11, 18, 9, 32),
      source: LINKEDIN_SOURCE,
      resumeVersion: 'Alex-Resume-2024.pdf',
      contact: { email: 'alex@example.com' },
      notes:
        'Contact Phone Number: +1 555 0100\nQuestion And Answers: Years of experience with TypeScript? : 5 | Authorized to work? : Yes',
    });
    expect(rows[2]!.draft).toMatchObject({ company: 'Fabrikam, Inc.' });
  });

  it('finds the file in a zip by its headers, whatever its name', async () => {
    const zip = zipSync({
      'Connections.csv': strToU8('First Name,Last Name,Company\nAda,Lovelace,Engines'),
      'Jobs/Saved Jobs.csv': strToU8('Saved Date,Job Url,Job Title,Company Name\n'),
      'Jobs/Renamed by LinkedIn.csv': strToU8(fixture),
      'Jobs/Renamed by LinkedIn_1.csv': strToU8(
        'Company Name,Job Title,Application Date\nWide World Importers,Buyer,"1/2/24, 1:00 PM"',
      ),
    });
    const table = await readLinkedInExport(zip);
    expect(table?.rows).toHaveLength(5);
    // The second file's columns are put in the first file's order.
    expect(table?.rows[4]).toEqual([
      '1/2/24, 1:00 PM',
      '',
      '',
      'Wide World Importers',
      'Buyer',
      '',
      '',
      '',
    ]);
  });

  it('finds a header below notes at the top of the file', async () => {
    const text = `Notes:\n"This file lists your applications"\n\n${fixture}`;
    const table = await readLinkedInExport(strToU8(text));
    expect(table?.rows).toHaveLength(4);
  });

  it('returns undefined when the export has no applications file', async () => {
    const zip = zipSync({ 'Profile.csv': strToU8('First Name,Last Name\nAda,Lovelace') });
    expect(await readLinkedInExport(zip)).toBeUndefined();
    expect(await readLinkedInExport(strToU8('a,b\n1,2'))).toBeUndefined();
  });
});

describe('importJobs / undoImport', () => {
  let db: AppliCliqDB;
  let clock: number;
  const repo = () => createJobRepository(db, () => clock);

  beforeEach(() => {
    clock = local(2024, 6, 1, 12);
    db = new AppliCliqDB(`test-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  const drafts: ImportDraft[] = [
    {
      title: 'Dev',
      company: ' Acme ',
      url: 'https://jobs.test/1?utm_source=x',
      status: 'applied',
      appliedAt: local(2024, 1, 15),
    },
    {
      title: 'QA',
      company: 'Beta',
      url: '',
      status: 'interview',
      appliedAt: local(2024, 2, 1),
    },
    { title: 'Ops', company: 'Gamma', url: '', status: 'saved' },
  ];

  it('adds the jobs in one batch, keeping the date applied in history', async () => {
    const { batchId, count } = await repo().importJobs(drafts);
    expect(count).toBe(3);
    const jobs = await repo().getJobs();
    const byTitle = Object.fromEntries(jobs.map((j) => [j.title, j]));
    expect(byTitle.Dev).toMatchObject({
      url: 'https://jobs.test/1',
      company: 'Acme',
      createdAt: local(2024, 1, 15),
      updatedAt: clock,
      importedAt: clock,
      importBatchId: batchId,
      history: [{ status: 'applied', at: local(2024, 1, 15) }],
    });
    expect(byTitle.QA!.history).toEqual([
      { status: 'applied', at: local(2024, 2, 1) },
      { status: 'interview', at: clock },
    ]);
    expect(byTitle.Ops!.history).toEqual([{ status: 'saved', at: clock }]);
    expect(importBatches(jobs)).toEqual([{ id: batchId, importedAt: clock, count: 3 }]);
  });

  it('undo deletes the batch as tombstones and leaves other jobs alone', async () => {
    const other = await repo().addJob({ url: 'https://jobs.test/9', title: 'Mine', company: 'X' });
    const first = await repo().importJobs(drafts.slice(0, 1));
    const second = await repo().importJobs(drafts.slice(1));
    clock += 1000;
    expect(await repo().undoImport(second.batchId)).toBe(2);
    const live = await repo().getJobs();
    expect(live.map((j) => j.title).sort()).toEqual(['Dev', 'Mine']);
    expect(live.find((j) => j.id === other.id)).toBeDefined();
    const tombstones = (await repo().getAllRecords()).filter((r) => r.deletedAt !== undefined);
    expect(tombstones).toHaveLength(2);
    expect(tombstones.every((t) => Object.keys(t).sort().join() === 'deletedAt,id')).toBe(true);
    expect(importBatches(live).map((b) => b.id)).toEqual([first.batchId]);
    expect(await repo().undoImport(second.batchId)).toBe(0);
  });
});

describe('imported jobs in goals, streaks and ghosting', () => {
  const now = local(2024, 6, 3, 12);
  const imported: Job = {
    ...existingJob({}),
    history: [{ status: 'applied', at: local(2024, 6, 3, 9) }],
    importedAt: local(2024, 6, 3, 10),
  };

  it('does not count imported applications toward goals or streaks', () => {
    const goals = { daily: 1, weekly: 1, monthly: 1 };
    expect(goalProgress([imported], goals, now).daily.count).toBe(0);
    expect(applicationStreak([imported], 1, now).todayMet).toBe(false);
  });

  it('counts a job imported as saved once it is applied to', () => {
    const applied: Job = {
      ...imported,
      history: [
        { status: 'saved', at: local(2024, 6, 3, 10) },
        { status: 'applied', at: local(2024, 6, 3, 11) },
      ],
    };
    expect(goalProgress([applied], { daily: 1, weekly: 1, monthly: 1 }, now).daily.count).toBe(1);
  });

  it('starts the ghosting clock at the import', () => {
    const old: Job = {
      ...existingJob({}),
      history: [{ status: 'applied', at: local(2024, 1, 1) }],
      importedAt: local(2024, 6, 1),
    };
    expect(jobsToGhost([old], 21, now)).toEqual([]);
    expect(jobsToGhost([old], 21, local(2024, 6, 30))).toHaveLength(1);
  });
});
