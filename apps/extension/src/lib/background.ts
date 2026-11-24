import {
  type Job,
  type Reminder,
  type ReminderOptions,
  type Settings,
  addDays,
  dayKey,
  WEEK_DAYS,
  WEEK_START_INDEX,
  dueReminders,
  inQuietHours,
  isHelperEnabled,
  isWeeklyRecapEnabled,
  lastWeeklyTime,
  nextWeeklyTime,
  redFlags,
  weeklyRecap,
  weeklyRecapText,
  jobSummary,
  jobsToGhost,
  nextReminderAt,
  nextTimeOfDay,
  pageBadgeAllowed,
  pruneShownReminders,
  quietHoursEnd,
  startOfDay,
  statusLabel,
} from '@applicliq/core';
import { STATUS_LABELS } from '@applicliq/ui';
import { showGoalBadge, todayProgress } from './badge';
import { openDashboard } from './config';
import { repo } from './db';
import type { PageBadgeMessage } from './messages';
import { hasPageAccess } from './page-access';
import { clearStaleSyncing, runSync, scheduleSync } from './sync';
import { extractFromTab, isSavableUrl } from './tabs';

/** Background-only work: auto-ghosting, reminders, the goal badge and the saved-job page badge. */

export const ALARM_GHOST_CHECK = 'ghost-check';
export const ALARM_SYNC = 'sync';
const ALARM_REMINDER = 'reminder';
const ALARM_GOAL_REMINDER = 'goal-reminder';
const ALARM_MIDNIGHT = 'midnight';
const ALARM_WEEKLY_RECAP = 'weekly-recap';
const GHOST_CHECK_MINUTES = 6 * 60;

/** Keys of reminders already shown, so each one notifies once (extension storage, local). */
const SHOWN_REMINDERS_KEY = 'shownReminders';
/** The day (`dayKey`) the daily goal reminder last ran, so it nudges at most once a day. */
const GOAL_REMINDER_DAY_KEY = 'goalReminderDay';
// Kept from the Career Pocket days: renaming it would stop clicks on notifications shown before an update from
// opening their job.
const NOTIFICATION_PREFIX = 'career-pocket-reminder:';
const GOAL_NOTIFICATION_ID = 'career-pocket-goal';
const RECAP_NOTIFICATION_ID = 'applicliq-weekly-recap';
/** When the weekly recap last showed (the `lastWeeklyTime` it was for). */
const RECAP_SHOWN_KEY = 'weeklyRecapShownFor';
/** A recap more than this late (browser closed all week) isn't shown. */
const RECAP_MAX_LATE_MS = 24 * 60 * 60 * 1000;

/**
 * Creates the periodic alarms (6-hour ghost check, sync every `syncIntervalMinutes`) unless they
 * exist with that period: re-creating one would restart it.
 */
export async function ensureAlarms(settings?: Settings): Promise<void> {
  const { sync } = settings ?? (await repo.getSettings());
  const periodic = [
    [ALARM_GHOST_CHECK, GHOST_CHECK_MINUTES],
    [ALARM_SYNC, sync.syncIntervalMinutes],
  ] as const;
  for (const [name, minutes] of periodic) {
    if ((await browser.alarms.get(name))?.periodInMinutes === minutes) continue;
    await browser.alarms.create(name, { delayInMinutes: minutes, periodInMinutes: minutes });
  }
  await clearStaleSyncing();
}

/**
 * The page badge needs the optional all-sites permission, which can be removed outside the
 * settings page (the browser's extension settings), so the badge turns off with it.
 */
export async function reconcilePageBadge(): Promise<void> {
  const [access, settings] = await Promise.all([hasPageAccess(), repo.getSettings()]);
  // Only turns the badge off: the sidebar can also be why the access was granted.
  if (!access && settings.jobPages.showBadge) {
    await repo.updateSettings({ jobPages: { showBadge: false } });
  }
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
      const [jobs, settings] = await Promise.all([repo.getJobs(), repo.getSettings()]);
      await Promise.all([
        checkReminders(jobs, settings),
        checkGoalReminder(jobs, settings),
        checkWeeklyRecap(jobs, settings),
        showGoalBadge(jobs, settings),
        ensureAlarms(settings),
      ]);
      // Today's count starts over at midnight.
      await browser.alarms.create(ALARM_MIDNIGHT, { when: addDays(startOfDay(Date.now()), 1) });
    })
    .catch((error: unknown) => console.error('AppliCliq: background refresh failed', error));
  return queue;
}

