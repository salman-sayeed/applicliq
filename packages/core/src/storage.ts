import { Dexie, type Table } from 'dexie';
import {
  type Job,
  type JobRecord,
  type JobStatus,
  type JobTombstone,
  TOMBSTONE_TTL_MS,
  isLiveJob,
} from './types';

export class PocketCareerDB extends Dexie {
  jobs!: Table<JobRecord, string>;

  constructor(name = 'pocket-career') {
    super(name);
    this.version(1).stores({
      // Only indexed fields are listed; every other field is still stored.
      jobs: 'id, status, company, updatedAt, deletedAt',
    });
  }
}

export type NewJob = Omit<
  Job,
  'id' | 'status' | 'history' | 'createdAt' | 'updatedAt' | 'deletedAt'
> & {
  status?: JobStatus;
};

export type JobPatch = Partial<
  Omit<Job, 'id' | 'history' | 'createdAt' | 'updatedAt' | 'deletedAt'>
>;

export function createJobRepository(db: PocketCareerDB, now: () => number = Date.now) {
  return {
    /** All live jobs (tombstones hidden), most recently updated first. */
    async list(): Promise<Job[]> {
      const all = await db.jobs.orderBy('updatedAt').reverse().toArray();
      return all.filter(isLiveJob);
    },

    async get(id: string): Promise<Job | undefined> {
      const record = await db.jobs.get(id);
      return record && isLiveJob(record) ? record : undefined;
    },

    async create(input: NewJob): Promise<Job> {
      const at = now();
      const status = input.status ?? 'saved';
      const job: Job = {
        ...input,
        id: crypto.randomUUID(),
        status,
        history: [{ status, at }],
        createdAt: at,
        updatedAt: at,
      };
      await db.jobs.add(job);
      return job;
    },

    /** Applies a patch; a status change is appended to the job's history. */
    async update(id: string, patch: JobPatch): Promise<Job> {
      return db.transaction('rw', db.jobs, async () => {
        const current = await db.jobs.get(id);
        if (!current || !isLiveJob(current)) throw new Error(`Job not found: ${id}`);
        const at = now();
        const history =
          patch.status && patch.status !== current.status
            ? [...current.history, { status: patch.status, at }]
            : current.history;
        const next: Job = { ...current, ...patch, history, updatedAt: at };
        await db.jobs.put(next);
        return next;
      });
    },

    /** Replaces the job with a tombstone (id + deletedAt only). */
    async remove(id: string): Promise<void> {
      const tombstone: JobTombstone = { id, deletedAt: now() };
      await db.jobs.put(tombstone);
    },

    /** Every record, tombstones included. Used by sync. */
    async allRecords(): Promise<JobRecord[]> {
      return db.jobs.toArray();
    },

    /** Replaces the whole local store with the given records (after a merge). */
    async replaceAll(records: JobRecord[]): Promise<void> {
      await db.transaction('rw', db.jobs, async () => {
        await db.jobs.clear();
        await db.jobs.bulkPut(records);
      });
    },

    /** Deletes tombstones older than the TTL. Returns how many were purged. */
    async purgeExpiredTombstones(ttl: number = TOMBSTONE_TTL_MS): Promise<number> {
      const cutoff = now() - ttl;
      return db.jobs.where('deletedAt').below(cutoff).delete();
    },
  };
}

export type JobRepository = ReturnType<typeof createJobRepository>;
