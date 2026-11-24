<script lang="ts">
  import { onMount } from 'svelte';
  import { SyncMenu } from '@applicliq/ui';
  import { openSettings } from '@/lib/config';
  import { isSignedIn, isSyncConfigured, signIn } from '@/lib/google-auth';
  import { requestSync } from '@/lib/messages';
  import { SYNC_STATUS_KEY, type SyncStatus, readSyncStatus, signOutOfSync } from '@/lib/sync';

  let signedIn = $state(false);
  let status = $state<SyncStatus>({ syncing: false });
  let busy = $state(false);
  let actionError = $state<string>();

  async function load() {
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
      await load();
    }
  }

  function onStorageChange(changes: Record<string, unknown>, area: string) {
    if (area === 'local' && (SYNC_STATUS_KEY in changes || 'syncSignedIn' in changes)) {
      void load();
    }
  }

  onMount(() => {
    void load();
    browser.storage.onChanged.addListener(onStorageChange);
    return () => browser.storage.onChanged.removeListener(onStorageChange);
  });
</script>

<SyncMenu
  configured={isSyncConfigured()}
  {signedIn}
  {status}
  {busy}
  {actionError}
  onSignIn={() =>
    act(async () => {
      await signIn();
      requestSync();
    })}
  onSignOut={() => act(signOutOfSync)}
  onUnlock={() => void openSettings('data')}
  onSyncNow={() => {
    actionError = undefined;
    requestSync();
  }}
>
  {#snippet notConfigured()}
    Sync isn't set up in this build (no Google OAuth client ID). See docs/google-setup.md.
  {/snippet}
</SyncMenu>
