import type { DraftField } from '@applicliq/core';

/** Messages between extension pages, the background and the injected page badge. */

/**
 * An extension page changed jobs or settings: the background updates badge and reminders and
 * syncs a few seconds later.
 */
export type JobsChangedMessage = { type: 'applicliq:jobs-changed' };

/** The page badge asks to open a job in the dashboard. */
export type OpenJobMessage = { type: 'applicliq:open-job'; jobId: string };

/** Background → page badge: show this job's summary, or remove the badge (`badge: null`). */
export type PageBadgeMessage = {
  type: 'applicliq:page-badge';
  badge: {
    jobId: string;
    text: string;
    position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    /** "Heads up" notes (Smart helpers); empty or missing for none. */
    notes?: string[];
  } | null;
};

/** Sync with Drive now (popup opened, "Sync now", just signed in). */
export type SyncNowMessage = { type: 'applicliq:sync-now' };

/** Popup / sidebar → picker content script: let the user click the element holding `field`. */
export type StartPickerMessage = {
  type: 'applicliq:start-picker';
  field: DraftField;
  label: string;
};

/** Picker content script → background: the user picked this text for `field`. */
export type PickedMessage = { type: 'applicliq:picked'; field: DraftField; text: string };

// --- Autofill -------------------------------------------------------------------------------

/** Popup → background: a form in this tab was filled for this job (for "Mark as applied?"). */
export type AutofillFilledMessage = {
  type: 'applicliq:autofill-filled';
  tabId: number;
  jobId?: string;
};

/** Page → popup: the form shows a new page of questions ("Fill this page"). */
export type AutofillPageMessage = { type: 'applicliq:autofill-page'; url: string };

/** Page → background: the "application sent" page is showing in this tab. */
export type AutofillConfirmedMessage = { type: 'applicliq:autofill-confirmed' };

/** Background's answer: ask "Mark as applied?", say it was done, or nothing to do. */
export type AutofillConfirmedReply =
  { action: 'ask'; jobName: string } | { action: 'done'; jobName: string } | { action: 'none' };

/** Page → background: the user said Yes to "Mark as applied?". */
export type AutofillMarkAppliedMessage = { type: 'applicliq:autofill-mark-applied' };

/** Page → background: "Save this answer for next time?" → Save. */
export type AutofillSaveAnswerMessage = {
  type: 'applicliq:autofill-save-answer';
  question: string;
  answer: string;
};

/** Floating button → background: the user clicked "Autofill with AppliCliq". */
export type AutofillButtonMessage = { type: 'applicliq:autofill-button' };

/**
 * Background's answer to the button: fill now with these (preview skipped), or the popup was
 * opened, or it couldn't be.
 */
export type AutofillButtonReply =
  | {
      action: 'fill';
      profile: import('@applicliq/core').AutofillProfile;
      answers: import('@applicliq/core').SavedAnswer[];
      eeo: import('@applicliq/core').EeoChoice;
      offerToSaveAnswers: boolean;
    }
  | { action: 'opened' }
  | { action: 'open-toolbar' }
  | { action: 'empty-profile' };

export type BackgroundMessage =
  | JobsChangedMessage
  | OpenJobMessage
  | SyncNowMessage
  | PickedMessage
  | AutofillFilledMessage
  | AutofillConfirmedMessage
  | AutofillMarkAppliedMessage
  | AutofillSaveAnswerMessage
  | AutofillButtonMessage;

/**
 * Wakes the background after a write, so the toolbar badge, reminder alarms and Drive sync
 * follow changes made in the popup or dashboard. Never fails the write.
 */
export function notifyJobsChanged(): void {
  const message: JobsChangedMessage = { type: 'applicliq:jobs-changed' };
  browser.runtime.sendMessage(message).catch(() => {});
}

/** Asks the background to sync now; it records the outcome in the sync status. */
export function requestSync(): void {
  const message: SyncNowMessage = { type: 'applicliq:sync-now' };
  browser.runtime.sendMessage(message).catch(() => {});
}
