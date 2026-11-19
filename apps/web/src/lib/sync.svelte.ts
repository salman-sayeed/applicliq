import './legacy-keys.ts';
import {
  DEFAULT_SETTINGS,
  CareerPocketDB,
  type SyncErrorKind,
  createDriveClient,
  createJobRepository,
  deleteDriveData,
  syncWithDrive,
  toSyncError,
} from '@career-pocket/core';
import type { DashboardAdapter, SyncMenuStatus } from '@career-pocket/ui';
import { NotSignedInError, dropToken, getToken, isSignedIn } from './google-auth.ts';

/**
 * The web dashboard's data: IndexedDB is the source of truth for the UI (works offline), and
 * Drive sync reconciles it in the background: on load, 3 s after a change, every
 * `syncIntervalMinutes` (settings), when the tab comes back to the foreground and when the
 * connection returns. A Web Lock keeps two tabs from syncing at once.
 */

export const db = new CareerPocketDB();
export const repo = createJobRepository(db);

const LAST_SYNCED_KEY = 'career-pocket:last-synced';
const ACCOUNT_KEY = 'career-pocket:account';
const DEBOUNCE_MS = 3000;
/** A tab coming back to the foreground syncs if the last sync is older than this. */
const STALE_MS = 60_000;

function readStored(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeStored(key: string, value: string | undefined): void {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not remembered across reloads; harmless.
  }
}

export const sync = $state<SyncMenuStatus & { signedIn: boolean; account?: string }>({
  syncing: false,
  signedIn: isSignedIn(),
  lastSyncedAt: Number(readStored(LAST_SYNCED_KEY)) || undefined,
  account: readStored(ACCOUNT_KEY),
});

function setError(kind: SyncErrorKind, message: string) {
  sync.error = { kind, message };
}

const drive = createDriveClient({
  getToken: () => getToken(),
  onUnauthorized: async () => dropToken(),
});

let running: Promise<void> | undefined;
let again = false;

/**
 * Syncs now if signed in. A request during a sync queues one more round, so a change made
 * mid-sync is never left out. Never throws: failures land in `sync.error` for the menu.
 */
export function runSync(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await syncOnce();
    } while (again);
  })().finally(() => {
    running = undefined;
  });
  return running;
}

function withSyncLock(task: () => Promise<void>): Promise<void> {
  return navigator.locks ? navigator.locks.request('career-pocket-sync', task) : task();
}

async function syncOnce(): Promise<void> {
  sync.signedIn = isSignedIn();
  if (!sync.signedIn) return;
  if (!navigator.onLine) return setError('offline', 'You are offline.');
  sync.syncing = true;
  try {
    await withSyncLock(() => syncWithDrive(repo, drive).then(() => {}));
    sync.lastSyncedAt = Date.now();
    sync.error = undefined;
    writeStored(LAST_SYNCED_KEY, String(sync.lastSyncedAt));
    if (!sync.account) {
      sync.account = await drive.accountEmail().catch(() => undefined);
      writeStored(ACCOUNT_KEY, sync.account);
    }
  } catch (cause) {
    const error =
      cause instanceof NotSignedInError
        ? { kind: 'auth' as const, message: cause.message }
        : toSyncError(cause);
    setError(error.kind, error.message);
  } finally {
    sync.syncing = false;
  }
}

let debounce: ReturnType<typeof setTimeout> | undefined;

/** Syncs `DEBOUNCE_MS` after the last of a burst of changes. */
export function scheduleSync(): void {
  clearTimeout(debounce);
  debounce = setTimeout(() => void runSync(), DEBOUNCE_MS);
}

/** Starts the background triggers; returns a stop function. Call once the dashboard shows. */
export function startAutoSync(): () => void {
  void runSync();
  // The period follows the sync interval setting, which may change on another device.
  let minutes = DEFAULT_SETTINGS.sync.syncIntervalMinutes;
  let timer = setInterval(() => void runSync(), minutes * 60_000);
  const stopWatching = repo.watchSettings((settings) => {
    if (settings.sync.syncIntervalMinutes === minutes) return;
    minutes = settings.sync.syncIntervalMinutes;
    clearInterval(timer);
    timer = setInterval(() => void runSync(), minutes * 60_000);
  });
  const onOnline = () => void runSync();
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    if (!sync.lastSyncedAt || Date.now() - sync.lastSyncedAt > STALE_MS) void runSync();
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopWatching();
    clearInterval(timer);
    clearTimeout(debounce);
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Clears this browser's copy (on sign-out): the site may be on a shared computer. */
export async function clearLocalData(): Promise<void> {
  await repo.clearLocalData();
  sync.lastSyncedAt = undefined;
  sync.error = undefined;
  sync.account = undefined;
  writeStored(LAST_SYNCED_KEY, undefined);
  writeStored(ACCOUNT_KEY, undefined);
}

/** Deletes the Career Pocket file from Drive (settings page). The caller then signs out. */
export async function deleteRemoteData(): Promise<void> {
  await deleteDriveData(drive);
}

/** Runs a write, then schedules a sync. */
function syncing<A extends unknown[], R>(write: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    const result = await write(...args);
    scheduleSync();
    return result;
  };
}

/** The shared dashboard and settings page read and write IndexedDB through the repository. */
export const dashboardAdapter: DashboardAdapter = {
  watchJobs: repo.watchJobs,
  updateJob: syncing(repo.updateJob),
  deleteJob: syncing(repo.deleteJob),
  restoreJob: syncing(repo.restoreJob),
  watchSettings: repo.watchSettings,
  updateSettings: syncing(repo.updateSettings),
  resetSettingsSection: syncing(repo.resetSettingsSection),
  renameTag: syncing(repo.renameTag),
  getLocalState: repo.getLocalState,
  setLocalState: repo.setLocalState,
};
