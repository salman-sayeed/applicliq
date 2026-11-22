import { type DraftStorageArea, createDraftStore } from '@career-pocket/core';
import { actionApi } from './tabs';

export {
  type Draft,
  type DraftField,
  DRAFT_FIELD_LABELS,
  draftFrom,
  isDraftValid,
  setDraftField,
  toNewJob,
} from '@career-pocket/core';

/**
 * Unsaved save-form state per page, so picking text on the page (which closes the popup) loses
 * nothing. `storage.session` lives in memory until the browser closes; where a browser lacks it
 * (older Firefox) `storage.local` is used, and drafts there still expire after 24 hours.
 */
const area = (browser.storage.session ?? browser.storage.local) as unknown as DraftStorageArea;

export const drafts = createDraftStore(area);

/** The storage area drafts live in, to watch for changes (`storage.onChanged`). */
export const DRAFT_AREA = browser.storage.session ? 'session' : 'local';

/** Toolbar badge "•" on this tab: a draft is waiting there. */
export async function showDraftBadge(tabId: number): Promise<void> {
  await actionApi.setBadgeText({ tabId, text: '•' }).catch(() => {});
}

/** Drops the tab's own badge, so it shows the global (goal) badge again. */
export async function clearDraftBadge(tabId: number): Promise<void> {
  // `null` with a tabId resets that tab to the global text (Chrome and Firefox).
  await actionApi.setBadgeText({ tabId, text: null as unknown as string }).catch(() => {});
}
