import type { SyncErrorKind } from '@applicliq/core';

/**
 * The sync status the background records in extension storage. Kept apart from the sync code
 * so the popup and the toolbar badge can read it without loading the Drive client.
 */

export const SYNC_STATUS_KEY = 'syncStatus';

export type SyncStatus = {
  syncing: boolean;
  lastSyncedAt?: number;
  /** The Google account's email, fetched once after sign-in for the settings page. */
  account?: string;
  /** Whether Drive holds the data encrypted, as of the last sync. */
  encrypted?: boolean;
  error?: { kind: SyncErrorKind; message: string; at: number };
};

export async function readSyncStatus(): Promise<SyncStatus> {
  const stored = (await browser.storage.local.get(SYNC_STATUS_KEY)) as {
    [SYNC_STATUS_KEY]?: SyncStatus;
  };
  return stored[SYNC_STATUS_KEY] ?? { syncing: false };
}

/** Encrypted sync is on and this device has no key: sync is paused until it is unlocked. */
export const isLocked = (status: SyncStatus | undefined): boolean =>
  status?.error?.kind === 'locked';
