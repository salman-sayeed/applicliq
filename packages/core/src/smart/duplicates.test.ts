import { describe, expect, it } from 'vitest';
import { DAY, testJob } from '../test-jobs';
import {
  duplicatePairs,
  findDuplicates,
  looksLikeSameJob,
  mergeDuplicateJobs,
  normalizeCompany,
  normalizeTitle,
  pairKey,
  sourceName,
  titleSimilarity,
} from './duplicates';

describe('normalizeCompany', () => {
  it('drops legal forms and punctuation', () => {
    expect(normalizeCompany('Acme, Inc.')).toBe('acme');
    expect(normalizeCompany('ACME Ltd')).toBe('acme');
    expect(normalizeCompany('Acme GmbH & Co. KG')).toBe('acme');
    expect(normalizeCompany('Acme Limited')).toBe('acme');
    expect(normalizeCompany('acme llc')).toBe('acme');
    expect(normalizeCompany('Société Générale S.A.')).toBe('societe generale');
  });

  it('keeps names that are only a legal-form word, and inner words', () => {
    expect(normalizeCompany('Company')).toBe('company');
    expect(normalizeCompany('The Company Store')).toBe('the company store');
    expect(normalizeCompany('  ')).toBe('');
  });
});

describe('titles', () => {
  it('strips bracketed noise and punctuation', () => {
    expect(normalizeTitle('Frontend Engineer (Senior) [Remote]')).toBe('frontend engineer');
    expect(normalizeTitle('Software-Engineer (m/w/d)')).toBe('software engineer');
  });

  it('scores word overlap from 0 to 1', () => {
    expect(titleSimilarity('Frontend Engineer', 'frontend engineer!')).toBe(1);
    expect(titleSimilarity('Frontend Engineer', 'Senior Frontend Engineer')).toBe(0.8);
    expect(titleSimilarity('Frontend Engineer', 'Backend Engineer')).toBe(0.5);
    expect(titleSimilarity('', 'Engineer')).toBe(0);
    expect(titleSimilarity('(Senior)', '(Senior)')).toBe(0);
  });
});

describe('looksLikeSameJob', () => {
  const a = { company: 'Acme Inc.', title: 'Frontend Engineer', createdAt: 0 };

  it('needs the same company and similar titles', () => {
    expect(looksLikeSameJob(a, { company: 'ACME', title: 'Frontend Engineer (Remote)' })).toBe(
      true,
    );
    expect(looksLikeSameJob(a, { company: 'Other', title: 'Frontend Engineer' })).toBe(false);
    expect(looksLikeSameJob(a, { company: 'Acme', title: 'Data Analyst' })).toBe(false);
  });

  it('only within the time window', () => {
    expect(looksLikeSameJob(a, { ...a, createdAt: 60 * DAY })).toBe(true);
    expect(looksLikeSameJob(a, { ...a, createdAt: 61 * DAY })).toBe(false);
  });

  it('never matches jobs without a company', () => {
    expect(looksLikeSameJob({ ...a, company: '' }, { ...a, company: '' })).toBe(false);
  });
});

