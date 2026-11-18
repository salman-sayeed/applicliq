import { canonical, mergeJobs } from '../merge';
import type { JobRepository } from '../storage';
import type { JobRecord } from '../types';
import { sanitizeRecords } from '../validate';
import { type DriveClient, DriveError, SCHEMA_VERSION, type SyncSnapshot } from './drive';

export type SyncErrorKind =
  /** No usable token: the user must sign in (again). */
  | 'auth'
  /** No network. */
  | 'offline'
  /** Another device kept changing the file while this one tried to upload. */
  | 'conflict'
  /** The Drive file was written by a newer app version; it is left untouched. */
  | 'newer-schema'
  /** The Drive file isn't a Pocket Career file; it is left untouched. */
  | 'invalid-remote'
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
  /** Whether the Drive file was created or overwritten. */
  uploaded: boolean;
};

export type SyncOptions = {
  now?: () => number;
  /** Full download-merge-upload rounds before giving up on 412s. */
  maxAttempts?: number;
};

/**
 * Reads a Drive file's records. Throws (instead of returning nothing) when the file is from a
 * newer schema or not ours, so the caller never overwrites data it doesn't understand.
 * Files from before `schemaVersion` used `version: 1`, which is the same format.
 */
export function parseSnapshot(data: unknown): { records: JobRecord[]; skipped: number } {
  const file = data as { schemaVersion?: unknown; version?: unknown; records?: unknown } | null;
  if (!file || typeof file !== 'object' || !Array.isArray(file.records)) {
    throw new SyncError('invalid-remote', 'The Drive file is not a Pocket Career file.');
  }
  const schema = file.schemaVersion ?? file.version;
  if (typeof schema === 'number' && schema > SCHEMA_VERSION) {
    throw new SyncError(
      'newer-schema',
      'Your Drive data was saved by a newer version of Pocket Career. Update to keep syncing.',
    );
  }
  if (schema !== SCHEMA_VERSION) {
    throw new SyncError('invalid-remote', 'The Drive file is not a Pocket Career file.');
  }
  // Drive content is untrusted input: drop malformed records instead of storing them.
  return sanitizeRecords(file.records);
}

/** Whether two record sets hold exactly the same records (any order). */
export function sameRecords(a: readonly JobRecord[], b: readonly JobRecord[]): boolean {
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
 */
export async function syncWithDrive(
  repo: JobRepository,
  drive: DriveClient,
  { now = Date.now, maxAttempts = 3 }: SyncOptions = {},
): Promise<SyncResult> {
  const snapshot = (records: JobRecord[]): SyncSnapshot => ({
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now(),
    records,
  });

  for (let attempt = 1; ; attempt++) {
    const [primaryId, ...extraIds] = await drive.list();

    if (primaryId === undefined) {
      const merged = await repo.mergeIntoLocal([]);
      if (merged.length === 0) return { records: 0, uploaded: false };
      await drive.create(snapshot(merged));
      return { records: merged.length, uploaded: true };
    }

    const primary = await drive.download(primaryId);
    const { records: remote, skipped } = parseSnapshot(primary.data);
    // Duplicates come from two devices creating the file at once: fold them in, then delete.
    let incoming = remote;
    for (const id of extraIds) {
      try {
        const extra = parseSnapshot((await drive.download(id)).data).records;
        incoming = mergeJobs(incoming, extra, now());
      } catch {
        // An unreadable duplicate is skipped; the primary file stays the source of truth.
      }
    }

    const merged = await repo.mergeIntoLocal(incoming);
    // Malformed records in Drive (skipped) are cleaned out by uploading the merged set.
    if (extraIds.length === 0 && skipped === 0 && sameRecords(merged, remote)) {
      return { records: merged.length, uploaded: false };
    }

    try {
      await drive.update(primaryId, snapshot(merged), primary.etag);
    } catch (error) {
      if (error instanceof DriveError && error.status === 412) {
        if (attempt < maxAttempts) continue;
        throw new SyncError('conflict', 'Drive kept changing during sync. Try again.');
      }
      throw error;
    }
    for (const id of extraIds) await drive.remove(id).catch(() => {});
    return { records: merged.length, uploaded: true };
  }
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
