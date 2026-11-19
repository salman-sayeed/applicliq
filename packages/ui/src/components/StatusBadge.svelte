<script lang="ts">
  import type { JobStatus } from '@career-pocket/core';
  import { getPrefs } from '../prefs.svelte';
  import { STATUS_DOT } from '../status';

  let { status }: { status: JobStatus } = $props();

  const prefs = getPrefs();
</script>

<span
  class="border-line text-ink inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
>
  <span class="size-1.5 rounded-full {STATUS_DOT[status]}" aria-hidden="true"></span>
  {prefs.status(status)}
</span>
