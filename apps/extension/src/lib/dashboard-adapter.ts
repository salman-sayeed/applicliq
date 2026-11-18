import type { DashboardAdapter } from '@pocket-career/ui';
import { repo } from './db';

/** The shared dashboard reads and writes the extension's IndexedDB through the repository. */
export const dashboardAdapter: DashboardAdapter = {
  watchJobs: repo.watchJobs,
  updateJob: repo.updateJob,
  deleteJob: repo.deleteJob,
  restoreJob: repo.restoreJob,
};
