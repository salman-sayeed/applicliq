<script lang="ts">
  import { Dashboard } from '@pocket-career/ui';
  import { dashboardAdapter } from '@/lib/dashboard-adapter';
  import PageBadgeToggle from './PageBadgeToggle.svelte';
  import SyncControl from './SyncControl.svelte';

  let { initialJobId }: { initialJobId?: string } = $props();
</script>

<Dashboard adapter={dashboardAdapter} {initialJobId}>
  {#snippet header()}
    <img src="/icon/32.png" alt="" class="size-6" />
    <h1 class="text-base font-semibold">Pocket Career</h1>
    <div class="ml-auto flex items-center gap-4">
      <PageBadgeToggle />
      <SyncControl />
    </div>
  {/snippet}
  {#snippet emptyHint()}
    <p>
      Open a job posting and click the Pocket Career icon, or press
      <kbd class="border-line rounded border px-1 font-sans text-xs">Alt+Shift+S</kbd> to save it.
    </p>
  {/snippet}
</Dashboard>
