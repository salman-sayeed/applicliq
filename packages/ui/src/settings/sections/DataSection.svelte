<script lang="ts">
  import { SYNC_INTERVALS } from '@pocket-career/core';
  import { downloadFile } from '../../dashboard/format';
  import Field from '../Field.svelte';
  import { button, danger, input, primary } from '../styles';
  import type { SectionProps, SettingsPlatform, SettingsSync } from '../types';

  let {
    settings,
    save,
    sync,
    platform,
    notify,
  }: SectionProps & {
    sync: SettingsSync;
    platform: SettingsPlatform;
    notify: (message: string, tone?: 'info' | 'error') => void;
  } = $props();

  const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const stamp = () => new Date().toISOString().slice(0, 10);

  let working = $state<string>();
  let confirmClear = $state(false);
  let deleteText = $state('');
  let fileInput = $state<HTMLInputElement>();

  const CONFIRM_WORD = 'delete';
  const error = $derived(sync.status.error);

  async function run(label: string, task: () => Promise<void>) {
    working = label;
    try {
      await task();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      working = undefined;
    }
  }

  const exportJSON = () =>
    run('export-json', async () => {
      downloadFile(
        `pocket-career-${stamp()}.json`,
        await platform.exportJSON(),
        'application/json',
      );
    });

  const exportCSV = () =>
    run('export-csv', async () => {
      downloadFile(
        `pocket-career-${stamp()}.csv`,
        await platform.exportCSV(),
        'text/csv;charset=utf-8',
      );
    });

  function importFile(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    void run('import', async () => {
      const result = await platform.importJSON(await file.text());
      const skipped = result.skipped ? `, ${result.skipped} skipped` : '';
      const extra = result.settingsApplied ? ' Settings updated from the file.' : '';
      notify(`Imported ${result.imported} records${skipped}.${extra}`);
    });
  }

  const clearLocal = () =>
    run('clear', async () => {
      await platform.clearLocalData();
      confirmClear = false;
      notify('Local data cleared');
    });

  const deleteDrive = () =>
    run('delete-drive', async () => {
      await platform.deleteDriveData();
      deleteText = '';
      notify('Your Pocket Career data was deleted from Google Drive');
    });
</script>