/** Marks jobs left in `applied` longer than `settings.ghostedAfterDays` as ghosted. */
async function autoGhost(): Promise<void> {
  const [jobs, settings] = await Promise.all([repo.getJobs(), repo.getSettings()]);
  const stale = jobsToGhost(jobs, settings.automation.ghostedAfterDays, Date.now());
  for (const job of stale) {
    try {
      await repo.updateJob(job.id, { status: 'ghosted' });
    } catch {
      // Deleted meanwhile (e.g. from the dashboard): nothing to mark.
    }
  }
  if (stale.length > 0) syncSoon();
}

async function checkReminders(jobs: readonly Job[], settings: Settings): Promise<void> {
  const now = Date.now();
  const { followUpReminders, interviewReminderOffset, quietHours } = settings.notifications;
  const options: ReminderOptions = {
    followUps: followUpReminders,
    interviewOffsetMinutes: interviewReminderOffset,
    // Offer deadlines are reminders like follow-ups: they follow the same switch.
    offerDeadlines: followUpReminders && isHelperEnabled(settings, 'offers'),
  };

  // In quiet hours nothing shows; due reminders wait for the window to end.
  if (inQuietHours(now, quietHours)) {
    await browser.alarms.create(ALARM_REMINDER, { when: quietHoursEnd(now, quietHours) });
    return;
  }

  const stored = (await browser.storage.local.get(SHOWN_REMINDERS_KEY)) as {
    [SHOWN_REMINDERS_KEY]?: string[];
  };
  const shown = new Set(stored[SHOWN_REMINDERS_KEY] ?? []);

  for (const reminder of dueReminders(jobs, shown, now, undefined, options)) {
    await showReminder(reminder, settings);
    shown.add(reminder.key);
  }
  await browser.storage.local.set({
    [SHOWN_REMINDERS_KEY]: pruneShownReminders(jobs, shown, now, undefined, options),
  });

  const next = nextReminderAt(jobs, now, options);
  if (next === undefined) await browser.alarms.clear(ALARM_REMINDER);
  else await browser.alarms.create(ALARM_REMINDER, { when: next });
}

/**
 * The daily goal nudge: once a day, from the set time until midnight, if today's goal isn't met.
 * Waits out quiet hours. Schedules its own next check.
 */
async function checkGoalReminder(jobs: readonly Job[], settings: Settings): Promise<void> {
  const now = Date.now();
  const time = settings.notifications.dailyGoalReminder;
  const goal = settings.goals.daily;
  if (!time || !goal) {
    await browser.alarms.clear(ALARM_GOAL_REMINDER);
    return;
  }
  const today = startOfDay(now);
  const dueToday = nextTimeOfDay(today - 1, time);
  const stored = (await browser.storage.local.get(GOAL_REMINDER_DAY_KEY)) as {
    [GOAL_REMINDER_DAY_KEY]?: string;
  };
  let next = nextTimeOfDay(now, time);

  if (now >= dueToday && stored[GOAL_REMINDER_DAY_KEY] !== dayKey(now)) {
    const quiet = settings.notifications.quietHours;
    if (inQuietHours(now, quiet)) {
      const end = quietHoursEnd(now, quiet);
      if (end < addDays(today, 1)) next = end;
    } else {
      const { count } = todayProgress(jobs, settings);
      if (count < goal) await showGoalReminder(goal - count, goal);
      await browser.storage.local.set({ [GOAL_REMINDER_DAY_KEY]: dayKey(now) });
    }
  }
  await browser.alarms.create(ALARM_GOAL_REMINDER, { when: next });
}

/**
 * The weekly recap (Insights): once a week at the chosen day and time, unless it's more than a
 * day late. Waits out quiet hours. Schedules its own next check.
 */
