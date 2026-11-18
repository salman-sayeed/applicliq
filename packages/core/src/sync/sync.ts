import { mergeRecords } from '../merge';
import type { JobRepository } from '../storage';
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
  const [local, remote] = await Promise.all([repo.allRecords(), drive.read()]);
  const merged = mergeRecords(local, remote?.records ?? [], now());
  await repo.replaceAll(merged);
  await drive.write({ version: 1, updatedAt: now(), records: merged });
  return { records: merged.length, pulled: remote !== undefined };
}
