import type { DashboardAdapter } from '@applicliq/ui';
import { repo } from './db';
import { notifyJobsChanged } from './messages';

/** Runs a write, then tells the background (badge, reminders, sync) that data changed. */
function notifying<A extends unknown[], R>(write: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    const result = await write(...args);
    notifyJobsChanged();
    return result;
  };
}

/** The shared dashboard and settings page read and write the extension's IndexedDB. */
export const dashboardAdapter: DashboardAdapter = {
  watchJobs: repo.watchJobs,
  updateJob: notifying(repo.updateJob),
  deleteJob: notifying(repo.deleteJob),
  restoreJob: notifying(repo.restoreJob),
  watchSettings: repo.watchSettings,
  updateSettings: notifying(repo.updateSettings),
  resetSettingsSection: notifying(repo.resetSettingsSection),
  renameTag: notifying(repo.renameTag),
  importJobs: notifying(repo.importJobs),
  undoImport: notifying(repo.undoImport),
  getLocalState: repo.getLocalState,
  setLocalState: repo.setLocalState,
};
