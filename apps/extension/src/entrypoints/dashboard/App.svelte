<script lang="ts">
  import { Dashboard } from '@career-pocket/ui';
  import { onMount } from 'svelte';
  import { getSaveShortcut, openSettings } from '@/lib/config';
  import { dashboardAdapter } from '@/lib/dashboard-adapter';
  import SyncControl from './SyncControl.svelte';
  import SettingsLink from './SettingsLink.svelte';

  let { initialJobId, onboarding }: { initialJobId?: string; onboarding?: boolean } = $props();

  let shortcut = $state<string>();
  onMount(() => {
    void getSaveShortcut().then((value) => (shortcut = value));
  });
</script>

<Dashboard adapter={dashboardAdapter} {initialJobId} {onboarding}>
  {#snippet header()}
    <img src="/icon/32.png" alt="" class="size-6" />
    <h1 class="text-base font-semibold">Career Pocket</h1>
    <div class="ml-auto flex items-center gap-2">
      <SyncControl />
      <SettingsLink onclick={() => openSettings()} />
    </div>
  {/snippet}
  {#snippet emptyHint()}
    <p>
      Open a job posting and click the Career Pocket icon{#if shortcut}, or press
        <kbd class="border-line rounded border px-1 font-sans text-xs">{shortcut}</kbd>{/if} to save it.
    </p>
  {/snippet}
</Dashboard>
