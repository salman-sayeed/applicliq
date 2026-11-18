import { type JobRecord, TOMBSTONE_TTL_MS, isTombstone, recordTimestamp } from './types';

/**
 * Picks the winner between two versions of the same record.
 * Last write wins; on an exact tie a tombstone beats a live job so deletions are never lost.
 */
export function pickWinner(a: JobRecord, b: JobRecord): JobRecord {
  const ta = recordTimestamp(a);
  const tb = recordTimestamp(b);
  if (ta !== tb) return ta > tb ? a : b;
  if (isTombstone(a) !== isTombstone(b)) return isTombstone(a) ? a : b;
  return a;
}

/** Drops tombstones older than the TTL. */
export function purgeTombstones(
  records: JobRecord[],
  now: number = Date.now(),
  ttl: number = TOMBSTONE_TTL_MS,
): JobRecord[] {
  return records.filter((r) => !isTombstone(r) || now - r.deletedAt < ttl);
}

/**
 * Merges two record sets (e.g. local IndexedDB and the Drive snapshot) by id,
 * then purges expired tombstones. Pure: inputs are not mutated.
 */
export function mergeRecords(
  local: JobRecord[],
  remote: JobRecord[],
  now: number = Date.now(),
): JobRecord[] {
  const byId = new Map<string, JobRecord>();
  for (const record of [...local, ...remote]) {
    const existing = byId.get(record.id);
    byId.set(record.id, existing ? pickWinner(existing, record) : record);
  }
  return purgeTombstones([...byId.values()], now);
}
