import type { DashboardAdapter } from '@pocket-career/ui';
import { repo } from './db';
import { notifyJobsChanged } from './messages';

/** Runs a write, then tells the background (badge, reminders) that data changed. */
function notifying<A extends unknown[], R>(write: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    const result = await write(...args);
    notifyJobsChanged();
    return result;
  };
}

/** The shared dashboard reads and writes the extension's IndexedDB through the repository. */
export const dashboardAdapter: DashboardAdapter = {
  watchJobs: repo.watchJobs,
  updateJob: notifying(repo.updateJob),
  deleteJob: notifying(repo.deleteJob),
  restoreJob: notifying(repo.restoreJob),
  getSettings: repo.getSettings,
  updateSettings: notifying(repo.updateSettings),
};
