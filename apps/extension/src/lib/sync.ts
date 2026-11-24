import {
  ENCRYPTED_SYNC_FILE_NAME,
  type SessionKeyStorage,
  createDriveClient,
  createEncryptionController,
  createKeyStore,
  deleteDriveData,
  syncWithDrive,
  toSyncError,
} from '@applicliq/core';
import { repo } from './db';
import { NotSignedInError, dropToken, getToken, isSignedIn, signOut } from './google-auth';
import { SYNC_STATUS_KEY, type SyncStatus, readSyncStatus } from './sync-status';

export { SYNC_STATUS_KEY, type SyncStatus, readSyncStatus } from './sync-status';

/**
 * Drive sync as run by the background (the one place that syncs, so two pages can't race).
 * Pages read the status from extension storage and ask for a sync with a message. The
 * encryption flows (settings page) use the same Drive clients and key store; every Drive write
 * is conditional, so they can't overwrite a sync running at the same moment.
 */

export const SYNC_DEBOUNCE_MS = 3000;

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
const encryptedDrive = createDriveClient({
  getToken: () => getToken(),
  onUnauthorized: dropToken,
  fileName: ENCRYPTED_SYNC_FILE_NAME,
});

// Kept from the Career Pocket days like the other storage keys.
const SESSION_KEY = 'career-pocket:encryption-key';

/**
 * "Remember on this device" off: the key's bytes stay in `storage.session`, which the browser
 * keeps in memory only (never on disk), clears when it closes, and doesn't share with content
 * scripts.
 */
const sessionKeyStorage: SessionKeyStorage = {
  async get() {
    const stored = (await browser.storage.session.get(SESSION_KEY)) as Record<string, unknown>;
    const value = stored[SESSION_KEY];
    return typeof value === 'string' ? value : undefined;
  },
  set: (raw) => browser.storage.session.set({ [SESSION_KEY]: raw }),
  remove: () => browser.storage.session.remove(SESSION_KEY),
};

export const keys = createKeyStore({ session: sessionKeyStorage });

/** Encrypted sync flows for the settings page; call `requestSync()` after each. */
export const encryption = createEncryptionController({ repo, drive, encryptedDrive, keys });

const syncEncryption = {
  drive: encryptedDrive,
  getKey: () => keys.load(),
  forgetKey: () => keys.clear(),
};

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
    const result = await syncWithDrive(repo, drive, { encryption: syncEncryption });
    const { account } = await readSyncStatus();
    await writeSyncStatus({
      syncing: false,
      lastSyncedAt: Date.now(),
      encrypted: result.encrypted,
      error: undefined,
      account: account ?? (await drive.accountEmail().catch(() => undefined)),
    });
    return true;
  } catch (cause) {
    const error =
      cause instanceof NotSignedInError
        ? { kind: 'auth' as const, message: cause.message }
        : toSyncError(cause);
    await writeSyncStatus({
      syncing: false,
      ...(error.kind === 'locked' ? { encrypted: true } : {}),
      error: { kind: error.kind, message: error.message, at: Date.now() },
    });
    return false;
  }
}

/**
 * Deletes the AppliCliq file from Drive, then signs this device out so the next sync
 * doesn't upload it again. Local jobs are kept.
 */
export async function deleteDriveDataAndSignOut(): Promise<void> {
  await deleteDriveData(drive, encryptedDrive);
  await signOutOfSync();
}

/** Signs out of sync: forgets the token, the encryption key and the status. */
export async function signOutOfSync(): Promise<void> {
  await signOut();
  await keys.clear().catch(() => {});
  await resetSyncStatus();
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
