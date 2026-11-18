import { describe, expect, it } from 'vitest';
import { mergeRecords, pickWinner, purgeTombstones } from './merge';
import { type Job, type JobRecord, TOMBSTONE_TTL_MS } from './types';

const job = (id: string, updatedAt: number, extra: Partial<Job> = {}): Job => ({
  id,
  url: `https://example.com/jobs/${id}`,
  title: 'Engineer',
  company: 'Acme',
  status: 'saved',
  history: [{ status: 'saved', at: 0 }],
  createdAt: 0,
  updatedAt,
  ...extra,
});

describe('pickWinner', () => {
  it('keeps the most recently updated version', () => {
    const older = job('a', 1, { title: 'old' });
    const newer = job('a', 2, { title: 'new' });
    expect(pickWinner(older, newer)).toBe(newer);
    expect(pickWinner(newer, older)).toBe(newer);
  });

  it('lets a newer tombstone delete a job', () => {
    const tomb = { id: 'a', deletedAt: 5 };
    expect(pickWinner(job('a', 4), tomb)).toBe(tomb);
  });

  it('lets a job edited after deletion win', () => {
    const edited = job('a', 6);
    expect(pickWinner({ id: 'a', deletedAt: 5 }, edited)).toBe(edited);
  });

  it('prefers the tombstone on a tie', () => {
    const tomb = { id: 'a', deletedAt: 5 };
    expect(pickWinner(job('a', 5), tomb)).toBe(tomb);
    expect(pickWinner(tomb, job('a', 5))).toBe(tomb);
  });
});

describe('mergeRecords', () => {
  it('unions records from both sides', () => {
    const merged = mergeRecords([job('a', 1)], [job('b', 1)], 10);
    expect(merged.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('does not mutate inputs', () => {
    const local: JobRecord[] = [job('a', 1)];
    const remote: JobRecord[] = [job('a', 2)];
    mergeRecords(local, remote, 10);
    expect(local[0]).toMatchObject({ updatedAt: 1 });
    expect(remote[0]).toMatchObject({ updatedAt: 2 });
  });

  it('purges tombstones older than 30 days', () => {
    const now = TOMBSTONE_TTL_MS + 1000;
    const merged = mergeRecords(
      [{ id: 'old', deletedAt: 0 }],
      [{ id: 'fresh', deletedAt: now - 1 }],
      now,
    );
    expect(merged.map((r) => r.id)).toEqual(['fresh']);
  });
});

describe('purgeTombstones', () => {
  it('never purges live jobs', () => {
    expect(purgeTombstones([job('a', 0)], Number.MAX_SAFE_INTEGER)).toHaveLength(1);
  });
});
