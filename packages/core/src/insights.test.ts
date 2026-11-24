import { describe, expect, it } from 'vitest';
import {
  MIN_GROUP_SIZE,
  median,
  overallResponse,
  periodStats,
  replyDays,
  replyTimes,
  responseStatsBy,
  shareCardData,
  sharePostText,
  weeklyRecap,
  weeklyRecapText,
} from './insights';
import { DEFAULT_SETTINGS } from './settings';
import { DAY, testJob } from './test-jobs';
import type { JobStatus } from './types';

/** Local noon, so the tests read the same in every time zone. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const now = at(2026, 7, 14); // a Tuesday; the week started Monday the 13th
const goals = DEFAULT_SETTINGS.goals;

const applied = (when: number, later: [JobStatus, number][] = [], extra = {}) =>
  testJob([['saved', when - DAY], ['applied', when], ...later], extra);

describe('response stats', () => {
  it('handles no data', () => {
    expect(overallResponse([])).toMatchObject({ applied: 0, enoughData: false });
    expect(overallResponse([]).responseRate).toBeUndefined();
    expect(responseStatsBy([], 'source')).toEqual([]);
  });

  it('counts any reply except ghosted and withdrawn', () => {
    const jobs = [
      applied(1, [['rejected', 2]]),
      applied(1, [['assessment', 2]]),
      applied(1, [['interview', 2]]),
      applied(1, [
        ['interview', 2],
        ['offer', 3],
      ]),
      applied(1, [['ghosted', 2]]),
      applied(1, [['withdrawn', 2]]),
      applied(1),
      testJob([['saved', 1]]),
    ];
    expect(overallResponse(jobs)).toMatchObject({
      applied: 7,
      responded: 4,
      interviewed: 2,
      offers: 1,
      responseRate: 4 / 7,
      interviewRate: 2 / 7,
      offerRate: 1 / 7,
      enoughData: true,
    });
  });

  it('groups by source and work type, small groups flagged', () => {
    const jobs = [
      ...Array.from({ length: MIN_GROUP_SIZE }, () =>
        applied(1, [['interview', 2]], { source: 'LinkedIn' }),
      ),
      applied(1, [], { source: 'referral', workType: 'remote' }),
      applied(1),
      testJob([['saved', 1]], { source: 'indeed' }),
    ];
    const bySource = responseStatsBy(jobs, 'source');
    expect(bySource.map((r) => [r.key, r.applied, r.enoughData])).toEqual([
      ['linkedin', 5, true],
      ['referral', 1, false],
      [undefined, 1, false],
    ]);
    expect(bySource[0]!.interviewRate).toBe(1);
    expect(responseStatsBy(jobs, 'workType').map((r) => r.key)).toEqual(['remote', undefined]);
  });

  it('counts imported applications', () => {
    const imported = applied(1, [['rejected', 50]], { importedAt: 50 });
    expect(overallResponse([imported])).toMatchObject({ applied: 1, responded: 1 });
  });
});

describe('reply time', () => {
  it('measures applied → first reply', () => {
    expect(replyDays(applied(10 * DAY, [['interview', 13 * DAY]]))).toBe(3);
    expect(
      replyDays(
        applied(10 * DAY, [
          ['assessment', 12 * DAY],
          ['interview', 20 * DAY],
        ]),
      ),
    ).toBe(2);
  });

  it('skips jobs with no applied date, no reply, or a reply recorded by an import', () => {
    expect(replyDays(testJob([['interview', 5]]))).toBeUndefined();
    expect(replyDays(applied(1, [['ghosted', 5]]))).toBeUndefined();
    const imported = applied(DAY, [['rejected', 9 * DAY]], { importedAt: 9 * DAY });
    expect(replyDays(imported)).toBeUndefined();
  });

  it('takes the median overall and per source', () => {
    const jobs = [
      applied(0, [['rejected', 2 * DAY]], { source: 'linkedin' }),
      applied(0, [['rejected', 4 * DAY]], { source: 'linkedin' }),
      applied(0, [['rejected', 9 * DAY]], { source: 'linkedin' }),
      applied(0, [['interview', 1 * DAY]], { source: 'referral' }),
    ];
    const times = replyTimes(jobs);
    expect(times.overall).toEqual({ key: undefined, samples: 4, medianDays: 3, enoughData: true });
    expect(times.bySource).toEqual([
      { key: 'linkedin', samples: 3, medianDays: 4, enoughData: true },
      { key: 'referral', samples: 1, medianDays: 1, enoughData: false },
    ]);
  });

  it('handles no data', () => {
    expect(median([])).toBeUndefined();
    expect(replyTimes([])).toEqual({
      overall: { key: undefined, samples: 0, medianDays: undefined, enoughData: false },
      bySource: [],
    });
  });
});

describe('periods, recap and share card', () => {
  const jobs = [
    applied(at(2026, 7, 13), [['interview', at(2026, 7, 14, 9)]]),
    applied(at(2026, 7, 8)),
    applied(at(2026, 6, 20), [['rejected', at(2026, 7, 10)]]),
    applied(at(2025, 1, 5), [['offer', at(2025, 2, 1)]]),
    // Imported this week: counts as applied in March, its rejection's date isn't known.
    applied(at(2026, 3, 1), [['rejected', at(2026, 7, 12)]], { importedAt: at(2026, 7, 12) }),
  ];

  it('counts this week, this month and all time', () => {
    expect(periodStats(jobs, 'week', now)).toMatchObject({ applications: 1, responses: 1 });
    expect(periodStats(jobs, 'month', now)).toMatchObject({ applications: 2, responses: 2 });
    expect(periodStats(jobs, 'all', now)).toMatchObject({
      applications: 5,
      responses: 4,
      interviews: 2,
      offers: 1,
    });
    expect(periodStats([], 'all', now)).toMatchObject({ applications: 0, responses: 0 });
  });

  it('builds the weekly recap (imports out of streaks and goals)', () => {
    const recap = weeklyRecap(jobs, { ...goals, daily: 1, weekly: 5 }, now);
    // The last 7 days: applications on the 8th and 13th, replies on the 10th and 14th (the
    // imported rejection on the 12th has no real date). The streak is yesterday only.
    expect(recap).toEqual({
      applications: 2,
      responses: 2,
      streak: 1,
      weeklyGoal: { count: 1, goal: 5 },
    });
    expect(weeklyRecapText(recap)).toEqual({
      title: 'Your week: 2 applications',
      message: '2 responses · 1 day streak · weekly goal 1/5. Open Insights for more.',
    });
    expect(weeklyRecap([], { ...goals, weekly: null }, now)).toEqual({
      applications: 0,
      responses: 0,
      streak: 0,
    });
  });

  it('builds share card data with numbers only', () => {
    const data = shareCardData(jobs, { ...goals, weekly: 5 }, 'week', { now });
    expect(data.goal).toEqual({ count: 1, goal: 5 });
    expect(shareCardData(jobs, goals, 'all', { now, streak: false })).not.toHaveProperty('goal');
    const text = sharePostText(data);
    expect(text).toContain('My job search this week: 1 application, 1 response, 1 interview');
    expect(text).toContain('1 of 5 toward my weekly goal');
    expect(text).toContain('applicliq.pages.dev');
    expect(text).not.toContain('Acme');
  });
});
