import type { ImportResult, Settings, SettingsPatch } from '@career-pocket/core';
import type { SyncMenuStatus } from '../dashboard/types';

/** What the settings page needs from the app it runs in (extension page or web app). */
export type SettingsPlatform = {
  kind: 'extension' | 'web';
  version: string;
  githubUrl: string;
  issuesUrl: string;
  exportJSON(): Promise<string>;
  exportCSV(): Promise<string>;
  importJSON(json: string): Promise<ImportResult>;
  /** Empties this browser's copy (jobs and settings). */
  clearLocalData(): Promise<void>;
  /** Deletes the Career Pocket file from Drive and stops syncing on this device. */
  deleteDriveData(): Promise<void>;
  /** Shows the first-run introduction again. */
  replayOnboarding(): void;
  /** Extension: asks for (or drops) access to all sites for the page badge. Call from a click. */
  setPageAccess?(on: boolean): Promise<boolean>;
  /** Extension: the save shortcut as the browser shows it, if one is set. */
  getShortcut?(): Promise<string | undefined>;
  /** Extension: opens the browser's keyboard shortcut settings. */
  openShortcutSettings?(): void;
};

/** Drive sync as the settings page shows and controls it. */
export type SettingsSync = {
  /** False when the build has no OAuth client ID. */
  configured: boolean;
  signedIn: boolean;
  /** The Google account's email, once known. */
  account?: string;
  status: SyncMenuStatus;
  /** A sign-in or sign-out is in progress. */
  busy: boolean;
  actionError?: string;
  onSignIn(): void;
  onSignOut(): void;
  onSyncNow(): void;
};

/** Props every section gets. */
export type SectionProps = {
  settings: Settings;
  save: (patch: SettingsPatch) => Promise<void>;
};
