import { type JobRecord, TOMBSTONE_TTL_MS } from './types';

/** Anything synced record by record: a live version (`updatedAt`) or a tombstone (`deletedAt`). */
export type SyncRecord = { id: string; updatedAt?: number; deletedAt?: number };

const isDeleted = (r: SyncRecord) => r.deletedAt !== undefined;
const stamp = (r: SyncRecord) => r.deletedAt ?? r.updatedAt ?? 0;

/** JSON with object keys sorted, so equal content always serializes the same way. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Picks the winner between two versions of the same record.
 *
 * 1. Last write wins (`updatedAt` for jobs, `deletedAt` for tombstones).
 * 2. On an exact tie a tombstone beats a live job, so deletions are never lost.
 * 3. Two different live versions with the same `updatedAt` are ordered by content, so
 *    every device picks the same one whatever order it sees them in (no ping-pong).
 */
export function pickWinner(a: JobRecord, b: JobRecord): JobRecord;
export function pickWinner<R extends SyncRecord>(a: R, b: R): R;
export function pickWinner<R extends SyncRecord>(a: R, b: R): R {
  const ta = stamp(a);
  const tb = stamp(b);
  if (ta !== tb) return ta > tb ? a : b;
  if (isDeleted(a) !== isDeleted(b)) return isDeleted(a) ? a : b;
  return canonical(a) >= canonical(b) ? a : b;
}

/** Whether a tombstone is old enough to be dropped. Live jobs are never expired. */
export function isExpiredTombstone(
  record: SyncRecord,
  now: number = Date.now(),
  ttl: number = TOMBSTONE_TTL_MS,
): boolean {
  return record.deletedAt !== undefined && now - record.deletedAt >= ttl;
}

/** Drops tombstones that are at least `ttl` old. */
export function purgeTombstones<R extends SyncRecord>(
  records: R[],
  now: number = Date.now(),
  ttl: number = TOMBSTONE_TTL_MS,
): R[] {
  return records.filter((r) => !isExpiredTombstone(r, now, ttl));
}

/**
 * Merges two record sets (e.g. local IndexedDB and the Drive snapshot) record by record:
 * last write wins, tombstones win ties, expired tombstones are purged, and tombstones are
 * reduced to `{ id, deletedAt }`. Pure: inputs are not mutated. The result is the same
 * whichever side is `local` and whichever is `remote`.
 */
export function mergeJobs(
  local: readonly JobRecord[],
  remote: readonly JobRecord[],
  now: number = Date.now(),
): JobRecord[] {
  return mergeRecords(local, remote, now);
}

/**
 * `mergeJobs` for any record type (resumes use it too): per id, last write wins, tombstones win
 * ties and are reduced to `{ id, deletedAt }`, expired tombstones are dropped.
 */
export function mergeRecords<R extends SyncRecord>(
  local: readonly R[],
  remote: readonly R[],
  now: number = Date.now(),
): R[] {
  const byId = new Map<string, R>();
  for (const record of [...local, ...remote]) {
    const existing = byId.get(record.id);
    byId.set(record.id, existing ? pickWinner(existing, record) : record);
  }
  const merged = [...byId.values()].map((r) =>
    isDeleted(r) ? ({ id: r.id, deletedAt: r.deletedAt } as R) : r,
  );
  return purgeTombstones(merged, now);
}
