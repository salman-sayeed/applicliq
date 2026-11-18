<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import { Dashboard, SyncMenu } from '@pocket-career/ui';
  import favicon from '#lib/assets/favicon.svg';
  import { hasToken, isSyncConfigured, loadGis, signIn, signOut } from '#lib/google-auth.ts';
  import { GITHUB_URL } from '#lib/links.ts';
  import {
    clearLocalData,
    dashboardAdapter,
    db,
    runSync,
    startAutoSync,
    sync,
  } from '#lib/sync.svelte.ts';

  const configured = isSyncConfigured();

  let busy = $state(false);
  let actionError = $state<string>();

  // Load Google's sign-in script early so a click opens its popup without delay.
  onMount(() => {
    if (configured) loadGis().catch(() => {});
  });

  $effect(() => {
    if (sync.signedIn) return startAutoSync();
  });

  async function act(action: () => Promise<void>) {
    busy = true;
    actionError = undefined;
    try {
      await action();
    } catch (e) {
      actionError = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  const onSignIn = () =>
    act(async () => {
      const wasSignedIn = sync.signedIn;
      await signIn();
      sync.error = undefined;
      sync.signedIn = true;
      // A first sign-in starts auto-sync (the effect above); "Sign in again" syncs here.
      if (wasSignedIn) await runSync();
    });

  /**
   * Sign-out also clears this browser's copy: the site may be on a shared computer, and the jobs
   * live on in Drive. Changes that never reached Drive are only dropped after a confirm.
   */
  const onSignOut = () =>
    act(async () => {
      let synced = false;
      if (hasToken() && navigator.onLine) {
        await runSync();
        synced = !sync.error;
      }
      if (!synced && (await db.jobs.count()) > 0) {
        const ok = confirm(
          'Changes made since your last sync have not reached Google Drive. Sign out and remove them from this browser anyway?',
        );
        if (!ok) return;
      }
      await signOut();
      await clearLocalData();
      sync.signedIn = false;
    });
</script>

<svelte:head>
  <title>Dashboard · Pocket Career</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#snippet brand()}
  <a
    href={resolve('/(site)')}
    class="focus-visible:ring-accent flex items-center gap-2 rounded focus-visible:ring-2 focus-visible:outline-none"
  >
    <img src={favicon} alt="" class="size-6" />
    <span class="text-base font-semibold">Pocket Career</span>
  </a>
{/snippet}

{#if sync.signedIn}
  <Dashboard adapter={dashboardAdapter}>
    {#snippet header()}
      {@render brand()}
      <div class="ml-auto">
        <SyncMenu
          {configured}
          signedIn={sync.signedIn}
          status={sync}
          {busy}
          {actionError}
          {onSignIn}
          {onSignOut}
          onSyncNow={() => {
            actionError = undefined;
            void runSync();
          }}
          signOutNote="Signing out removes your jobs from this browser. They stay in your Google Drive."
        />
      </div>
    {/snippet}
    {#snippet emptyHint()}
      {#if sync.syncing && !sync.lastSyncedAt}
        <p>Loading your jobs from Google Drive…</p>
      {:else}
        <p>
          Save jobs with the
          <a href={resolve('/(site)')} class="text-accent underline-offset-2 hover:underline">
            Pocket Career extension
          </a>, signed in with the same Google account, and they show up here.
        </p>
      {/if}
    {/snippet}
  </Dashboard>
{:else}
  <main class="flex min-h-dvh items-center justify-center px-4 py-12">
    <div class="border-line flex w-full max-w-sm flex-col gap-5 rounded-xl border p-6 shadow-sm">
      {@render brand()}
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Your job search, from any browser</h1>
        <p class="text-ink-muted mt-2 text-sm">
          Sign in with Google to load the jobs you saved with the extension. Pocket Career only gets
          access to its own hidden folder in your Drive, never your other files.
        </p>
      </div>

      {#if configured}
        <button
          type="button"
          onclick={onSignIn}
          disabled={busy}
          class="bg-accent text-accent-ink focus-visible:ring-accent rounded-md px-3 py-2 text-sm font-medium transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in with Google'}
        </button>
        {#if actionError}
          <p role="alert" class="text-status-rejected text-sm">{actionError}</p>
        {/if}
      {:else}
        <p class="bg-surface-muted rounded-md px-3 py-2 text-sm">
          Google sign-in isn't set up on this copy of the site. If you're hosting it yourself, see
          <a
            href="{GITHUB_URL}/blob/main/docs/google-setup.md"
            rel="external"
            class="text-accent hover:underline"
          >
            docs/google-setup.md
          </a>.
        </p>
      {/if}

      <p class="text-ink-muted text-xs">
        No server, no tracking: your jobs stay in this browser and your own Google Drive.
        <a href={resolve('/(site)/privacy')} class="text-accent hover:underline">Privacy policy</a>
      </p>
    </div>
  </main>
{/if}
