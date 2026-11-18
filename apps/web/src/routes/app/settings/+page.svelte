<script lang="ts">
  import { goto, replaceState } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { jobsToCsv, statusLabel } from '@pocket-career/core';
  import {
    SETTINGS_PAGES,
    STATUS_LABELS,
    SettingsPage,
    type SettingsPageId,
    type SettingsPlatform,
    type SettingsSync,
  } from '@pocket-career/ui';
  import favicon from '#lib/assets/favicon.svg';
  import { isSyncConfigured, loadGis } from '#lib/google-auth.ts';
  import { GITHUB_URL, ISSUES_URL } from '#lib/links.ts';
  import { session, startSignIn, startSignOut, syncNow } from '#lib/session.svelte.ts';
  import {
    clearLocalData,
    dashboardAdapter,
    deleteRemoteData,
    repo,
    scheduleSync,
    startAutoSync,
    sync,
  } from '#lib/sync.svelte.ts';

  const configured = isSyncConfigured();

  // `/app/settings#regional` opens that section.
  const fromHash = page.url.hash.slice(1);
  let section = $state<SettingsPageId>(
    SETTINGS_PAGES.some((p) => p.id === fromHash) ? (fromHash as SettingsPageId) : 'goals',
  );

  onMount(() => {
    if (configured) loadGis().catch(() => {});
  });

  // The jobs and settings here only exist while signed in (sign-out clears this browser).
  $effect(() => {
    if (!sync.signedIn) void goto(resolve('/app'), { replaceState: true });
    else return startAutoSync();
  });

  $effect(() => {
    // Same page, new hash: keeps the open section on reload.
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- a hash on this page
    replaceState(`#${section}`, {});
  });

  const syncState: SettingsSync = $derived({
    configured,
    signedIn: sync.signedIn,
    account: sync.account,
    status: sync,
    busy: session.busy,
    actionError: session.actionError,
    onSignIn: () => void startSignIn(),
    onSignOut: () => void startSignOut(),
    onSyncNow: syncNow,
  });

  const platform: SettingsPlatform = {
    kind: 'web',
    version: __APP_VERSION__,
    githubUrl: GITHUB_URL,
    issuesUrl: ISSUES_URL,
    exportJSON: () => repo.exportJSON(),
    async exportCSV() {
      const [jobs, settings] = await Promise.all([repo.getJobs(), repo.getSettings()]);
      return jobsToCsv(jobs, (s) => statusLabel(settings, s, STATUS_LABELS[s]));
    },
    async importJSON(json) {
      const result = await repo.importJSON(json);
      scheduleSync();
      return result;
    },
    clearLocalData,
    async deleteDriveData() {
      await deleteRemoteData();
      // Otherwise the next sync would upload this browser's copy again.
      await startSignOut({ force: true });
    },
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- a resolved path plus a hash
    replayOnboarding: () => void goto(`${resolve('/app')}#onboarding`),
  };
</script>

<svelte:head>
  <title>Settings · Pocket Career</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if sync.signedIn}
  <SettingsPage adapter={dashboardAdapter} {platform} sync={syncState} bind:section>
    {#snippet header()}
      <a
        href={resolve('/app')}
        class="focus-visible:ring-accent flex items-center gap-2 rounded focus-visible:ring-2 focus-visible:outline-none"
      >
        <img src={favicon} alt="" class="size-6" />
        <span class="text-base font-semibold">Pocket Career</span>
      </a>
      <span class="text-ink-muted text-base">/ Settings</span>
      <a
        href={resolve('/app')}
        class="text-accent focus-visible:ring-accent ml-auto rounded text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
      >
        ← Dashboard
      </a>
    {/snippet}
  </SettingsPage>
{/if}
