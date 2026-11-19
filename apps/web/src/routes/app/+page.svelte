<script lang="ts">
  import { replaceState } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { Dashboard, SyncMenu } from '@career-pocket/ui';
  import logo from '#lib/assets/logo.png';
  import { isSyncConfigured, loadGis } from '#lib/google-auth.ts';
  import { GITHUB_URL } from '#lib/links.ts';
  import { session, startSignIn, startSignOut, syncNow } from '#lib/session.svelte.ts';
  import { dashboardAdapter, startAutoSync, sync } from '#lib/sync.svelte.ts';

  const configured = isSyncConfigured();

  // `/app#onboarding` (from "Replay onboarding" in settings) shows the introduction again.
  const onboarding = page.url.hash === '#onboarding';

  // Load Google's sign-in script early so a click opens its popup without delay.
  onMount(() => {
    if (configured) loadGis().catch(() => {});
    if (onboarding) replaceState(resolve('/app'), {});
  });

  $effect(() => {
    if (sync.signedIn) return startAutoSync();
  });

  const onSignIn = () => void startSignIn();
  const onSignOut = () => void startSignOut();
</script>

<svelte:head>
  <title>Dashboard · Career Pocket</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#snippet brand()}
  <a
    href={resolve('/(site)')}
    class="focus-visible:ring-accent flex items-center gap-2 rounded focus-visible:ring-2 focus-visible:outline-none"
  >
    <img src={logo} alt="" class="size-6" />
    <span class="text-base font-semibold">Career Pocket</span>
  </a>
{/snippet}

{#if sync.signedIn}
  <Dashboard adapter={dashboardAdapter} {onboarding}>
    {#snippet header()}
      {@render brand()}
      <div class="ml-auto flex items-center gap-2">
        <SyncMenu
          {configured}
          signedIn={sync.signedIn}
          status={sync}
          busy={session.busy}
          actionError={session.actionError}
          {onSignIn}
          {onSignOut}
          onSyncNow={syncNow}
          signOutNote="Signing out removes your jobs from this browser. They stay in your Google Drive."
        />
        <a
          href={resolve('/app/settings')}
          aria-label="Settings"
          title="Settings"
          class="text-ink-muted hover:text-ink hover:bg-surface-muted focus-visible:ring-accent rounded-md p-1.5 transition focus-visible:ring-2 focus-visible:outline-none"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="size-4" aria-hidden="true">
            <path
              fill-rule="evenodd"
              d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
              clip-rule="evenodd"
            />
          </svg>
        </a>
      </div>
    {/snippet}
    {#snippet emptyHint()}
      {#if sync.syncing && !sync.lastSyncedAt}
        <p>Loading your jobs from Google Drive…</p>
      {:else}
        <p>
          Save jobs with the
          <a href={resolve('/(site)')} class="text-accent underline-offset-2 hover:underline">
            Career Pocket extension
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
          Sign in with Google to load the jobs you saved with the extension. Career Pocket only gets
          access to its own hidden folder in your Drive, never your other files.
        </p>
      </div>

      {#if configured}
        <button
          type="button"
          onclick={onSignIn}
          disabled={session.busy}
          class="bg-accent text-accent-ink focus-visible:ring-accent rounded-md px-3 py-2 text-sm font-medium transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
        >
          {session.busy ? 'Signing in…' : 'Sign in with Google'}
        </button>
        {#if session.actionError}
          <p role="alert" class="text-status-rejected text-sm">{session.actionError}</p>
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
