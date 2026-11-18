import type { Job, JobPatch } from '@pocket-career/core';

/**
 * Everything the dashboard needs from storage. The dashboard never touches extension or
 * platform APIs: the extension page and the web app each pass their own implementation
 * (both can simply wrap `createJobRepository` from `@pocket-career/core`).
 */
export type DashboardAdapter = {
  /** Calls `listener` with all live jobs now and after every change; returns an unsubscribe. */
  watchJobs(listener: (jobs: Job[]) => void, onError?: (error: unknown) => void): () => void;
  updateJob(id: string, patch: JobPatch): Promise<Job>;
  deleteJob(id: string): Promise<boolean>;
  /** Undo for `deleteJob`. */
  restoreJob(job: Job): Promise<Job>;
};
