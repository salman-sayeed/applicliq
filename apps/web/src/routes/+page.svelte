<script lang="ts">
  import { JOB_STATUSES } from '@pocket-career/core';
  import { Button, StatusBadge } from '@pocket-career/ui';
</script>

<svelte:head>
  <title>Pocket Career</title>
  <meta
    name="description"
    content="A free, open-source job application tracker. Your data stays on your device and in your own Google Drive."
  />
</svelte:head>

<main class="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-16">
  <h1 class="text-3xl font-semibold tracking-tight">Pocket Career</h1>
  <p class="text-ink-muted">
    Track every job application in one place. No account, no server: your data lives in your browser
    and syncs to a hidden folder in your own Google Drive.
  </p>

  <div class="flex flex-wrap gap-2">
    {#each JOB_STATUSES as status (status)}
      <StatusBadge {status} />
    {/each}
  </div>

  <div>
    <Button disabled title="Coming soon">Connect Google Drive</Button>
  </div>
</main>
