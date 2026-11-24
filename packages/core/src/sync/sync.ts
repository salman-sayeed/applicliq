import {
  EncryptionError,
  isEncryptedFile,
  openFile,
  parseEncryptedFile,
  sealFile,
} from '../crypto/envelope';
import { isFeatureEnabled } from '../features';
import { type SyncRecord, canonical, mergeJobs, mergeRecords } from '../merge';
import { resumeSyncEnabled, sanitizeResumeRecords } from '../resumes';
import {
  type SyncedSettings,
  isNewerSettings,
  mergeSyncedSettings,
  sanitizeSyncedSettings,
} from '../settings';
import type { JobRepository } from '../storage';
import type { JobRecord, ResumeRecord } from '../types';
import { sanitizeRecords } from '../validate';
import {
  type DriveClient,
  type DriveDownload,
  DriveError,
  type DriveFile,
  MIN_SCHEMA_VERSION,
  SCHEMA_VERSION,
  type SyncSnapshot,
  encryptedMarker,
  isEncryptedMarker,
} from './drive';

export type SyncErrorKind =
  /** No usable token: the user must sign in (again). */
  | 'auth'
  /** No network. */
  | 'offline'
  /** Another device kept changing the file while this one tried to upload. */
  | 'conflict'
  /** The Drive file was written by a newer app version; it is left untouched. */
  | 'newer-schema'
  /** The Drive file is in a format this version doesn't know; it is left untouched. */
  | 'invalid-remote'
  /** Drive holds encrypted data and this device has no key: nothing is merged or uploaded. */
  | 'locked'
  /** Drive's encrypted data can't be used (missing, damaged or changed); it is left untouched. */
  | 'encryption'
  /** Drive is rate-limiting or failing. */
  | 'server'
  | 'unknown';

