import {
  PocketCareerDB,
  type SyncErrorKind,
  createDriveClient,
  createJobRepository,
  syncWithDrive,
  toSyncError,
} from '@pocket-career/core';
import type { DashboardAdapter, SyncMenuStatus } from '@pocket-career/ui';
import { NotSignedInError, dropToken, getToken, isSignedIn } from './google-auth.ts';

/**
 * The web dashboard's data: IndexedDB is the source of truth for the UI (works offline), and
 * Drive sync reconciles it in the background: on load, 3 s after a change, every 15 minutes, when
 * the tab comes back to the foreground and when the connection returns. A Web Lock keeps two tabs
 * from syncing at once.
 */

export const db = new PocketCareerDB();
export const repo = createJobRepository(db);

const LAST_SYNCED_KEY = 'pocket-career:last-synced';
const DEBOUNCE_MS = 3000;
const PERIOD_MS = 15 * 60_000;
/** A tab coming back to the foreground syncs if the last sync is older than this. */
const STALE_MS = 60_000;

function readLastSynced(): number | undefined {
  try {
    return Number(localStorage.getItem(LAST_SYNCED_KEY)) || undefined;
  } catch {
    return undefined;
  }
}

export const sync = $state<SyncMenuStatus & { signedIn: boolean }>({
  syncing: false,
  signedIn: isSignedIn(),
  lastSyncedAt: readLastSynced(),
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
  return navigator.locks ? navigator.locks.request('pocket-career-sync', task) : task();
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
    try {
      localStorage.setItem(LAST_SYNCED_KEY, String(sync.lastSyncedAt));
    } catch {
      // Not remembered across reloads; harmless.
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
  const timer = setInterval(() => void runSync(), PERIOD_MS);
  const onOnline = () => void runSync();
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    if (!sync.lastSyncedAt || Date.now() - sync.lastSyncedAt > STALE_MS) void runSync();
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(timer);
    clearTimeout(debounce);
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Clears this browser's copy (on sign-out): the site may be on a shared computer. */
export async function clearLocalData(): Promise<void> {
  await db.transaction('rw', db.jobs, db.settings, async () => {
    await db.jobs.clear();
    await db.settings.clear();
  });
  sync.lastSyncedAt = undefined;
  sync.error = undefined;
  try {
    localStorage.removeItem(LAST_SYNCED_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Runs a write, then schedules a sync. */
function syncing<A extends unknown[], R>(write: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    const result = await write(...args);
    scheduleSync();
    return result;
  };
}

/** The shared dashboard reads and writes IndexedDB through the repository. */
export const dashboardAdapter: DashboardAdapter = {
  watchJobs: repo.watchJobs,
  updateJob: syncing(repo.updateJob),
  deleteJob: syncing(repo.deleteJob),
  restoreJob: syncing(repo.restoreJob),
  getSettings: repo.getSettings,
  updateSettings: repo.updateSettings,
};