describe('findDuplicates / duplicatePairs', () => {
  const now = 100 * DAY;
  const linkedin = testJob([['saved', now - 5 * DAY]], {
    id: 'li',
    company: 'Acme',
    title: 'Frontend Engineer',
    source: 'linkedin',
  });
  const careers = testJob([['applied', now - 2 * DAY]], {
    id: 'site',
    company: 'Acme, Inc.',
    title: 'Senior Frontend Engineer',
  });
  const other = testJob([['saved', now - DAY]], { id: 'x', company: 'Acme', title: 'Designer' });
  const old = testJob([['saved', now - 90 * DAY]], {
    id: 'old',
    company: 'Acme',
    title: 'Frontend Engineer',
  });

  it('finds saved jobs like a new one, most similar first', () => {
    const found = findDuplicates(
      { company: 'ACME', title: 'Frontend Engineer' },
      [careers, linkedin, other, old],
      {},
      now,
    );
    expect(found.map((j) => j.id)).toEqual(['li', 'site']);
  });

  it('finds nothing with no jobs, and skips the job itself', () => {
    expect(findDuplicates({ company: 'Acme', title: 'Dev' }, [], {}, now)).toEqual([]);
    expect(findDuplicates(linkedin, [linkedin], {}, now)).toEqual([]);
  });

  it('lists pairs once, skipping dismissed ones', () => {
    const jobs = [linkedin, careers, other, old];
    expect(duplicatePairs(jobs).map((p) => [p.a.id, p.b.id])).toEqual([['li', 'site']]);
    expect(duplicatePairs(jobs, { notDuplicates: [pairKey('site', 'li')] })).toEqual([]);
    expect(findDuplicates(linkedin, jobs, { notDuplicates: [pairKey('li', 'site')] })).toEqual([]);
  });

  it('handles a single job', () => {
    expect(duplicatePairs([linkedin])).toEqual([]);
  });
});

describe('mergeDuplicateJobs', () => {
  const keep = testJob(
    [
      ['saved', 10 * DAY],
      ['applied', 12 * DAY],
    ],
    {
      id: 'keep',
      url: 'https://acme.test/careers/1',
      notes: 'Referral from Sam',
      tags: ['frontend', 'Dream'],
      alternateUrls: ['https://old.test/1'],
    },
  );
  const other = testJob(
    [
      ['saved', 5 * DAY],
      ['interview', 20 * DAY],
    ],
    {
      id: 'other',
      url: 'https://linkedin.test/jobs/1',
      notes: 'Recruiter reached out',
      tags: ['dream', 'remote'],
      location: 'Berlin',
      importBatchId: 'b1',
      importedAt: 5 * DAY,
    },
  );

  it('combines URLs, notes, tags and history, keeping the earliest creation', () => {
    const merged = mergeDuplicateJobs(keep, other);
    expect(merged.id).toBe('keep');
    expect(merged.url).toBe('https://acme.test/careers/1');
    expect(merged.alternateUrls).toEqual(['https://linkedin.test/jobs/1', 'https://old.test/1']);
    expect(merged.notes).toBe('Referral from Sam\n\nRecruiter reached out');
    expect(merged.tags).toEqual(['frontend', 'Dream', 'remote']);
    expect(merged.createdAt).toBe(5 * DAY);
    expect(merged.history.map((h) => h.status)).toEqual(['saved', 'saved', 'applied', 'interview']);
    // Fields only the other job had are kept; its import bookkeeping is not.
    expect(merged.location).toBe('Berlin');
    expect(merged.importBatchId).toBeUndefined();
    expect(merged.status).toBe(keep.status);
  });

  it('does not repeat identical notes or history entries', () => {
    const twin = { ...keep, id: 'twin', url: 'https://b.test' };
    const merged = mergeDuplicateJobs(keep, twin);
    expect(merged.notes).toBe('Referral from Sam');
    expect(merged.history).toEqual(keep.history);
  });

  it('works when neither job has notes or tags', () => {
    const a = testJob([['saved', 1]], { id: 'a', url: 'https://a.test/x' });
    const b = testJob([['saved', 2]], { id: 'b', url: 'https://a.test/x' });
    const merged = mergeDuplicateJobs(a, b);
    expect(merged).not.toHaveProperty('notes');
    expect(merged).not.toHaveProperty('tags');
    // The same URL isn't listed as its own alternate.
    expect(merged).not.toHaveProperty('alternateUrls');
  });
});

describe('sourceName', () => {
  it('names known boards and falls back to the host', () => {
    expect(sourceName({ source: 'linkedin', url: '' })).toBe('LinkedIn');
    expect(sourceName({ source: 'www.careers.acme.test', url: '' })).toBe('careers.acme.test');
    expect(sourceName({ url: 'https://www.acme.test/jobs/1' })).toBe('acme.test');
    expect(sourceName({ url: 'not a url' })).toBe('another site');
  });
});
