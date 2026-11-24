import { describe, expect, it } from 'vitest';
import { DAY, testJob } from '../test-jobs';
import { parsePostingDate, parseRelativePosted, redFlags } from './red-flags';

const now = new Date(2026, 5, 15, 12).getTime();
const base = { oldPostingDays: 30, appliedBeforeDays: 90, now };
const salary = { min: 1, max: 2 };

describe('redFlags', () => {
  it('says nothing when everything is known and fine', () => {
    expect(
      redFlags({ ...base, posting: { datePosted: now - 3 * DAY }, job: { company: 'A', salary } }),
    ).toEqual([]);
  });

  it('says nothing about dates it does not know', () => {
    expect(redFlags({ ...base, job: { salary } })).toEqual([]);
  });

  it('notes an old posting', () => {
    const flags = redFlags({ ...base, posting: { datePosted: now - 45 * DAY }, job: { salary } });
    expect(flags).toEqual([{ kind: 'old-posting', text: 'Posted 45 days ago' }]);
    const older = redFlags({ ...base, posting: { datePosted: now - 120 * DAY }, job: { salary } });
    expect(older[0]?.text).toBe('Posted 4 months ago');
  });

  it('notes a passed closing date instead of the age', () => {
    const flags = redFlags({
      ...base,
      posting: { datePosted: now - 60 * DAY, validThrough: now - DAY },
      job: { salary },
    });
    expect(flags.map((f) => f.kind)).toEqual(['possibly-closed']);
  });

  it('notes a missing salary only for a page that was read', () => {
    expect(redFlags({ ...base, job: {} }).map((f) => f.kind)).toEqual(['no-salary']);
    expect(redFlags({ ...base, job: {}, pageRead: false })).toEqual([]);
  });

  it('links to a recent application at the same company', () => {
    const recent = testJob(
      [
        ['saved', now - 40 * DAY],
        ['applied', now - 30 * DAY],
      ],
      { id: 'earlier', company: 'Acme Inc.' },
    );
    const tooOld = testJob([['applied', now - 200 * DAY]], { company: 'Acme' });
    const flags = redFlags({ ...base, job: { company: 'ACME', salary }, jobs: [tooOld, recent] });
    expect(flags).toEqual([
      { kind: 'applied-before', text: 'You applied here 30 days ago', jobId: 'earlier' },
    ]);
  });

  it('ignores the job itself and saved-only jobs', () => {
    const self = testJob([['applied', now - DAY]], { id: 'me', company: 'Acme' });
    const saved = testJob([['saved', now - DAY]], { company: 'Acme' });
    expect(
      redFlags({ ...base, job: { id: 'me', company: 'Acme', salary }, jobs: [self, saved] }),
    ).toEqual([]);
  });
});

describe('posting dates', () => {
  it('parses ISO dates and epoch values', () => {
    expect(parsePostingDate('2026-03-01')).toBe(new Date(2026, 2, 1).getTime());
    expect(parsePostingDate('2026-03-01T10:00:00Z')).toBe(Date.UTC(2026, 2, 1, 10));
    expect(parsePostingDate(1_772_323_200)).toBe(1_772_323_200_000);
  });

  it('rejects junk and absurd years', () => {
    expect(parsePostingDate('soon')).toBeUndefined();
    expect(parsePostingDate('0001-01-01')).toBeUndefined();
    expect(parsePostingDate(undefined)).toBeUndefined();
    expect(parsePostingDate('March 1')).toBeUndefined();
  });

  it('reads "x days ago" lines', () => {
    expect(parseRelativePosted('Berlin · 3 days ago · 120 applicants', now)).toBe(now - 3 * DAY);
    expect(parseRelativePosted('Reposted 2 weeks ago', now)).toBe(now - 14 * DAY);
    expect(parseRelativePosted('1 month ago', now)).toBe(now - 30 * DAY);
    expect(parseRelativePosted('Posted 30+ days ago', now)).toBe(now - 30 * DAY);
    expect(parseRelativePosted('5 hours ago', now)).toBe(now);
    expect(parseRelativePosted('Just posted', now)).toBe(now);
    expect(parseRelativePosted('Berlin, Germany', now)).toBeUndefined();
    expect(parseRelativePosted(undefined, now)).toBeUndefined();
  });
});
