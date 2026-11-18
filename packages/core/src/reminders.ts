import { daysSince, lastAppliedAt } from './history';
import type { QuietHours, TimeOfDay, ToolbarBadgeMode } from './settings';
import { firstAppliedAt } from './stats';
import type { Job, JobStatus } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------------------------
// Auto-ghosting

/**
 * Jobs still `applied` more than `afterDays` days after they were (last) moved to `applied`.
 * Measured from the status change, so editing notes doesn't reset the clock. null or 0 turns it
 * off.
 */
export function jobsToGhost(jobs: readonly Job[], afterDays: number | null, now: number): Job[] {
  if (afterDays === null || !(afterDays > 0)) return [];
  const cutoff = now - afterDays * DAY_MS;
  return jobs.filter((job) => {
    if (job.status !== 'applied') return false;
    const since = lastAppliedAt(job) ?? job.updatedAt;
    return since < cutoff;
  });
}

// ---------------------------------------------------------------------------------------------
// Follow-up and interview reminders

export type ReminderKind = 'followUp' | 'interview';

export type Reminder = {
  /** Stable per job, kind and due time: rescheduling a reminder makes it due again. */
  key: string;
  kind: ReminderKind;
  job: Job;
  /** When to notify (for interviews, `interviewAt` minus the offset). */
  at: number;
};

/** The notification settings that decide which reminders exist. */
export type ReminderOptions = {
  /** Default true. */
  followUps?: boolean;
  /** Minutes before an interview; null = no interview reminders. Default 0 (at the time). */
  interviewOffsetMinutes?: number | null;
};

/** Reminders older than this are dropped rather than shown late (e.g. browser closed a week). */
export const REMINDER_MAX_AGE_MS = 3 * DAY_MS;

/** Finished jobs don't need follow-ups or interview reminders. */
const CLOSED: readonly JobStatus[] = ['rejected', 'withdrawn'];

function reminderKey(jobId: string, kind: ReminderKind, at: number): string {
  return `${jobId}:${kind}:${at}`;
}

/** Every reminder set on an open job, due or not. */
export function allReminders(
  jobs: readonly Job[],
  { followUps = true, interviewOffsetMinutes = 0 }: ReminderOptions = {},
): Reminder[] {
  const reminders: Reminder[] = [];
  for (const job of jobs) {
    if (CLOSED.includes(job.status)) continue;
    if (followUps && job.followUpAt !== undefined) {
      const at = job.followUpAt;
      reminders.push({ key: reminderKey(job.id, 'followUp', at), kind: 'followUp', job, at });
    }
    if (interviewOffsetMinutes !== null && job.interviewAt !== undefined) {
      const at = job.interviewAt - interviewOffsetMinutes * 60_000;
      reminders.push({ key: reminderKey(job.id, 'interview', at), kind: 'interview', job, at });
    }
  }
  return reminders;
}

/**
 * Reminders that came due at most `maxAge` ago and haven't been shown yet (`shown` holds keys),
 * oldest first.
 */
export function dueReminders(
  jobs: readonly Job[],
  shown: ReadonlySet<string>,
  now: number,
  maxAge: number = REMINDER_MAX_AGE_MS,
  options?: ReminderOptions,
): Reminder[] {
  return allReminders(jobs, options)
    .filter((r) => r.at <= now && r.at > now - maxAge && !shown.has(r.key))
    .sort((a, b) => a.at - b.at);
}

/** When the next reminder comes due, if any is set in the future. */
export function nextReminderAt(
  jobs: readonly Job[],
  now: number,
  options?: ReminderOptions,
): number | undefined {
  let next: number | undefined;
  for (const { at } of allReminders(jobs, options)) {
    if (at > now && (next === undefined || at < next)) next = at;
  }
  return next;
}

/**
 * Of the `shown` keys, those still worth remembering: reminders that are still in their due
 * window. Older ones can't be due again, so the stored set doesn't grow forever.
 */
export function pruneShownReminders(
  jobs: readonly Job[],
  shown: ReadonlySet<string>,
  now: number,
  maxAge: number = REMINDER_MAX_AGE_MS,
  options?: ReminderOptions,
): string[] {
  return allReminders(jobs, options)
    .filter((r) => shown.has(r.key) && r.at > now - maxAge)
    .map((r) => r.key);
}

// ---------------------------------------------------------------------------------------------
// Short summaries

/** "today", "yesterday", "3 days ago". */
export function daysAgoLabel(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/**
 * One line about where a saved job stands, e.g. "Applied 12 days ago · Interview" or
 * "Saved yesterday". `statusLabel` turns a status into display text.
 */
export function jobSummary(job: Job, statusLabel: (s: JobStatus) => string, now: number): string {
  const applied = firstAppliedAt(job);
  const lead =
    applied === undefined
      ? `Saved ${daysAgoLabel(daysSince(job.createdAt, now))}`
      : `Applied ${daysAgoLabel(daysSince(applied, now))}`;
  const shownStatus = applied === undefined ? 'saved' : 'applied';
  return job.status === shownStatus ? lead : `${lead} · ${statusLabel(job.status)}`;
}

/** Toolbar badge for today's applications against the daily goal: "1/3", or "" when off. */
export function dailyGoalBadge(count: number, goal: number): string {
  if (!(goal > 0)) return '';
  const text = `${count}/${goal}`;
  // Badges fit about 4 characters.
  return text.length <= 4 ? text : String(count);
}

/**
 * The toolbar badge for a `toolbarBadge` setting: `goal` shows "1/3" (just the count when the
 * daily goal is off), `today` shows today's count (nothing at 0), `off` shows nothing.
 */
export function toolbarBadgeText(mode: ToolbarBadgeMode, count: number, goal: number): string {
  if (mode === 'off') return '';
  if (mode === 'goal' && goal > 0) return dailyGoalBadge(count, goal);
  return count > 0 ? String(Math.min(count, 9999)) : '';
}

// ---------------------------------------------------------------------------------------------
// Times of day and quiet hours (local time)

const minutesOf = (time: TimeOfDay) => {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

/** The next moment (after `now`) the local clock reads `time`. */
export function nextTimeOfDay(now: number, time: TimeOfDay): number {
  const minutes = minutesOf(time);
  const d = new Date(now);
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes).getTime();
  if (today > now) return today;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, minutes).getTime();
}

/** Whether `now` falls in the quiet window; the window may cross midnight (22:00–07:00). */
export function inQuietHours(now: number, quiet: QuietHours | null): boolean {
  if (!quiet) return false;
  const d = new Date(now);
  const current = d.getHours() * 60 + d.getMinutes();
  const start = minutesOf(quiet.start);
  const end = minutesOf(quiet.end);
  return start < end ? current >= start && current < end : current >= start || current < end;
}

/** When notifications may show again: `now` outside quiet hours, else the window's end. */
export function quietHoursEnd(now: number, quiet: QuietHours | null): number {
  return inQuietHours(now, quiet) && quiet ? nextTimeOfDay(now, quiet.end) : now;
}
