<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { SyncMenuStatus } from './types';

  let {
    configured,
    signedIn,
    status,
    busy = false,
    actionError,
    onSignIn,
    onSignOut,
    onSyncNow,
    notConfigured,
    signOutNote = 'Signing out keeps your jobs on this device.',
  }: {
    /** False when the build has no OAuth client ID. */
    configured: boolean;
    signedIn: boolean;
    status: SyncMenuStatus;
    /** A sign-in or sign-out is in progress. */
    busy?: boolean;
    /** Why the last sign-in or sign-out failed. */
    actionError?: string;
    /** Also used for "Sign in again" when the session expired. Call only from a click. */
    onSignIn: () => void;
    onSignOut: () => void;
    onSyncNow: () => void;
    /** Shown instead of the sign-in button when sync isn't configured. */
    notConfigured?: Snippet;
    signOutNote?: string;
  } = $props();

  let menu = $state<HTMLDetailsElement>();
  let now = $state(Date.now());

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

  function onWindowClick(event: MouseEvent) {
    if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
  }

  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(timer);
  });

  const primary =
    'bg-accent text-accent-ink focus-visible:ring-accent rounded-md px-3 py-1.5 text-sm font-medium transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50';
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
    class="border-line bg-surface absolute right-0 z-20 mt-2 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-lg border p-4 text-sm shadow-lg"
  >
    <div>
      <p class="text-ink font-semibold">Google Drive sync</p>
      <p class="text-ink-muted mt-1 text-xs">
        Keeps your jobs in sync through a hidden app folder in your own Drive. AppliCliq can't see
        your other files.
      </p>
    </div>

    {#if !configured}
      <div class="text-ink-muted text-xs">
        {#if notConfigured}{@render notConfigured()}{:else}Sync isn't set up in this build.{/if}
      </div>
    {:else if !signedIn}
      <button type="button" onclick={onSignIn} disabled={busy} class={primary}>
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
          <button type="button" onclick={onSignIn} disabled={busy} class="{primary} flex-1">
            Sign in again
          </button>
        {:else}
          <button
            type="button"
            onclick={onSyncNow}
            disabled={busy || status.syncing}
            class="{primary} flex-1"
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
      <p class="text-ink-muted text-xs">{signOutNote}</p>
    {/if}

    {#if actionError}
      <p role="alert" class="text-status-rejected text-xs">{actionError}</p>
    {/if}
  </div>
</details>
