import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addDays,
  applicationFunnel,
  applicationHeatmap,
  applicationStreak,
  applicationsByDay,
  breakdownBy,
  dayKey,
  firstAppliedAt,
  goalProgress,
  startOfWeek,
} from './stats';
import type { Job, JobStatus } from './types';

/** Local time, so the tests read the same in every time zone. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

let seq = 0;
function job(history: [JobStatus, number][], extra: Partial<Job> = {}): Job {
  const entries = history.map(([status, when]) => ({ status, at: when }));
  return {
    id: `j${seq++}`,
    url: 'https://a.test',
    title: 't',
    company: 'c',
    status: entries.at(-1)?.status ?? 'saved',
    history: entries,
    createdAt: entries[0]?.at ?? 0,
    updatedAt: entries.at(-1)?.at ?? 0,
    ...extra,
  };
}

/** A job applied to at `when`. */
const applied = (when: number, extra: Partial<Job> = {}) =>
  job(
    [
      ['saved', when - 1000],
      ['applied', when],
    ],
    extra,
  );

describe('firstAppliedAt', () => {
  it('is the first step past saved, even when "applied" was skipped', () => {
    expect(firstAppliedAt(applied(5_000))).toBe(5_000);
    expect(
      firstAppliedAt(
        job([
          ['saved', 1],
          ['interview', 2],
          ['offer', 3],
        ]),
      ),
    ).toBe(2);
    expect(
      firstAppliedAt(
        job([
          ['saved', 1],
          ['rejected', 4],
        ]),
      ),
    ).toBe(4);
  });

  it('is undefined for saved or withdrawn-only jobs', () => {
    expect(firstAppliedAt(job([['saved', 1]]))).toBeUndefined();
    expect(
      firstAppliedAt(
        job([
          ['saved', 1],
          ['withdrawn', 2],
        ]),
      ),
    ).toBeUndefined();
  });

  it('counts a job once, at its first application, however it moves later', () => {
    const j = job([
      ['saved', 1],
      ['applied', 2],
      ['interview', 3],
      ['applied', 4],
    ]);
    expect(firstAppliedAt(j)).toBe(2);
  });
});

describe('calendar helpers', () => {
  it('starts weeks on Monday by default, or any given day', () => {
    const wed = at(2026, 11, 18);
    expect(dayKey(startOfWeek(wed))).toBe('2026-11-16');
    expect(dayKey(startOfWeek(wed, 0))).toBe('2026-11-15');
    expect(dayKey(startOfWeek(at(2026, 11, 16)))).toBe('2026-11-16');
  });

  describe('across a daylight-saving change', () => {
    const original = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = 'America/New_York'; // clocks go back on 2026-11-01
    });
    afterAll(() => {
      process.env.TZ = original;
    });

    it('steps one calendar day at a time', () => {
      // Proves the zone took effect: the UTC offset changes across that weekend.
      expect(new Date(2026, 9, 31).getTimezoneOffset()).not.toBe(
        new Date(2026, 10, 2).getTimezoneOffset(),
      );
      const keys = [0, 1, 2].map((n) => dayKey(addDays(new Date(2026, 9, 31).getTime(), n)));
      expect(keys).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
    });

    it('builds a heatmap with no skipped or repeated days', () => {
      const { weeks } = applicationHeatmap([], new Date(2026, 10, 18).getTime(), { weeks: 8 });
      const keys = weeks.flat().map((d) => d.key);
      expect(new Set(keys).size).toBe(56);
      expect(keys).toContain('2026-11-01');
    });
  });
});

describe('applicationsByDay', () => {
  it('counts applications per local day and ignores unapplied jobs', () => {
    const counts = applicationsByDay([
      applied(at(2026, 11, 3, 9)),
      applied(at(2026, 11, 3, 23)),
      applied(at(2026, 11, 4, 0)),
      job([['saved', at(2026, 11, 3)]]),
    ]);
    expect(Object.fromEntries(counts)).toEqual({ '2026-11-03': 2, '2026-11-04': 1 });
  });
});

describe('goalProgress', () => {
  const now = at(2026, 11, 18, 15); // Wednesday
  const jobs = [
    applied(at(2026, 11, 18, 9)), // today
    applied(at(2026, 11, 16, 9)), // Monday, this week
    applied(at(2026, 11, 15, 9)), // Sunday, last week, this month
    applied(at(2026, 10, 31, 9)), // last month
    job([['saved', at(2026, 11, 18, 10)]]), // saved only
  ];

  it('counts today, this week (from Monday) and this month', () => {
    const p = goalProgress(jobs, { daily: 2, weekly: 2, monthly: 4 }, now);
    expect([p.daily.count, p.weekly.count, p.monthly.count]).toEqual([1, 2, 3]);
    expect(p.daily).toMatchObject({ goal: 2, ratio: 0.5, met: false });
    expect(p.weekly).toMatchObject({ ratio: 1, met: true });
    expect(p.monthly.ratio).toBe(0.75);
  });

  it('lets the ratio pass 1 and treats a goal of 0 as off', () => {
    const p = goalProgress(jobs, { daily: 0, weekly: 1, monthly: 0 }, now);
    expect(p.weekly.ratio).toBe(2);
    expect(p.daily).toMatchObject({ ratio: 0, met: false });
  });

  it('honours another week start', () => {
    expect(goalProgress(jobs, { daily: 1, weekly: 1, monthly: 1 }, now, 0).weekly.count).toBe(3);
  });
});

