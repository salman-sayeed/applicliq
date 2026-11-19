<script lang="ts">
  import { onMount } from 'svelte';
  import { isSignedIn, isSyncConfigured, signIn } from '@/lib/google-auth';
  import { requestSync } from '@/lib/messages';

  const configured = isSyncConfigured();
  let signedIn = $state(false);
  let busy = $state(false);
  let error = $state<string>();

  onMount(() => {
    void isSignedIn().then((value) => (signedIn = value));
  });

  async function connect() {
    busy = true;
    error = undefined;
    try {
      await signIn();
      requestSync();
      signedIn = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

{#if !configured}
  <p class="bg-surface-muted rounded-md px-3 py-2 text-sm">
    Sync isn't set up in this build, so your jobs stay in this browser.
  </p>
{:else if signedIn}
  <p class="text-status-offer text-sm font-medium" role="status">
    ✓ Signed in. Your jobs sync with Google Drive.
  </p>
{:else}
  <button
    type="button"
    onclick={connect}
    disabled={busy}
    class="border-line hover:bg-surface-muted focus-visible:ring-accent rounded-md border px-3 py-1.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
  >
    {busy ? 'Signing in…' : 'Sign in with Google'}
  </button>
  {#if error}
    <p role="alert" class="text-status-rejected mt-2 text-sm">{error}</p>
  {/if}
{/if}
