import type {
  ImportDraft,
  Job,
  JobPatch,
  LocalState,
  Settings,
  SettingsPatch,
  SettingsSection,
} from '@applicliq/core';

/**
 * Everything the dashboard and the settings page need from storage. They never touch extension
 * or platform APIs: the extension page and the web app each pass their own implementation (both
 * wrap `createJobRepository` from `@applicliq/core`).
 */
export type DashboardAdapter = {
  /** Calls `listener` with all live jobs now and after every change; returns an unsubscribe. */
  watchJobs(listener: (jobs: Job[]) => void, onError?: (error: unknown) => void): () => void;
  updateJob(id: string, patch: JobPatch): Promise<Job>;
  deleteJob(id: string): Promise<boolean>;
  /** Undo for `deleteJob`. */
  restoreJob(job: Job): Promise<Job>;
  /** Calls `listener` with the settings now and after every change; returns an unsubscribe. */
  watchSettings(listener: (settings: Settings) => void, onError?: (e: unknown) => void): () => void;
  updateSettings(patch: SettingsPatch): Promise<Settings>;
  resetSettingsSection(section: SettingsSection): Promise<Settings>;
  /** Renames a tag on every job; returns how many changed. */
  renameTag(from: string, to: string): Promise<number>;
  /** Adds imported jobs as one batch (Settings → Import). */
  importJobs(drafts: ImportDraft[]): Promise<{ batchId: string; count: number }>;
  /** Deletes the jobs of an import batch (as tombstones); returns how many. */
  undoImport(batchId: string): Promise<number>;
  getLocalState(): Promise<LocalState>;
  setLocalState(patch: LocalState): Promise<void>;
};
