import type { DraftField } from '@career-pocket/core';

/** Messages between extension pages, the background and the injected page badge. */

/**
 * An extension page changed jobs or settings: the background updates badge and reminders and
 * syncs a few seconds later.
 */
export type JobsChangedMessage = { type: 'career-pocket:jobs-changed' };

/** The page badge asks to open a job in the dashboard. */
export type OpenJobMessage = { type: 'career-pocket:open-job'; jobId: string };

/** Background → page badge: show this job's summary, or remove the badge (`badge: null`). */
export type PageBadgeMessage = {
  type: 'career-pocket:page-badge';
  badge: {
    jobId: string;
    text: string;
    position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  } | null;
};

/** Sync with Drive now (popup opened, "Sync now", just signed in). */
export type SyncNowMessage = { type: 'career-pocket:sync-now' };

/** Popup / sidebar → picker content script: let the user click the element holding `field`. */
export type StartPickerMessage = {
  type: 'career-pocket:start-picker';
  field: DraftField;
  label: string;
};

/** Picker content script → background: the user picked this text for `field`. */
export type PickedMessage = { type: 'career-pocket:picked'; field: DraftField; text: string };

export type BackgroundMessage =
  JobsChangedMessage | OpenJobMessage | SyncNowMessage | PickedMessage;

/**
 * Wakes the background after a write, so the toolbar badge, reminder alarms and Drive sync
 * follow changes made in the popup or dashboard. Never fails the write.
 */
export function notifyJobsChanged(): void {
  const message: JobsChangedMessage = { type: 'career-pocket:jobs-changed' };
  browser.runtime.sendMessage(message).catch(() => {});
}

/** Asks the background to sync now; it records the outcome in the sync status. */
export function requestSync(): void {
  const message: SyncNowMessage = { type: 'career-pocket:sync-now' };
  browser.runtime.sendMessage(message).catch(() => {});
}