export class SyncError extends Error {
  constructor(
    readonly kind: SyncErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

export type SyncResult = {
  /** Records in the merged set (jobs and tombstones). */
  records: number;
  /** Whether Drive brought newer settings. */
  settingsChanged: boolean;
  /** Whether the Drive file was created or overwritten. */
  uploaded: boolean;
  /** Whether Drive holds the data encrypted (encrypted sync is on). */
  encrypted: boolean;
};

/** What a sync needs for encrypted sync (see `ENCRYPTED_SYNC_FILE_NAME`). */
export type SyncEncryption = {
  /** Client for the encrypted file (`ENCRYPTED_SYNC_FILE_NAME`). */
  drive: DriveClient;
  /** The data key, when this device is unlocked. */
  getKey(): Promise<CryptoKey | undefined>;
  /** Called when the stored key no longer opens the file (encryption was set up again). */
  forgetKey(): Promise<void>;
};

export type SyncOptions = {
  now?: () => number;
  /** Full download-merge-upload rounds before giving up on 412s. */
  maxAttempts?: number;
  /**
   * Encrypted sync support. Without it, a Drive holding encrypted data stops the sync with
   * "update" (as in versions from before encrypted sync).
   */
  encryption?: SyncEncryption;
};

const UPDATE = 'Update AppliCliq to keep syncing.';
export const NEWER_SCHEMA_MESSAGE = `Your Drive data was saved by a newer version of AppliCliq. ${UPDATE}`;
export const INVALID_REMOTE_MESSAGE = `Your Drive sync file is in a format this version of AppliCliq doesn't know, so it was left untouched. ${UPDATE}`;
export const LOCKED_MESSAGE = 'Your data is encrypted. Enter your passphrase to keep syncing.';

/**
 * Reads a Drive file's records. Throws (instead of returning nothing) when the file is from a
 * newer schema or not ours, so the caller never overwrites data it doesn't understand.
 * Files from before `schemaVersion` used `version: 1`; version 1 files are read as they are.
 */
export function parseSnapshot(data: unknown): {
  records: JobRecord[];
  skipped: number;
  /** As found in the file (unchecked); undefined when it has none. */
  settings: unknown;
  /** Resume records (checked); empty when the file has none. */
  resumes: ResumeRecord[];
} {
  const file = data as {
    schemaVersion?: unknown;
    version?: unknown;
    records?: unknown;
    settings?: unknown;
    resumes?: unknown;
  } | null;
  if (!file || typeof file !== 'object') {
    throw new SyncError('invalid-remote', INVALID_REMOTE_MESSAGE);
  }
  const schema = file.schemaVersion ?? file.version;
  // Checked before the shape: a newer format may look different (the encrypted-sync marker).
  if (typeof schema === 'number' && schema > SCHEMA_VERSION) {
    throw new SyncError('newer-schema', NEWER_SCHEMA_MESSAGE);
  }
  if (
    !Array.isArray(file.records) ||
    typeof schema !== 'number' ||
    !Number.isInteger(schema) ||
    schema < MIN_SCHEMA_VERSION
  ) {
    throw new SyncError('invalid-remote', INVALID_REMOTE_MESSAGE);
  }
  // Drive content is untrusted input: drop malformed records instead of storing them.
  const jobs = sanitizeRecords(file.records);
  const resumes = sanitizeResumeRecords(file.resumes);
  const badResumes = Array.isArray(file.resumes) ? file.resumes.length - resumes.length : 0;
  return {
    records: jobs.records,
    skipped: jobs.skipped + badResumes,
    settings: file.settings,
    resumes,
  };
}

/** Whether two record sets hold exactly the same records (any order). */
export function sameRecords(a: readonly SyncRecord[], b: readonly SyncRecord[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((r) => [r.id, r]));
  return a.every((r) => {
    const other = byId.get(r.id);
    return other !== undefined && canonical(other) === canonical(r);
  });
}

/**
 * Offline-first sync with the Drive file: download → merge with local records (last write
 * wins, tombstones propagate deletions) → write the result locally → upload only if it differs
 * from what Drive has. The upload is conditional on the downloaded ETag; on 412 (another device
 * wrote in between) the whole round starts over. Failures never lose local data.
 *
 * Even if an overwrite slips through (no ETag), nothing is lost for good: the device whose
 * change was overwritten still has it locally, sees that the merged set differs from Drive on
 * its next sync, and uploads again.
 *
 * A file this version can't read (unknown format, newer `schemaVersion`) stops the sync with
 * an error; it is never overwritten, and never mistaken for an empty Drive.
 *
 * Encrypted sync: `career-pocket.json` holds only a marker and the data is in the encrypted
 * file (see `ENCRYPTED_SYNC_FILE_NAME`). Without the key nothing is merged or uploaded.
 */
export async function syncWithDrive(
  repo: JobRepository,
  drive: DriveClient,
  { now = Date.now, maxAttempts = 3, encryption }: SyncOptions = {},
): Promise<SyncResult> {
  const snapshot = (
    records: JobRecord[],
    settings: unknown,
    resumes?: ResumeRecord[],
  ): SyncSnapshot => ({
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now(),
    records,
    settings: settings as SyncedSettings,
    ...(resumes?.length ? { resumes } : {}),
  });

  for (let attempt = 1; ; attempt++) {
    const [primaryFile, ...extraFiles] = await drive.list();
    const encryptedFiles = encryption ? await encryption.drive.list() : [];
    const primary = primaryFile && (await drive.download(primaryFile.id));
    let encrypted = primary
      ? isEncryptedMarker(primary.data) || isEncryptedFile(primary.data)
      : encryptedFiles.length > 0;
    // A plain file next to an encrypted one: either encryption was turned off on another device
    // (and deleting the encrypted file failed), or an older version recreated the plain file
    // after it was deleted by hand. Only the first may make this device sync in plain text.
    if (!encrypted && primary && encryptedFiles.length > 0) {
      const local = await repo.getSettings();
      encrypted =
        isFeatureEnabled(local, 'encryptedSync') && !turnedOffElsewhere(primary.data, local);
    }

    if (encrypted) {
      if (!encryption) throw new SyncError('newer-schema', NEWER_SCHEMA_MESSAGE);
      const done = await encryptedRound(repo, drive, encryption, {
        primaryFile,
        primary,
        extraFiles,
        encryptedFiles,
        snapshot,
        now,
      });
      if (done) return done;
      if (attempt < maxAttempts) continue;
      throw new SyncError('conflict', 'Drive kept changing during sync. Try again.');
    }

    if (!primaryFile) {
      const merged = await repo.mergeIntoLocal([]);
      const settings = await repo.getSyncedSettings();
      const resumes = await syncedResumes(repo, []);
      // Nothing to keep yet: don't create a file for an untouched install.
      if (merged.length === 0 && settings.updatedAt === 0 && !resumes?.length) {
        return { records: 0, uploaded: false, settingsChanged: false, encrypted: false };
      }
      // Encrypted sync is on here but Drive is empty (its data was deleted): never fall back
      // to uploading plain text. The user turns encryption off, or on again, in settings.
      if (encryption && isFeatureEnabled(await repo.getSettings(), 'encryptedSync')) {
        throw new SyncError(
          'encryption',
          'Encrypted sync is on, but your Drive has no AppliCliq data. Turn encryption off, or set it up again, in Settings → Sync & data.',
        );
      }
      await drive.create(snapshot(merged, settings, resumes));
      return { records: merged.length, uploaded: true, settingsChanged: false, encrypted: false };
    }

    const {
      records: remote,
      skipped,
      settings: remoteSettings,
      resumes: remoteResumes,
    } = parseSnapshot(primary!.data);
    // Duplicates come from two devices creating the file at once: fold them in, then delete.
    const folded = await foldExtras(drive, extraFiles, now);
    const incoming = mergeJobs(remote, folded.records, now());
    const incomingSettings = folded.settings.reduce(foldSettings, remoteSettings);

    const merged = await repo.mergeIntoLocal(incoming);
    const settingsMerge = await repo.mergeSettingsIntoLocal(incomingSettings);
    // Settings from a newer app version are passed through untouched, never overwritten.
    const outSettings = isNewerSettings(incomingSettings)
      ? incomingSettings
      : settingsMerge.settings;
    const settingsInSync = canonical(outSettings) === canonical(remoteSettings);
    // After the settings merge, so a switch turned off elsewhere applies here this round.
    const resumes = await syncedResumes(repo, mergeRecords(remoteResumes, folded.resumes, now()));
    const resumesInSync = sameRecords(resumes ?? [], remoteResumes);
    const result = {
      records: merged.length,
      settingsChanged: settingsMerge.changed,
      encrypted: false,
    };
    // A file from before the app's rename keeps its data and gets the current name.
    if (primaryFile.name !== drive.fileName) await drive.rename(primaryFile.id).catch(() => {});
    // Malformed records in Drive (skipped) are cleaned out by uploading the merged set.
    if (
      folded.ids.length === 0 &&
      skipped === 0 &&
      settingsInSync &&
      resumesInSync &&
      sameRecords(merged, remote)
    ) {
      return { ...result, uploaded: false };
    }

    try {
      await drive.update(primaryFile.id, snapshot(merged, outSettings, resumes), primary!.etag);
    } catch (error) {
      if (error instanceof DriveError && error.status === 412) {
        if (attempt < maxAttempts) continue;
        throw new SyncError('conflict', 'Drive kept changing during sync. Try again.');
      }
      throw error;
    }
    // Only duplicates that were read and merged are deleted; one this version can't read is
    // left alone, never thrown away.
    for (const id of folded.ids) await drive.remove(id).catch(() => {});
    return { ...result, uploaded: true };
  }
}

/**
 * Resumes after a sync round: with resume sync on, `incoming` merged into the local store (the
 * set to upload); off, undefined: nothing is read from Drive and none are uploaded (resumes
 * already there are removed by the upload).
 */
async function syncedResumes(
  repo: JobRepository,
  incoming: ResumeRecord[],
): Promise<ResumeRecord[] | undefined> {
  if (!resumeSyncEnabled(await repo.getSettings())) return undefined;
  return repo.mergeResumesIntoLocal(incoming);
}

/** Reads duplicate plain files; the ones this version can't read are skipped (and kept). */
async function foldExtras(drive: DriveClient, files: DriveFile[], now: () => number) {
  let records: JobRecord[] = [];
  let resumes: ResumeRecord[] = [];
  const settings: unknown[] = [];
  const ids: string[] = [];
  for (const { id } of files) {
    try {
      const extra = parseSnapshot((await drive.download(id)).data);
      records = mergeJobs(records, extra.records, now());
      resumes = mergeRecords(resumes, extra.resumes, now());
      settings.push(extra.settings);
      ids.push(id);
    } catch {
      // Unreadable (or the encrypted-sync marker): the primary file stays the source of truth.
    }
  }
  return { records, resumes, settings, ids };
}

/** Turns an encrypted-file problem into a sync error the UI can show. */
function encryptionSyncError(error: unknown): unknown {
  if (!(error instanceof EncryptionError)) return error;
  if (error.kind === 'newer-version') return new SyncError('newer-schema', NEWER_SCHEMA_MESSAGE);
  if (error.kind === 'invalid-file') return new SyncError('invalid-remote', INVALID_REMOTE_MESSAGE);
  return new SyncError('encryption', error.message);
}

/**
 * Downloads and checks the encrypted file. Throws a `SyncError` for a file this version can't
 * use; never returns something half-read.
 */
export async function downloadEncrypted(drive: DriveClient, id: string) {
  const download: DriveDownload = await drive.download(id);
  try {
    return { file: parseEncryptedFile(download.data), etag: download.etag };
  } catch (error) {
    throw encryptionSyncError(error);
  }
}

/**
 * One encrypted round. Returns undefined when Drive changed under it (412): the caller starts
 * over.
 */
async function encryptedRound(
  repo: JobRepository,
  drive: DriveClient,
  encryption: SyncEncryption,
  {
    primaryFile,
    primary,
    extraFiles,
    encryptedFiles,
    snapshot,
    now,
  }: {
    primaryFile?: DriveFile;
    primary?: DriveDownload;
    extraFiles: DriveFile[];
    encryptedFiles: DriveFile[];
    snapshot: (records: JobRecord[], settings: unknown, resumes?: ResumeRecord[]) => SyncSnapshot;
    now: () => number;
  },
): Promise<SyncResult | undefined> {
  const key = await encryption.getKey();
  if (!key) throw new SyncError('locked', LOCKED_MESSAGE);
  const [encFile, ...encExtras] = encryptedFiles;
  if (!encFile) {
    throw new SyncError(
      'encryption',
      'Your encrypted data is missing from Drive, so nothing was synced. Turn encryption off in Settings → Sync & data to sync without it.',
    );
  }
  const { file, etag } = await downloadEncrypted(encryption.drive, encFile.id);
  let payload: string;
  try {
    payload = await openFile(file, key);
  } catch {
    // The stored key doesn't open the file: encryption was set up again on another device (a
    // new data key). Forget it and ask for the passphrase; unlocking tells a damaged file apart.
    await encryption.forgetKey();
    throw new SyncError('locked', LOCKED_MESSAGE);
  }
  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(payload);
  } catch {
    throw new SyncError('invalid-remote', INVALID_REMOTE_MESSAGE);
  }
  const {
    records: remote,
    skipped,
    settings: remoteSettings,
    resumes: remoteResumes,
  } = parseSnapshot(parsedPayload);

  // Plain copies of career-pocket.json (e.g. written by an older version) are folded in and
  // replaced by the marker; encrypted duplicates are folded in if this key opens them.
  const markerMissing = !primaryFile || !isEncryptedMarker(primary?.data);
  const plainPrimary = primaryFile && markerMissing ? [primaryFile] : [];
  const plain = await foldExtras(drive, [...plainPrimary, ...extraFiles], now);
  let incoming = mergeJobs(remote, plain.records, now());
  let incomingResumes = mergeRecords(remoteResumes, plain.resumes, now());
  const settingsList = [...plain.settings];
  const encIds: string[] = [];
  for (const extra of encExtras) {
    try {
      const other = await downloadEncrypted(encryption.drive, extra.id);
      const parsed = parseSnapshot(JSON.parse(await openFile(other.file, key)));
      incoming = mergeJobs(incoming, parsed.records, now());
      incomingResumes = mergeRecords(incomingResumes, parsed.resumes, now());
      settingsList.push(parsed.settings);
      encIds.push(extra.id);
    } catch {
      // Another data key, or unreadable: left alone.
    }
  }
  const incomingSettings = settingsList.reduce(foldSettings, remoteSettings);

  const merged = await repo.mergeIntoLocal(incoming);
  const settingsMerge = await repo.mergeSettingsIntoLocal(incomingSettings);
  const outSettings = isNewerSettings(incomingSettings) ? incomingSettings : settingsMerge.settings;
  const result = {
    records: merged.length,
    settingsChanged: settingsMerge.changed,
    encrypted: true,
  };
  const settingsInSync = canonical(outSettings) === canonical(remoteSettings);
  const resumes = await syncedResumes(repo, incomingResumes);
  const resumesInSync = sameRecords(resumes ?? [], remoteResumes);
  const tidy = plain.ids.length > 0 || encIds.length > 0;

  /** Puts the marker in place (old versions then stop instead of syncing in plain text). */
  const writeMarker = async () => {
    if (!primaryFile) await drive.create(encryptedMarker(now()));
    else if (markerMissing)
      await drive.update(primaryFile.id, encryptedMarker(now()), primary?.etag);
  };

  if (!tidy && skipped === 0 && settingsInSync && resumesInSync && sameRecords(merged, remote)) {
    await writeMarker();
    return { ...result, uploaded: false };
  }

  // A fresh IV on every upload (sealFile); the header (wrapped keys) is kept as it is.
  const sealed = await sealFile(file, key, JSON.stringify(snapshot(merged, outSettings, resumes)));
  try {
    await encryption.drive.update(encFile.id, sealed, etag);
  } catch (error) {
    if (error instanceof DriveError && error.status === 412) return undefined;
    throw error;
  }
  try {
    await writeMarker();
  } catch (error) {
    // The plain file changed meanwhile: the next round folds that change in too.
    if (error instanceof DriveError && error.status === 412) return undefined;
    throw error;
  }
  for (const id of plain.ids) {
    if (id !== primaryFile?.id) await drive.remove(id).catch(() => {});
  }
  for (const id of encIds) await encryption.drive.remove(id).catch(() => {});
  return { ...result, uploaded: true };
}

/**
 * Whether a plain Drive file says encryption was turned off after this device's settings last
 * changed (its synced settings are newer and have the switch off).
 */
function turnedOffElsewhere(data: unknown, local: { updatedAt: number }): boolean {
  const settings = (data as { settings?: unknown } | null)?.settings as
    { updatedAt?: unknown; features?: { encryptedSync?: unknown } } | undefined;
  return (
    typeof settings?.updatedAt === 'number' &&
    settings.updatedAt >= local.updatedAt &&
    settings.features?.encryptedSync === false
  );
}

/** Merges the settings of a duplicate file into the primary's (both unchecked). */
export function foldSettings(a: unknown, b: unknown): unknown {
  if (b === undefined || isNewerSettings(a)) return a;
  if (a === undefined || isNewerSettings(b)) return b;
  return mergeSyncedSettings(sanitizeSyncedSettings(a), sanitizeSyncedSettings(b));
}

/**
 * Removes every AppliCliq file from the user's Drive (the app folder only). Local data is not
 * touched; a device that syncs again uploads its copy, so callers sign out afterwards.
 */
export async function deleteDriveData(
  drive: DriveClient,
  encryptedDrive?: DriveClient,
): Promise<number> {
  let count = 0;
  // The encrypted file first: with the marker gone and it left behind, a device would treat
  // Drive as encrypted with nothing to unlock.
  for (const client of [encryptedDrive, drive]) {
    if (!client) continue;
    const files = await client.list();
    for (const { id } of files) await client.remove(id);
    count += files.length;
  }
  return count;
}

/** Sorts any sync failure into a kind the UI can explain. */
export function toSyncError(error: unknown): SyncError {
  if (error instanceof SyncError) return error;
  if (error instanceof DriveError) {
    if (error.status === 401 || error.status === 403) {
      return new SyncError('auth', 'Google Drive access expired or was revoked. Sign in again.');
    }
    if (error.status === 412) {
      return new SyncError('conflict', 'Drive kept changing during sync. Try again.');
    }
    if (error.status === 429 || error.status >= 500) {
      return new SyncError('server', 'Google Drive is busy right now. Will retry later.');
    }
    return new SyncError('unknown', error.message);
  }
  // fetch rejects with a TypeError when there's no connection.
  if (error instanceof TypeError) return new SyncError('offline', 'You are offline.');
  return new SyncError('unknown', error instanceof Error ? error.message : String(error));
}
