import type { SyncErrorKind } from '@pocket-career/core';

export type ToastMessage = {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
  tone?: 'info' | 'error';
};

export type DashboardView = 'list' | 'board' | 'stats';

/** What a sync runner reports to `SyncMenu`; each app keeps it in its own storage. */
export type SyncMenuStatus = {
  syncing: boolean;
  lastSyncedAt?: number;
  error?: { kind: SyncErrorKind; message: string };
};