<section class="py-4" aria-labelledby="drive-heading">
  <h3 id="drive-heading" class="text-sm font-medium">Google Drive</h3>
  <p class="text-ink-muted mt-0.5 mb-3 text-xs">
    Syncs through a hidden app folder in your own Drive. Pocket Career can't see your other files.
  </p>
  {#if !sync.configured}
    <p class="bg-surface-muted rounded-md px-3 py-2 text-xs">
      Sync isn't set up in this build (no Google OAuth client ID).
    </p>
  {:else if !sync.signedIn}
    <button type="button" class={primary} disabled={sync.busy} onclick={sync.onSignIn}>
      {sync.busy ? 'Signing in…' : 'Sign in with Google'}
    </button>
  {:else}
    <dl class="mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt class="text-ink-muted">Account</dt>
      <dd class="truncate">{sync.account ?? 'Signed in'}</dd>
      <dt class="text-ink-muted">Last synced</dt>
      <dd class="tabular-nums">
        {sync.status.syncing
          ? 'Syncing…'
          : sync.status.lastSyncedAt
            ? dateTime.format(sync.status.lastSyncedAt)
            : 'Never'}
      </dd>
    </dl>
    {#if error}
      <p
        role="alert"
        class="mb-3 rounded-md px-2.5 py-2 text-xs {error.kind === 'offline'
          ? 'bg-surface-muted'
          : 'bg-status-rejected/10 text-status-rejected'}"
      >
        {error.message}
      </p>
    {/if}
    <div class="flex flex-wrap gap-2">
      {#if error?.kind === 'auth'}
        <button type="button" class={primary} disabled={sync.busy} onclick={sync.onSignIn}>
          Sign in again
        </button>
      {:else}
        <button
          type="button"
          class={primary}
          disabled={sync.busy || sync.status.syncing}
          onclick={sync.onSyncNow}
        >
          {sync.status.syncing ? 'Syncing…' : 'Sync now'}
        </button>
      {/if}
      <button type="button" class={button} disabled={sync.busy} onclick={sync.onSignOut}>
        Sign out
      </button>
    </div>
  {/if}
  {#if sync.actionError}
    <p role="alert" class="text-status-rejected mt-2 text-xs">{sync.actionError}</p>
  {/if}
</section>

<div class="border-line border-t">
  <Field
    label="Sync every"
    id="sync-interval"
    hint="Pocket Career also syncs a few seconds after each change."
  >
    <select
      id="sync-interval"
      class={input}
      value={String(settings.sync.syncIntervalMinutes)}
      onchange={(e) => save({ sync: { syncIntervalMinutes: Number(e.currentTarget.value) } })}
    >
      {#each SYNC_INTERVALS as minutes (minutes)}
        <option value={String(minutes)}>{minutes === 60 ? '1 hour' : `${minutes} minutes`}</option>
      {/each}
    </select>
  </Field>
</div>

<div class="border-line border-t">
  <Field
    label="Export"
    hint="JSON is a full backup you can import again (deletions and settings included). CSV opens in a spreadsheet."
  >
    <button type="button" class={button} disabled={!!working} onclick={exportJSON}>
      Export JSON
    </button>
    <button type="button" class={button} disabled={!!working} onclick={exportCSV}>
      Export CSV
    </button>
  </Field>

  <Field
    label="Import"
    hint="Merges a Pocket Career JSON export: newer versions of each job win, nothing here is lost."
  >
    <input
      bind:this={fileInput}
      type="file"
      accept="application/json,.json"
      class="hidden"
      onchange={importFile}
    />
    <button type="button" class={button} disabled={!!working} onclick={() => fileInput?.click()}>
      {working === 'import' ? 'Importing…' : 'Import JSON'}
    </button>
  </Field>
</div>

<section
  class="border-status-rejected/30 mt-4 rounded-lg border p-4"
  aria-labelledby="danger-heading"
>
  <h3 id="danger-heading" class="text-status-rejected text-sm font-semibold">Danger zone</h3>

  <Field
    label="Clear local data"
    hint={sync.signedIn
      ? 'Removes your jobs and settings from this browser. While you stay signed in, the next sync downloads them again from Drive.'
      : 'Removes your jobs and settings from this browser. Export a backup first: this cannot be undone.'}
  >
    {#if confirmClear}
      <button type="button" class={danger} disabled={!!working} onclick={clearLocal}>
        Yes, clear it
      </button>
      <button type="button" class={button} onclick={() => (confirmClear = false)}>Cancel</button>
    {:else}
      <button type="button" class={danger} onclick={() => (confirmClear = true)}>
        Clear local data…
      </button>
    {/if}
  </Field>

  <Field
    label="Delete Drive data"
    id="delete-drive"
    hint={platform.kind === 'web'
      ? `Deletes the Pocket Career file from your Google Drive, then signs out and clears this browser. Other devices still signed in upload their copy again. Type “${CONFIRM_WORD}” to confirm.`
      : `Deletes the Pocket Career file from your Google Drive and signs this device out of sync. Your jobs stay here. Other devices still signed in upload their copy again. Type “${CONFIRM_WORD}” to confirm.`}
  >
    <input
      id="delete-drive"
      class="{input} w-28"
      placeholder={CONFIRM_WORD}
      autocomplete="off"
      disabled={!sync.signedIn}
      bind:value={deleteText}
    />
    <button
      type="button"
      class={danger}
      disabled={!sync.signedIn || deleteText.trim().toLowerCase() !== CONFIRM_WORD || !!working}
      onclick={deleteDrive}
    >
      {working === 'delete-drive' ? 'Deleting…' : 'Delete'}
    </button>
  </Field>
</section>
