import { describe, expect, it } from 'vitest';
import { daysSince, lastAppliedAt, mostRecentApplication } from './history';
import type { Job, StatusChange } from './types';

const DAY = 24 * 60 * 60 * 1000;
const job = (id: string, history: StatusChange[]): Job => ({
  id,
  url: `https://a.test/${id}`,
  title: 't',
  company: 'Acme',
  status: history.at(-1)?.status ?? 'saved',
  history,
  createdAt: 0,
  updatedAt: 0,
});

describe('lastAppliedAt', () => {
  it('returns the latest applied entry, even if the status moved on', () => {
    const j = job('a', [
      { status: 'saved', at: 1 },
      { status: 'applied', at: 2 },
      { status: 'interview', at: 3 },
    ]);
    expect(lastAppliedAt(j)).toBe(2);
  });

  it('is undefined for jobs never applied to', () => {
    expect(lastAppliedAt(job('a', [{ status: 'saved', at: 1 }]))).toBeUndefined();
  });
});

describe('daysSince', () => {
  it('counts whole days and never goes negative', () => {
    expect(daysSince(0, DAY - 1)).toBe(0);
    expect(daysSince(0, 3 * DAY + 5)).toBe(3);
    expect(daysSince(10, 0)).toBe(0);
  });
});

describe('mostRecentApplication', () => {
  it('picks the most recent application across jobs', () => {
    const older = job('a', [{ status: 'applied', at: 1 * DAY }]);
    const newer = job('b', [{ status: 'applied', at: 5 * DAY }]);
    const saved = job('c', [{ status: 'saved', at: 9 * DAY }]);
    expect(mostRecentApplication([older, newer, saved], 7 * DAY)).toEqual({
      job: newer,
      appliedAt: 5 * DAY,
      days: 2,
    });
  });

  it('is undefined when nothing was applied to', () => {
    expect(mostRecentApplication([job('a', [{ status: 'saved', at: 1 }])])).toBeUndefined();
  });
});
