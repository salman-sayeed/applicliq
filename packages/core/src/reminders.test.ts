import { describe, expect, it } from 'vitest';
import {
  REMINDER_MAX_AGE_MS,
  dailyGoalBadge,
  dueReminders,
  jobSummary,
  jobsToGhost,
  nextReminderAt,
  pruneShownReminders,
} from './reminders';
import type { Job, JobStatus } from './types';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

let seq = 0;
function job(history: [JobStatus, number][], extra: Partial<Job> = {}): Job {
  const entries = history.map(([status, at]) => ({ status, at }));
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

const label = (s: JobStatus) => s.toUpperCase();

describe('jobsToGhost', () => {
  it('picks jobs left in applied longer than the threshold, counted from the status change', () => {
    const old = job([['applied', NOW - 22 * DAY]], { updatedAt: NOW - DAY });
    const fresh = job([['applied', NOW - 20 * DAY]]);
    const moved = job([
      ['applied', NOW - 40 * DAY],
      ['interview', NOW - 30 * DAY],
    ]);
    expect(jobsToGhost([old, fresh, moved], 21, NOW)).toEqual([old]);
  });

  it('uses the latest move to applied', () => {
    const back = job([
      ['applied', NOW - 40 * DAY],
      ['interview', NOW - 30 * DAY],
      ['applied', NOW - 5 * DAY],
    ]);
    expect(jobsToGhost([back], 21, NOW)).toEqual([]);
  });

  it('is off at 0', () => {
    expect(jobsToGhost([job([['applied', 0]])], 0, NOW)).toEqual([]);
  });
});

describe('reminders', () => {
  it('returns due reminders not shown yet, within the max age, oldest first', () => {
    const a = job([['applied', 0]], { followUpAt: NOW - 1000, interviewAt: NOW + DAY });
    const b = job([['interview', 0]], { interviewAt: NOW - 2000 });
    const stale = job([['applied', 0]], { followUpAt: NOW - REMINDER_MAX_AGE_MS - 1 });
    const closed = job([['rejected', 0]], { followUpAt: NOW - 1000 });
    const due = dueReminders([a, b, stale, closed], new Set(), NOW);
    expect(due.map((r) => [r.job.id, r.kind])).toEqual([
      [b.id, 'interview'],
      [a.id, 'followUp'],
    ]);
    expect(dueReminders([a, b], new Set(due.map((r) => r.key)), NOW)).toEqual([]);
  });

  it('a rescheduled reminder is due again', () => {
    const a = job([['applied', 0]], { followUpAt: NOW - 1000 });
    const [shown] = dueReminders([a], new Set(), NOW);
    const moved = { ...a, followUpAt: NOW - 500 };
    expect(dueReminders([moved], new Set([shown!.key]), NOW)).toHaveLength(1);
  });

  it('finds the next future reminder', () => {
    const a = job([['applied', 0]], { followUpAt: NOW + 5000, interviewAt: NOW + 2000 });
    const b = job([['applied', 0]], { followUpAt: NOW - 1 });
    expect(nextReminderAt([a, b], NOW)).toBe(NOW + 2000);
    expect(nextReminderAt([b], NOW)).toBeUndefined();
  });

  it('prunes shown keys that can no longer come due', () => {
    const a = job([['applied', 0]], { followUpAt: NOW - 1000 });
    const old = job([['applied', 0]], { followUpAt: NOW - REMINDER_MAX_AGE_MS - 1 });
    const keys = [
      ...dueReminders([a], new Set(), NOW),
      ...dueReminders([old], new Set(), 0, Infinity),
    ];
    const shown = new Set([...keys.map((r) => r.key), 'deleted-job:followUp:1']);
    expect(pruneShownReminders([a, old], shown, NOW)).toEqual([keys[0]!.key]);
  });
});

describe('jobSummary', () => {
  it('describes applied jobs by application date and status', () => {
    const j = job([
      ['saved', NOW - 20 * DAY],
      ['applied', NOW - 12 * DAY],
      ['interview', NOW - DAY],
    ]);
    expect(jobSummary(j, label, NOW)).toBe('Applied 12 days ago · INTERVIEW');
    expect(jobSummary(job([['applied', NOW - DAY]]), label, NOW)).toBe('Applied yesterday');
  });

  it('describes jobs not applied to by save date', () => {
    expect(jobSummary(job([['saved', NOW - 1000]]), label, NOW)).toBe('Saved today');
    const withdrawn = job([
      ['saved', NOW - 3 * DAY],
      ['withdrawn', NOW],
    ]);
    expect(jobSummary(withdrawn, label, NOW)).toBe('Saved 3 days ago · WITHDRAWN');
  });
});

describe('dailyGoalBadge', () => {
  it('shows count/goal, falls back to the count when too long, and is empty when off', () => {
    expect(dailyGoalBadge(1, 3)).toBe('1/3');
    expect(dailyGoalBadge(12, 15)).toBe('12');
    expect(dailyGoalBadge(2, 0)).toBe('');
  });
});