async function checkWeeklyRecap(jobs: readonly Job[], settings: Settings): Promise<void> {
  if (!isWeeklyRecapEnabled(settings)) {
    await browser.alarms.clear(ALARM_WEEKLY_RECAP);
    return;
  }
  const now = Date.now();
  const { weeklyRecapDay, weeklyRecapTime } = settings.insights;
  const day = WEEK_DAYS.indexOf(weeklyRecapDay);
  const due = lastWeeklyTime(now, day, weeklyRecapTime);
  let next = nextWeeklyTime(now, day, weeklyRecapTime);
  const stored = (await browser.storage.local.get(RECAP_SHOWN_KEY)) as {
    [RECAP_SHOWN_KEY]?: number;
  };
  if (stored[RECAP_SHOWN_KEY] !== due && now - due < RECAP_MAX_LATE_MS) {
    const quiet = settings.notifications.quietHours;
    if (inQuietHours(now, quiet)) {
      const end = quietHoursEnd(now, quiet);
      if (end - due < RECAP_MAX_LATE_MS) next = Math.min(next, end);
    } else {
      const recap = weeklyRecap(
        jobs,
        settings.goals,
        now,
        WEEK_START_INDEX[settings.goals.weekStartsOn],
      );
      await showNotification(RECAP_NOTIFICATION_ID, weeklyRecapText(recap));
      await browser.storage.local.set({ [RECAP_SHOWN_KEY]: due });
    }
  }
  await browser.alarms.create(ALARM_WEEKLY_RECAP, { when: next });
}

async function showNotification(
  id: string,
  { title, message }: { title: string; message: string },
) {
  try {
    await browser.notifications.create(id, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title,
      message,
    });
  } catch (error) {
    console.error('AppliCliq: could not show a notification', error);
  }
}

/** Opens Insights for a click on the weekly recap; false for other notifications. */
export function handleRecapNotificationClick(notificationId: string): boolean {
  if (notificationId !== RECAP_NOTIFICATION_ID) return false;
  void openDashboard(undefined, { view: 'insights' });
  void browser.notifications.clear(notificationId);
  return true;
}

async function showGoalReminder(left: number, goal: number): Promise<void> {
  try {
    await browser.notifications.create(GOAL_NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title: `${left} more application${left === 1 ? '' : 's'} to reach today's goal`,
      message: `Your daily goal is ${goal}. Open AppliCliq to see your saved jobs.`,
    });
  } catch (error) {
    console.error('AppliCliq: could not show the goal reminder', error);
  }
}

/** Opens the dashboard for a click on the goal reminder; false for other notifications. */
export function handleGoalNotificationClick(notificationId: string): boolean {
  if (notificationId !== GOAL_NOTIFICATION_ID) return false;
  void openDashboard();
  void browser.notifications.clear(notificationId);
  return true;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

async function showReminder({ kind, job }: Reminder, settings: Settings): Promise<void> {
  const title =
    kind === 'interview'
      ? `Interview: ${job.title}`
      : kind === 'offerDeadline'
        ? `Offer deadline tomorrow: ${job.title}`
        : `Follow up: ${job.title}`;
  const label = statusLabel(settings, job.status, STATUS_LABELS[job.status]);
  const when =
    kind === 'interview'
      ? job.interviewAt
      : kind === 'offerDeadline'
        ? job.offer?.deadline
        : undefined;
  const message =
    when !== undefined
      ? `${job.company} · ${timeFormat.format(when)}`
      : `${job.company} · ${label}`;
  try {
    await browser.notifications.create(`${NOTIFICATION_PREFIX}${job.id}:${kind}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title,
      message,
    });
  } catch (error) {
    console.error('AppliCliq: could not show a reminder', error);
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
  const settings = await repo.getSettings();
  const job = pageBadgeAllowed(settings, url) ? await repo.getJobByUrl(url) : undefined;
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
    text: jobSummary(job, (s) => statusLabel(settings, s, STATUS_LABELS[s]), Date.now()),
    position: settings.jobPages.badgePosition,
    notes: await badgeNotes(tabId, job, settings),
  });
}

/** The "Heads up" notes for the badge (Smart helpers → Heads up), read from the page. */
async function badgeNotes(tabId: number, job: Job, settings: Settings): Promise<string[]> {
  if (!isHelperEnabled(settings, 'redFlags')) return [];
  // The badge already has access to the page (the all-sites permission it needs).
  const extracted = await extractFromTab(tabId);
  return redFlags({
    posting: extracted?.posting,
    job,
    jobs: await repo.getJobs(),
    oldPostingDays: settings.helpers.oldPostingDays,
    appliedBeforeDays: settings.helpers.appliedBeforeDays,
    pageRead: extracted !== undefined,
  }).map((flag) => flag.text);
}

async function sendPageBadge(tabId: number, badge: PageBadgeMessage['badge']): Promise<void> {
  const message: PageBadgeMessage = { type: 'applicliq:page-badge', badge };
  await browser.tabs.sendMessage(tabId, message).catch(() => {});
}