describe('applicationStreak', () => {
  const now = at(2026, 11, 18, 15);
  const days = (...dates: [number, number][]) =>
    dates.flatMap(([d, n]) => Array.from({ length: n }, () => applied(at(2026, 11, d, 10))));

  it('counts consecutive days meeting the goal, including today once met', () => {
    const jobs = days([15, 2], [16, 2], [17, 3], [18, 2]);
    expect(applicationStreak(jobs, 2, now)).toEqual({ current: 4, best: 4, todayMet: true });
  });

  it('keeps yesterday’s streak while today is still in progress', () => {
    const jobs = days([16, 2], [17, 2], [18, 1]);
    expect(applicationStreak(jobs, 2, now)).toEqual({ current: 2, best: 2, todayMet: false });
  });

  it('breaks on a missed day and remembers the best run', () => {
    const jobs = days([1, 1], [2, 1], [3, 1], [4, 1], [6, 1], [17, 1], [18, 1]);
    expect(applicationStreak(jobs, 1, now)).toEqual({ current: 2, best: 4, todayMet: true });
  });

  it('is zero with no goal or no applications', () => {
    expect(applicationStreak(days([18, 5]), 0, now)).toEqual({
      current: 0,
      best: 0,
      todayMet: false,
    });
    expect(applicationStreak([], 1, now)).toEqual({ current: 0, best: 0, todayMet: false });
  });
});

describe('applicationHeatmap', () => {
  const now = at(2026, 11, 18, 15); // Wednesday

  it('has 53 Monday-first weeks ending this week, with future days empty', () => {
    const { weeks } = applicationHeatmap([], now);
    expect(weeks).toHaveLength(53);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0]![0]!.key).toBe('2025-11-17');
    const last = weeks.at(-1)!;
    expect(last.map((d) => d.key)).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ]);
    expect(last.map((d) => d.future)).toEqual([false, false, false, true, true, true, true]);
  });

  it('counts per day, totals the range and scales levels to the busiest day', () => {
    const jobs = [
      ...Array.from({ length: 4 }, () => applied(at(2026, 11, 17, 10))),
      applied(at(2026, 11, 16, 10)),
      applied(at(2026, 11, 16, 11)),
      applied(at(2026, 11, 18, 9)),
      applied(at(2024, 1, 1)), // outside the range
    ];
    const heat = applicationHeatmap(jobs, now);
    const [mon, tue, wed] = heat.weeks.at(-1)!;
    expect([mon!.count, tue!.count, wed!.count]).toEqual([2, 4, 1]);
    expect([mon!.level, tue!.level, wed!.level]).toEqual([2, 4, 1]);
    expect(heat).toMatchObject({ total: 7, max: 4 });
    expect(heat.weeks[0]![0]!.level).toBe(0);
  });
});

describe('applicationFunnel', () => {
  it('counts how far applications got, with conversion rates', () => {
    const jobs = [
      job([['saved', 1]]), // not applied: excluded
      applied(1),
      applied(1),
      job([
        ['saved', 1],
        ['applied', 2],
        ['rejected', 3],
      ]),
      job([
        ['saved', 1],
        ['applied', 2],
        ['interview', 3],
        ['rejected', 4],
      ]),
      job([
        ['saved', 1],
        ['applied', 2],
        ['interview', 3],
        ['offer', 4],
      ]),
      job([
        ['saved', 1],
        ['offer', 2],
      ]), // offer without a recorded interview still counts
    ];
    expect(applicationFunnel(jobs)).toEqual({
      applied: 6,
      interview: 3,
      offer: 2,
      interviewRate: 0.5,
      offerRate: 2 / 3,
      overallRate: 1 / 3,
    });
  });

  it('leaves rates undefined when there is nothing to divide by', () => {
    expect(applicationFunnel([job([['saved', 1]])])).toEqual({
      applied: 0,
      interview: 0,
      offer: 0,
      interviewRate: undefined,
      offerRate: undefined,
      overallRate: undefined,
    });
  });
});

describe('breakdownBy', () => {
  const interviewed = (extra: Partial<Job>) =>
    job(
      [
        ['saved', 1],
        ['applied', 2],
        ['interview', 3],
      ],
      extra,
    );

  it('groups by source, most applications first, jobs without a source last', () => {
    const jobs = [
      applied(1, { source: 'indeed' }),
      interviewed({ source: 'linkedin' }),
      applied(1, { source: 'linkedin' }),
      job([['saved', 1]], { source: 'linkedin' }),
      job([['saved', 1]], { source: 'bdjobs' }),
      applied(1),
      applied(1, { source: '  ' }),
    ];
    const rows = breakdownBy(jobs, 'source');
    expect(rows.map((r) => [r.key, r.saved, r.applied, r.interview])).toEqual([
      ['linkedin', 3, 2, 1],
      ['indeed', 1, 1, 0],
      ['bdjobs', 1, 0, 0],
      [undefined, 2, 2, 0],
    ]);
    expect(rows[0]!.interviewRate).toBe(0.5);
  });

  it('groups by work type', () => {
    const rows = breakdownBy(
      [
        interviewed({ workType: 'remote' }),
        applied(1, { workType: 'remote' }),
        applied(1, { workType: 'onsite' }),
      ],
      'workType',
    );
    expect(rows.map((r) => [r.key, r.applied, r.interviewRate])).toEqual([
      ['remote', 2, 0.5],
      ['onsite', 1, 0],
    ]);
  });
});
