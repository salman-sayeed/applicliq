<script lang="ts">
  import { onMount } from 'svelte';
  import { isSignedIn, isSyncConfigured, signIn, signOut } from '@/lib/google-auth';
  import { requestSync } from '@/lib/messages';
  import { SYNC_STATUS_KEY, type SyncStatus, readSyncStatus, resetSyncStatus } from '@/lib/sync';

  const configured = isSyncConfigured();

  let signedIn = $state(false);
  let status = $state<SyncStatus>({ syncing: false });
  let busy = $state(false);
  let actionError = $state<string>();
  let now = $state(Date.now());
  let menu = $state<HTMLDetailsElement>();

  const error = $derived(status.error);
  const needsSignIn = $derived(error?.kind === 'auth');

  const summary = $derived.by(() => {
    if (!signedIn) return 'Sync off';
    if (status.syncing) return 'Syncing…';
    if (needsSignIn) return 'Sign in again';
    if (error?.kind === 'offline') return 'Offline';
    if (error) return 'Sync error';
    return status.lastSyncedAt ? `Synced ${relative(status.lastSyncedAt, now)}` : 'Not synced yet';
  });

  const dot = $derived(
    !signedIn
      ? 'bg-status-withdrawn'
      : status.syncing
        ? 'bg-status-applied animate-pulse'
        : error && error.kind !== 'offline'
          ? 'bg-status-rejected'
          : error
            ? 'bg-status-interview'
            : 'bg-status-offer',
  );

  const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  function relative(at: number, current: number): string {
    const minutes = Math.floor((current - at) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    return dateTime.format(at);
  }

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

  const onSignIn = () =>
    act(async () => {
      await signIn();
      requestSync();
    });

  const onSignOut = () =>
    act(async () => {
      await signOut();
      await resetSyncStatus();
    });

  function onSyncNow() {
    actionError = undefined;
    requestSync();
  }

  function onWindowClick(event: MouseEvent) {
    if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
  }

  function onStorageChange(changes: Record<string, unknown>, area: string) {
    if (area === 'local' && (SYNC_STATUS_KEY in changes || 'syncSignedIn' in changes)) {
      void load();
    }
  }

  onMount(() => {
    void load();
    browser.storage.onChanged.addListener(onStorageChange);
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => {
      browser.storage.onChanged.removeListener(onStorageChange);
      clearInterval(timer);
    };
  });
</script>

<svelte:window onclick={onWindowClick} />

<details bind:this={menu} class="relative">
  <summary
    class="text-ink-muted hover:bg-surface-muted focus-visible:ring-accent flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1 text-xs font-medium transition focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden"
  >
    <span class="size-2 rounded-full {dot}" aria-hidden="true"></span>
    {summary}
  </summary>

  <div
    class="border-line bg-surface absolute right-0 z-20 mt-2 flex w-72 flex-col gap-3 rounded-lg border p-4 text-sm shadow-lg"
  >
    <div>
      <p class="text-ink font-semibold">Google Drive sync</p>
      <p class="text-ink-muted mt-1 text-xs">
        Keeps your jobs in sync across browsers through a hidden app folder in your own Drive.
        Pocket Career can't see your other files. Everything works without it.
      </p>
    </div>

    {#if !configured}
      <p class="text-ink-muted text-xs">
        Sync isn't set up in this build (no Google OAuth client ID). See docs/google-setup.md.
      </p>
    {:else if !signedIn}
      <button
        type="button"
        onclick={onSignIn}
        disabled={busy}
        class="bg-accent text-accent-ink focus-visible:ring-accent rounded-md px-3 py-1.5 text-sm font-medium transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
      >
        {busy ? 'Signing in…' : 'Sign in with Google'}
      </button>
    {:else}
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt class="text-ink-muted">Last synced</dt>
        <dd class="text-ink tabular-nums">
          {status.lastSyncedAt ? dateTime.format(status.lastSyncedAt) : 'Never'}
        </dd>
      </dl>

      {#if error}
        <p
          role="alert"
          class="rounded-md px-2.5 py-2 text-xs {error.kind === 'offline'
            ? 'bg-surface-muted text-ink'
            : 'bg-status-rejected/10 text-status-rejected'}"
        >
          {error.message}
          {#if error.kind === 'offline'}Your changes are saved here and will sync when you're back
            online.{/if}
        </p>
      {/if}

      <div class="flex gap-2">
        {#if needsSignIn}
          <button
            type="button"
            onclick={onSignIn}
            disabled={busy}
            class="bg-accent text-accent-ink focus-visible:ring-accent flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          >
            Sign in again
          </button>
        {:else}
          <button
            type="button"
            onclick={onSyncNow}
            disabled={busy || status.syncing}
            class="bg-accent text-accent-ink focus-visible:ring-accent flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          >
            {status.syncing ? 'Syncing…' : 'Sync now'}
          </button>
        {/if}
        <button
          type="button"
          onclick={onSignOut}
          disabled={busy}
          class="border-line text-ink hover:bg-surface-muted focus-visible:ring-accent rounded-md border px-3 py-1.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
        >
          Sign out
        </button>
      </div>
      <p class="text-ink-muted text-xs">Signing out keeps your jobs on this device.</p>
    {/if}

    {#if actionError}
      <p role="alert" class="text-status-rejected text-xs">{actionError}</p>
    {/if}
  </div>
</details>
