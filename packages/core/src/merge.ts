import { type JobRecord, TOMBSTONE_TTL_MS, isTombstone, recordTimestamp } from './types';

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
export function pickWinner(a: JobRecord, b: JobRecord): JobRecord {
  const ta = recordTimestamp(a);
  const tb = recordTimestamp(b);
  if (ta !== tb) return ta > tb ? a : b;
  if (isTombstone(a) !== isTombstone(b)) return isTombstone(a) ? a : b;
  return canonical(a) >= canonical(b) ? a : b;
}

/** Whether a tombstone is old enough to be dropped. Live jobs are never expired. */
export function isExpiredTombstone(
  record: JobRecord,
  now: number = Date.now(),
  ttl: number = TOMBSTONE_TTL_MS,
): boolean {
  return isTombstone(record) && now - record.deletedAt >= ttl;
}

/** Drops tombstones that are at least `ttl` old. */
export function purgeTombstones(
  records: JobRecord[],
  now: number = Date.now(),
  ttl: number = TOMBSTONE_TTL_MS,
): JobRecord[] {
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
  const byId = new Map<string, JobRecord>();
  for (const record of [...local, ...remote]) {
    const existing = byId.get(record.id);
    byId.set(record.id, existing ? pickWinner(existing, record) : record);
  }
  const merged = [...byId.values()].map((r) =>
    isTombstone(r) ? { id: r.id, deletedAt: r.deletedAt } : r,
  );
  return purgeTombstones(merged, now);
}
