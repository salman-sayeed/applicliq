import {
  type SyncErrorKind,
  createDriveClient,
  syncWithDrive,
  toSyncError,
} from '@pocket-career/core';
import { repo } from './db';
import { NotSignedInError, dropToken, getToken, isSignedIn } from './google-auth';

/**
 * Drive sync as run by the background (the one place that syncs, so two pages can't race).
 * Pages read the status from extension storage and ask for a sync with a message.
 */

export const SYNC_STATUS_KEY = 'syncStatus';
export const SYNC_DEBOUNCE_MS = 3000;

export type SyncStatus = {
  syncing: boolean;
  lastSyncedAt?: number;
  error?: { kind: SyncErrorKind; message: string; at: number };
};

export async function readSyncStatus(): Promise<SyncStatus> {
  const stored = (await browser.storage.local.get(SYNC_STATUS_KEY)) as {
    [SYNC_STATUS_KEY]?: SyncStatus;
  };
  return stored[SYNC_STATUS_KEY] ?? { syncing: false };
}

async function writeSyncStatus(patch: Partial<SyncStatus>): Promise<SyncStatus> {
  const next = { ...(await readSyncStatus()), ...patch };
  await browser.storage.local.set({ [SYNC_STATUS_KEY]: next });
  return next;
}

/** A sync cut off by the background shutting down would otherwise show "Syncing…" forever. */
export async function clearStaleSyncing(): Promise<void> {
  if ((await readSyncStatus()).syncing && !running) await writeSyncStatus({ syncing: false });
}

/** Clears the status (on sign-out), keeping nothing about the account. */
export async function resetSyncStatus(): Promise<void> {
  await browser.storage.local.remove(SYNC_STATUS_KEY);
}

const drive = createDriveClient({ getToken: () => getToken(), onUnauthorized: dropToken });

let running: Promise<boolean> | undefined;
let again = false;

/**
 * Syncs now if signed in; a request while a sync runs queues one more round afterwards, so a
 * change made mid-sync is never left out. Resolves to whether local data may have changed.
 * Never throws: failures are recorded in the status for the UI.
 */
export function runSync(): Promise<boolean> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    let pulled = false;
    do {
      again = false;
      pulled = (await syncOnce()) || pulled;
    } while (again);
    return pulled;
  })().finally(() => {
    running = undefined;
  });
  return running;
}

async function syncOnce(): Promise<boolean> {
  if (!(await isSignedIn())) return false;
  // Offline: don't count it as a failed attempt; the next trigger tries again.
  if (!navigator.onLine) {
    await writeSyncStatus({
      syncing: false,
      error: { kind: 'offline', message: 'You are offline.', at: Date.now() },
    });
    return false;
  }
  await writeSyncStatus({ syncing: true });
  try {
    await syncWithDrive(repo, drive);
    await writeSyncStatus({ syncing: false, lastSyncedAt: Date.now(), error: undefined });
    return true;
  } catch (cause) {
    const error =
      cause instanceof NotSignedInError
        ? { kind: 'auth' as const, message: cause.message }
        : toSyncError(cause);
    await writeSyncStatus({
      syncing: false,
      error: { kind: error.kind, message: error.message, at: Date.now() },
    });
    return false;
  }
}

let debounce: ReturnType<typeof setTimeout> | undefined;

/** Syncs `SYNC_DEBOUNCE_MS` after the last of a burst of changes. */
export function scheduleSync(onDone?: (pulled: boolean) => void): void {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = undefined;
    void runSync().then(onDone);
  }, SYNC_DEBOUNCE_MS);
}
