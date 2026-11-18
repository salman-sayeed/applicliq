<script lang="ts">
  import { JOB_STATUSES } from '@pocket-career/core';
  import { Button, StatusBadge } from '@pocket-career/ui';

  const version = browser.runtime.getManifest().version;
</script>

<main class="flex flex-col gap-4 p-4">
  <header class="flex items-baseline justify-between">
    <h1 class="text-base font-semibold">Pocket Career</h1>
    <span class="text-ink-muted text-xs">v{version}</span>
  </header>

  <p class="text-ink-muted text-sm">
    Save the job posting you're looking at and track it through every stage. Everything stays on
    this device and in your own Google Drive.
  </p>

  <div class="flex flex-wrap gap-1.5">
    {#each JOB_STATUSES as status (status)}
      <StatusBadge {status} />
    {/each}
  </div>

  <Button disabled title="Coming soon">Save this job</Button>
</main>
