import type { JobRepository } from '../storage';
import { sanitizeRecords } from '../validate';
import type { DriveClient } from './drive';

export type SyncResult = { records: number; pulled: boolean };

/**
 * Offline-first sync: pull the Drive snapshot, merge it with local records
 * (last write wins, tombstones propagate deletions), store the result locally,
 * then push it back. Safe to call repeatedly; failures leave local data intact.
 */
export async function syncWithDrive(
  repo: JobRepository,
  drive: DriveClient,
  now: () => number = Date.now,
): Promise<SyncResult> {
  const remote = await drive.read();
  // Drive content is untrusted input: drop malformed records instead of storing them.
  const incoming = Array.isArray(remote?.records) ? sanitizeRecords(remote.records).records : [];
  const merged = await repo.mergeIntoLocal(incoming);
  await drive.write({ version: 1, updatedAt: now(), records: merged });
  return { records: merged.length, pulled: remote !== undefined };
}
