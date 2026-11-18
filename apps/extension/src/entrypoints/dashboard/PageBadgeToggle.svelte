<script lang="ts">
  import { onMount } from 'svelte';
  import { hasPageAccess, removePageAccess, requestPageAccess } from '@/lib/page-access';

  let enabled = $state(false);
  let error = $state<string>();

  async function sync() {
    enabled = await hasPageAccess();
  }

  function onchange(event: Event & { currentTarget: HTMLInputElement }) {
    error = undefined;
    // The permission prompt needs the click's user gesture: call it before any await.
    const change = event.currentTarget.checked ? requestPageAccess() : removePageAccess();
    change.then(sync, () => {
      error = 'Could not change site access.';
      void sync();
    });
  }

  onMount(() => {
    void sync();
    // Access can also be changed from the browser's extension settings.
    browser.permissions.onAdded.addListener(sync);
    browser.permissions.onRemoved.addListener(sync);
    return () => {
      browser.permissions.onAdded.removeListener(sync);
      browser.permissions.onRemoved.removeListener(sync);
    };
  });
</script>

<label
  class="text-ink-muted flex cursor-pointer items-center gap-2 text-xs font-medium"
  title="Shows “Applied 12 days ago · Interview” on pages of jobs you saved. Needs access to all sites; page addresses are only checked against your saved jobs, on this device."
>
  <input type="checkbox" checked={enabled} {onchange} class="accent-accent size-3.5" />
  Badge on saved job pages
  {#if error}<span role="alert" class="text-status-rejected">{error}</span>{/if}
</label>
