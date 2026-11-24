<script lang="ts">
  import { jobsToCsv, statusLabel } from '@applicliq/core';
  import {
    STATUS_LABELS,
    SettingsPage,
    type SettingsPageId,
    type SettingsPlatform,
  } from '@applicliq/ui';
  import { onMount } from 'svelte';
  import {
    GITHUB_URL,
    SITE_URL,
    ISSUES_URL,
    getSaveShortcut,
    openDashboard,
    openShortcutSettings,
  } from '@/lib/config';
  import { dashboardAdapter } from '@/lib/dashboard-adapter';
  import { repo } from '@/lib/db';
  import { isSignedIn, isSyncConfigured, signIn, signOut } from '@/lib/google-auth';
  import { notifyJobsChanged, requestSync } from '@/lib/messages';
  import {
    reconcileFeaturePermissions,
    removeFeaturePermissions,
    requestFeaturePermissions,
  } from '@/lib/features';
  import { removePageAccess, requestPageAccess } from '@/lib/page-access';
  import {
    SYNC_STATUS_KEY,
    type SyncStatus,
    deleteDriveDataAndSignOut,
    readSyncStatus,
    resetSyncStatus,
  } from '@/lib/sync';

  let { section: initial }: { section?: SettingsPageId } = $props();

  // svelte-ignore state_referenced_locally
  let section = $state<SettingsPageId>(initial ?? 'goals');
  let signedIn = $state(false);
  let status = $state<SyncStatus>({ syncing: false });
  let busy = $state(false);
  let actionError = $state<string>();

  $effect(() => {
    history.replaceState(null, '', `#${section}`);
  });

  async function loadSync() {
    [signedIn, status] = await Promise.all([isSignedIn(), readSyncStatus()]);
  }

  async function act(action: () => Promise<void>) {
    busy = true;
    actionError = undefined;
    try {
      await action();
    } catch (e) {
      actionError = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
      await loadSync();
    }
  }

  function onStorageChange(changes: Record<string, unknown>, area: string) {
    if (area === 'local' && (SYNC_STATUS_KEY in changes || 'syncSignedIn' in changes)) {
      void loadSync();
    }
  }

  onMount(() => {
    void loadSync();
    void reconcileFeaturePermissions().catch(() => {});
    browser.storage.onChanged.addListener(onStorageChange);
    return () => browser.storage.onChanged.removeListener(onStorageChange);
  });

  const sync = $derived({
    configured: isSyncConfigured(),
    signedIn,
    account: status.account,
    status,
    busy,
    actionError,
    onSignIn: () =>
      act(async () => {
        await signIn();
        requestSync();
      }),
    onSignOut: () =>
      act(async () => {
        await signOut();
        await resetSyncStatus();
      }),
    onSyncNow: () => {
      actionError = undefined;
      requestSync();
    },
  });

  const platform: SettingsPlatform = {
    kind: 'extension',
    version: browser.runtime.getManifest().version,
    siteUrl: SITE_URL,
    githubUrl: GITHUB_URL,
    issuesUrl: ISSUES_URL,
    exportJSON: () => repo.exportJSON(),
    async exportCSV() {
      const [jobs, settings] = await Promise.all([repo.getJobs(), repo.getSettings()]);
      return jobsToCsv(jobs, (s) => statusLabel(settings, s, STATUS_LABELS[s]));
    },
    async importJSON(json) {
      const result = await repo.importJSON(json);
      notifyJobsChanged();
      return result;
    },
    async clearLocalData() {
      await repo.clearLocalData();
      await browser.storage.local.remove(['shownReminders', 'goalReminderDay']);
      await removePageAccess().catch(() => false);
      notifyJobsChanged();
    },
    async deleteDriveData() {
      await deleteDriveDataAndSignOut();
      await loadSync();
    },
    replayOnboarding: () => void openDashboard(undefined, { onboarding: true }),
    // Must run inside the click: the browser only shows the permission prompt for a user gesture.
    // Turning the badge off keeps the access while the sidebar (which follows tabs) uses it.
    setPageAccess: (on) =>
      on
        ? requestPageAccess()
        : repo.getSettings().then(async (s) => {
            if (s.jobPages.openIn !== 'sidebar') await removePageAccess();
            return false;
          }),
    requestPermissions: requestFeaturePermissions,
    removePermissions: removeFeaturePermissions,
    getShortcut: getSaveShortcut,
    openShortcutSettings: () => void openShortcutSettings(),
  };
</script>

<SettingsPage adapter={dashboardAdapter} {platform} {sync} bind:section>
  {#snippet header()}
    <img src="/icon/32.png" alt="" class="size-6" />
    <span class="text-base font-semibold">AppliCliq</span>
    <span class="text-ink-muted text-base">/ Settings</span>
    <button
      type="button"
      onclick={() => openDashboard()}
      class="text-accent focus-visible:ring-accent ml-auto rounded text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
    >
      Open dashboard ↗
    </button>
  {/snippet}
</SettingsPage>
