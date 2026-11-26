import type {
  AutofillProfile,
  ImportDraft,
  Job,
  JobPatch,
  LocalState,
  Resume,
  ResumePatch,
  SavedAnswer,
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
  /** Folds `otherId` into `keepId` and deletes it (Smart helpers → Same job on two sites). */
  mergeDuplicates(keepId: string, otherId: string): Promise<Job>;
  /** Remembers that two jobs are not duplicates. */
  markNotDuplicate(a: string, b: string): Promise<void>;
  /** Live resumes now and after every change (Settings → Resumes, Resume match). */
  watchResumes(listener: (resumes: Resume[]) => void, onError?: (e: unknown) => void): () => void;
  addResume(input: { name: string; text?: string }): Promise<Resume>;
  updateResume(id: string, patch: ResumePatch): Promise<Resume>;
  duplicateResume(id: string): Promise<Resume>;
  deleteResume(id: string): Promise<boolean>;
  /** Undo for `deleteResume`. */
  restoreResume(resume: Resume): Promise<Resume>;
  /** Autofill's profile and saved answers (Settings → Autofill profile). Extension only. */
  autofill?: {
    watch(
      listener: (data: { profile: AutofillProfile; answers: SavedAnswer[] }) => void,
      onError?: (e: unknown) => void,
    ): () => void;
    saveProfile(profile: AutofillProfile): Promise<AutofillProfile>;
    addAnswer(input: { question: string; answer: string }): Promise<SavedAnswer>;
    updateAnswer(
      id: string,
      patch: Partial<Pick<SavedAnswer, 'question' | 'answer'>>,
    ): Promise<SavedAnswer>;
    deleteAnswer(id: string): Promise<boolean>;
  };
  getLocalState(): Promise<LocalState>;
  setLocalState(patch: LocalState): Promise<void>;
};
