import {
  type Job,
  type Reminder,
  addDays,
  dueReminders,
  jobSummary,
  jobsToGhost,
  nextReminderAt,
  pruneShownReminders,
  startOfDay,
} from '@pocket-career/core';
import { STATUS_LABELS } from '@pocket-career/ui';
import { showGoalBadge } from './badge';
import { repo } from './db';
import type { PageBadgeMessage } from './messages';
import { clearStaleSyncing, runSync, scheduleSync } from './sync';
import { isSavableUrl } from './tabs';

/** Background-only work: auto-ghosting, reminders, the goal badge and the saved-job page badge. */

export const ALARM_GHOST_CHECK = 'ghost-check';
export const ALARM_SYNC = 'sync';
const ALARM_REMINDER = 'reminder';
const ALARM_MIDNIGHT = 'midnight';
const GHOST_CHECK_MINUTES = 6 * 60;
const SYNC_MINUTES = 15;

/** Keys of reminders already shown, so each one notifies once (extension storage, local). */
const SHOWN_REMINDERS_KEY = 'shownReminders';
const NOTIFICATION_PREFIX = 'pocket-career-reminder:';

/**
 * Creates the periodic alarms (6-hour ghost check, 15-minute sync) unless they exist:
 * re-creating one would restart its period.
 */
export async function ensureAlarms(): Promise<void> {
  const periodic = [
    [ALARM_GHOST_CHECK, GHOST_CHECK_MINUTES],
    [ALARM_SYNC, SYNC_MINUTES],
  ] as const;
  for (const [name, minutes] of periodic) {
    if (await browser.alarms.get(name)) continue;
    await browser.alarms.create(name, { delayInMinutes: minutes, periodInMinutes: minutes });
  }
  await clearStaleSyncing();
}

/** Syncs with Drive, then redraws what depends on the jobs if Drive brought changes. */
export async function syncAndRefresh(): Promise<void> {
  if (await runSync()) await refresh();
}

/** Syncs a few seconds after a change made here or in a page. */
export function syncSoon(): void {
  scheduleSync((pulled) => {
    if (pulled) void refresh();
  });
}

let queue: Promise<void> = Promise.resolve();

/**
 * Brings derived state up to date: optionally ghosts stale applications, then shows due
 * reminders, schedules the next one and redraws the goal badge. Runs one at a time, so
 * overlapping triggers can't show a reminder twice.
 */
export function refresh({ ghost = false } = {}): Promise<void> {
  queue = queue
    .then(async () => {
      if (ghost) await autoGhost();
      const jobs = await repo.getJobs();
      await Promise.all([checkReminders(jobs), showGoalBadge(jobs)]);
      // Today's count starts over at midnight.
      await browser.alarms.create(ALARM_MIDNIGHT, { when: addDays(startOfDay(Date.now()), 1) });
    })
    .catch((error: unknown) => console.error('Pocket Career: background refresh failed', error));
  return queue;
}

/** Marks jobs left in `applied` longer than `settings.ghostedAfterDays` as ghosted. */
async function autoGhost(): Promise<void> {
  const [jobs, settings] = await Promise.all([repo.getJobs(), repo.getSettings()]);
  const stale = jobsToGhost(jobs, settings.ghostedAfterDays, Date.now());
  for (const job of stale) {
    try {
      await repo.updateJob(job.id, { status: 'ghosted' });
    } catch {
      // Deleted meanwhile (e.g. from the dashboard): nothing to mark.
    }
  }
  if (stale.length > 0) syncSoon();
}

async function checkReminders(jobs: readonly Job[]): Promise<void> {
  const now = Date.now();
  const stored = (await browser.storage.local.get(SHOWN_REMINDERS_KEY)) as {
    [SHOWN_REMINDERS_KEY]?: string[];
  };
  const shown = new Set(stored[SHOWN_REMINDERS_KEY] ?? []);

  for (const reminder of dueReminders(jobs, shown, now)) {
    await showReminder(reminder);
    shown.add(reminder.key);
  }
  await browser.storage.local.set({
    [SHOWN_REMINDERS_KEY]: pruneShownReminders(jobs, shown, now),
  });

  const next = nextReminderAt(jobs, now);
  if (next === undefined) await browser.alarms.clear(ALARM_REMINDER);
  else await browser.alarms.create(ALARM_REMINDER, { when: next });
}

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

async function showReminder({ kind, job, at }: Reminder): Promise<void> {
  const title = kind === 'interview' ? `Interview: ${job.title}` : `Follow up: ${job.title}`;
  const message =
    kind === 'interview' ? `${job.company} · ${timeFormat.format(at)}` : `${job.company}`;
  try {
    await browser.notifications.create(`${NOTIFICATION_PREFIX}${job.id}:${kind}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title,
      message,
    });
  } catch (error) {
    console.error('Pocket Career: could not show a reminder', error);
  }
}

/** The job a reminder notification is about, or undefined for other notifications. */
export function jobIdFromNotification(notificationId: string): string | undefined {
  if (!notificationId.startsWith(NOTIFICATION_PREFIX)) return undefined;
  return notificationId.slice(NOTIFICATION_PREFIX.length).split(':')[0] || undefined;
}

/**
 * Shows the saved-job badge in a tab whose URL matches a saved job, or removes it when the tab
 * moved on. `url` is only known with the all-sites permission; without it this does nothing.
 */
export async function updatePageBadge(tabId: number, url: string | undefined): Promise<void> {
  if (!isSavableUrl(url)) return;
  const job = await repo.getJobByUrl(url);
  if (!job) {
    // Only reaches tabs where the badge script was injected earlier (in-page navigation).
    await sendPageBadge(tabId, null);
    return;
  }
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/job-badge.js'],
    });
  } catch {
    return; // Page can't be scripted (store pages, PDFs) or the tab went away.
  }
  await sendPageBadge(tabId, {
    jobId: job.id,
    text: jobSummary(job, (s) => STATUS_LABELS[s], Date.now()),
  });
}

async function sendPageBadge(tabId: number, badge: PageBadgeMessage['badge']): Promise<void> {
  const message: PageBadgeMessage = { type: 'pocket-career:page-badge', badge };
  await browser.tabs.sendMessage(tabId, message).catch(() => {});
}
