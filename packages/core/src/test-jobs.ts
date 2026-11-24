import type { Job, JobStatus } from './types';

/** Test helper (not exported from the package): a job with the given history. */
let seq = 0;
export function testJob(history: [JobStatus, number][], extra: Partial<Job> = {}): Job {
  const entries = history.map(([status, when]) => ({ status, at: when }));
  return {
    id: `j${seq++}`,
    url: `https://a.test/${seq}`,
    title: 'Engineer',
    company: 'Acme',
    status: entries.at(-1)?.status ?? 'saved',
    history: entries,
    createdAt: entries[0]?.at ?? 0,
    updatedAt: entries.at(-1)?.at ?? 0,
    ...extra,
  };
}

export const DAY = 24 * 60 * 60 * 1000;
