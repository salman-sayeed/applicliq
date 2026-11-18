import { describe, expect, it } from 'vitest';
import { isExpiredTombstone, mergeJobs, pickWinner, purgeTombstones } from './merge';
import { type Job, type JobRecord, type JobTombstone, TOMBSTONE_TTL_MS } from './types';

const NOW = 100 * TOMBSTONE_TTL_MS;

const job = (id: string, updatedAt: number, extra: Partial<Job> = {}): Job => ({
  id,
  url: `https://example.com/jobs/${id}`,
  title: 'Engineer',
  company: 'Acme',
  status: 'saved',
  history: [{ status: 'saved', at: 0 }],
  createdAt: 0,
  updatedAt,
  ...extra,
});

const tomb = (id: string, deletedAt: number): JobTombstone => ({ id, deletedAt });

const byId = (records: JobRecord[]) =>
  Object.fromEntries(records.map((r) => [r.id, r])) as Record<string, JobRecord>;

/** Order-independent comparison of merge results. */
const sorted = (records: JobRecord[]) =>
  [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

describe('pickWinner', () => {
  it('keeps the most recently updated version, whatever the argument order', () => {
    const older = job('a', 1, { title: 'old' });
    const newer = job('a', 2, { title: 'new' });
    expect(pickWinner(older, newer)).toBe(newer);
    expect(pickWinner(newer, older)).toBe(newer);
  });

  it('lets a newer tombstone delete a job', () => {
    const t = tomb('a', 5);
    expect(pickWinner(job('a', 4), t)).toBe(t);
    expect(pickWinner(t, job('a', 4))).toBe(t);
  });

  it('lets a job edited after the deletion win', () => {
    const edited = job('a', 6);
    expect(pickWinner(tomb('a', 5), edited)).toBe(edited);
    expect(pickWinner(edited, tomb('a', 5))).toBe(edited);
  });

  it('prefers the tombstone on a tie', () => {
    const t = tomb('a', 5);
    expect(pickWinner(job('a', 5), t)).toBe(t);
    expect(pickWinner(t, job('a', 5))).toBe(t);
  });

  it('keeps the later of two tombstones', () => {
    expect(pickWinner(tomb('a', 1), tomb('a', 2))).toEqual(tomb('a', 2));
    expect(pickWinner(tomb('a', 2), tomb('a', 1))).toEqual(tomb('a', 2));
  });

  it('breaks a tie between two different live versions the same way on every device', () => {
    const x = job('a', 7, { title: 'X' });
    const y = job('a', 7, { title: 'Y' });
    expect(pickWinner(x, y)).toBe(pickWinner(y, x));
  });

  it('ignores key order and undefined fields when breaking a tie', () => {
    const x = job('a', 7, { notes: 'n' });
    const other = job('a', 7, { notes: 'm' });
    const reordered = Object.fromEntries(Object.entries(x).reverse()) as Job;
    const withUndefined: Job = { ...x, location: undefined };
    expect(pickWinner(reordered, other)).toEqual(pickWinner(x, other));
    expect(pickWinner(withUndefined, other)).toEqual(pickWinner(x, other));
  });
});

describe('mergeJobs', () => {
  it('returns nothing for two empty sides', () => {
    expect(mergeJobs([], [], NOW)).toEqual([]);
  });

  it('keeps one side when the other is empty', () => {
    const records = [job('a', 1), tomb('b', NOW - 1)];
    expect(sorted(mergeJobs(records, [], NOW))).toEqual(records);
    expect(sorted(mergeJobs([], records, NOW))).toEqual(records);
  });

  it('unions records that exist on only one side', () => {
    const merged = mergeJobs([job('a', 1)], [job('b', 1)], NOW);
    expect(merged.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('takes the newer version per record, from either side', () => {
    const merged = byId(
      mergeJobs(
        [job('a', 2, { title: 'local-new' }), job('b', 1, { title: 'local-old' })],
        [job('a', 1, { title: 'remote-old' }), job('b', 2, { title: 'remote-new' })],
        NOW,
      ),
    );
    expect((merged.a as Job).title).toBe('local-new');
    expect((merged.b as Job).title).toBe('remote-new');
  });

  it('replaces the whole record: the losing side’s fields and history are not combined', () => {
    const local = job('a', 1, {
      notes: 'local note',
      status: 'applied',
      history: [
        { status: 'saved', at: 0 },
        { status: 'applied', at: 1 },
      ],
    });
    const remote = job('a', 2, { tags: ['remote'] });
    const [merged] = mergeJobs([local], [remote], NOW);
    expect(merged).toEqual(remote);
  });

  it('propagates a remote deletion that is newer than the local edit', () => {
    const t = tomb('a', NOW - 1);
    expect(mergeJobs([job('a', NOW - 2)], [t], NOW)).toEqual([t]);
  });

  it('keeps a local edit made after the remote deletion', () => {
    const edited = job('a', NOW - 1);
    expect(mergeJobs([edited], [tomb('a', NOW - 2)], NOW)).toEqual([edited]);
  });

  it('lets the tombstone win when deletion and edit share a timestamp', () => {
    const t = tomb('a', NOW - 1);
    expect(mergeJobs([job('a', NOW - 1)], [t], NOW)).toEqual([t]);
    expect(mergeJobs([t], [job('a', NOW - 1)], NOW)).toEqual([t]);
  });

  it('keeps the later deletion time when both sides deleted', () => {
    expect(mergeJobs([tomb('a', NOW - 5)], [tomb('a', NOW - 3)], NOW)).toEqual([
      tomb('a', NOW - 3),
    ]);
  });

  it('collapses duplicate ids within one side', () => {
    const merged = mergeJobs([job('a', 1), job('a', 3, { title: 'newest' })], [job('a', 2)], NOW);
    expect(merged).toHaveLength(1);
    expect((merged[0] as Job).title).toBe('newest');
  });

  it('returns a single copy when both sides are identical', () => {
    const a = job('a', 1);
    expect(mergeJobs([a], [structuredClone(a)], NOW)).toEqual([a]);
  });

  it('reduces a tombstone carrying leftover fields to { id, deletedAt }', () => {
    const dirty = { ...job('a', 1), deletedAt: NOW - 1 } as JobRecord;
    expect(mergeJobs([dirty], [], NOW)).toEqual([tomb('a', NOW - 1)]);
  });

  it('purges tombstones at or past the 30-day TTL, keeps younger ones', () => {
    const merged = mergeJobs(
      [tomb('expired', NOW - TOMBSTONE_TTL_MS - 1), tomb('boundary', NOW - TOMBSTONE_TTL_MS)],
      [tomb('fresh', NOW - TOMBSTONE_TTL_MS + 1)],
      NOW,
    );
    expect(merged.map((r) => r.id)).toEqual(['fresh']);
  });

  it('still deletes a job when the winning tombstone has expired (the job is not resurrected)', () => {
    const old = NOW - TOMBSTONE_TTL_MS - 10;
    expect(mergeJobs([job('a', old - 1)], [tomb('a', old)], NOW)).toEqual([]);
  });

  it('resurrects a job only from a device that missed the deletion for longer than the TTL', () => {
    // Documented limitation of tombstone TTLs: once the tombstone is gone, a stale copy wins.
    expect(mergeJobs([job('a', 1)], [], NOW)).toEqual([job('a', 1)]);
  });

  it('never purges live jobs, however old', () => {
    expect(mergeJobs([job('a', 0)], [], Number.MAX_SAFE_INTEGER)).toHaveLength(1);
  });

  it('does not mutate its inputs', () => {
    const local: JobRecord[] = [job('a', 1), { ...job('b', 1), deletedAt: NOW - 1 } as JobRecord];
    const remote: JobRecord[] = [job('a', 2), tomb('c', 0)];
    const before = structuredClone({ local, remote });
    mergeJobs(local, remote, NOW);
    expect({ local, remote }).toEqual(before);
  });

  it('reads `now` from the clock by default', () => {
    expect(mergeJobs([tomb('a', 0)], [])).toEqual([]);
    expect(mergeJobs([tomb('a', Date.now())], [])).toHaveLength(1);
  });
});

describe('mergeJobs properties (randomized)', () => {
  // Small deterministic PRNG so failures are reproducible.
  function rng(seed: number) {
    return () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed / 2 ** 31;
    };
  }

  /** `spread` > 1 makes some tombstones older than the TTL. */
  function randomSide(rand: () => number, spread: number): JobRecord[] {
    const ids = ['a', 'b', 'c', 'd'];
    const count = Math.floor(rand() * 6);
    return Array.from({ length: count }, () => {
      const id = ids[Math.floor(rand() * ids.length)]!;
      // Few distinct timestamps so ties are common; some tombstones are expired.
      const age = Math.floor(rand() * 3) * (spread / 2) * TOMBSTONE_TTL_MS;
      const t = NOW - Math.floor(age) + Math.floor(rand() * 3);
      return rand() < 0.35 ? tomb(id, t) : job(id, t, { title: `t${Math.floor(rand() * 3)}` });
    });
  }

  const generate = (spread: number) =>
    Array.from({ length: 300 }, (_, i) => {
      const rand = rng(i + 1);
      return [1, 2, 3].map(() => randomSide(rand, spread)) as [
        JobRecord[],
        JobRecord[],
        JobRecord[],
      ];
    });
  const cases = generate(1.2);
  const withinTtl = generate(0.9);

  it('is commutative: both devices end up with the same data', () => {
    for (const [a, b] of cases) {
      expect(sorted(mergeJobs(a, b, NOW))).toEqual(sorted(mergeJobs(b, a, NOW)));
    }
  });

  it('is associative within the TTL: the order devices sync in does not matter', () => {
    // Past the TTL a purged tombstone can no longer suppress a stale copy (see above).
    for (const [a, b, c] of withinTtl) {
      expect(sorted(mergeJobs(mergeJobs(a, b, NOW), c, NOW))).toEqual(
        sorted(mergeJobs(a, mergeJobs(b, c, NOW), NOW)),
      );
    }
  });

  it('is idempotent: merging the same data again changes nothing', () => {
    for (const [a, b] of cases) {
      const once = mergeJobs(a, b, NOW);
      expect(sorted(mergeJobs(once, once, NOW))).toEqual(sorted(once));
    }
    // Re-merging a source is only a no-op within the TTL: an expired tombstone that was purged
    // can no longer suppress an older copy still held by that source.
    for (const [a, b] of withinTtl) {
      const once = mergeJobs(a, b, NOW);
      expect(sorted(mergeJobs(once, b, NOW))).toEqual(sorted(once));
    }
  });

  it('never returns two records with the same id, nor an expired tombstone', () => {
    for (const [a, b] of cases) {
      const merged = mergeJobs(a, b, NOW);
      expect(new Set(merged.map((r) => r.id)).size).toBe(merged.length);
      expect(merged.some((r) => isExpiredTombstone(r, NOW))).toBe(false);
    }
  });
});

describe('purgeTombstones', () => {
  it('drops only expired tombstones', () => {
    const records = [job('a', 0), tomb('b', NOW - TOMBSTONE_TTL_MS), tomb('c', NOW - 1)];
    expect(purgeTombstones(records, NOW).map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('accepts a custom TTL', () => {
    expect(purgeTombstones([tomb('a', NOW - 10)], NOW, 5)).toEqual([]);
    expect(purgeTombstones([tomb('a', NOW - 10)], NOW, 50)).toHaveLength(1);
  });
});
