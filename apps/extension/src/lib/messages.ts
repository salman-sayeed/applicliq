/** Messages between extension pages, the background and the injected page badge. */

/**
 * An extension page changed jobs or settings: the background updates badge and reminders and
 * syncs a few seconds later.
 */
export type JobsChangedMessage = { type: 'pocket-career:jobs-changed' };

/** The page badge asks to open a job in the dashboard. */
export type OpenJobMessage = { type: 'pocket-career:open-job'; jobId: string };

/** Background → page badge: show this job's summary, or remove the badge (`badge: null`). */
export type PageBadgeMessage = {
  type: 'pocket-career:page-badge';
  badge: { jobId: string; text: string } | null;
};

/** Sync with Drive now (popup opened, "Sync now", just signed in). */
export type SyncNowMessage = { type: 'pocket-career:sync-now' };

export type BackgroundMessage = JobsChangedMessage | OpenJobMessage | SyncNowMessage;

/**
 * Wakes the background after a write, so the toolbar badge, reminder alarms and Drive sync
 * follow changes made in the popup or dashboard. Never fails the write.
 */
export function notifyJobsChanged(): void {
  const message: JobsChangedMessage = { type: 'pocket-career:jobs-changed' };
  browser.runtime.sendMessage(message).catch(() => {});
}

/** Asks the background to sync now; it records the outcome in the sync status. */
export function requestSync(): void {
  const message: SyncNowMessage = { type: 'pocket-career:sync-now' };
  browser.runtime.sendMessage(message).catch(() => {});
}
