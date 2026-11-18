import type { Job } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** When the job was last moved to `applied`, if ever. */
export function lastAppliedAt(job: Job): number | undefined {
  for (let i = job.history.length - 1; i >= 0; i--) {
    const entry = job.history[i]!;
    if (entry.status === 'applied') return entry.at;
  }
  return undefined;
}

/** Whole calendar-agnostic days between two timestamps (0 = within the last 24h). */
export function daysSince(at: number, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - at) / DAY_MS));
}

export type RecentApplication = { job: Job; appliedAt: number; days: number };

/** The most recent application among `jobs` (e.g. other jobs at the same company). */
export function mostRecentApplication(
  jobs: readonly Job[],
  now: number = Date.now(),
): RecentApplication | undefined {
  let best: RecentApplication | undefined;
  for (const job of jobs) {
    const appliedAt = lastAppliedAt(job);
    if (appliedAt !== undefined && (!best || appliedAt > best.appliedAt)) {
      best = { job, appliedAt, days: daysSince(appliedAt, now) };
    }
  }
  return best;
}
