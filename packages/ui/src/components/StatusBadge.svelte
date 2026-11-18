<script lang="ts">
  import type { JobStatus } from '@pocket-career/core';
  import { STATUS_DOT, STATUS_LABELS } from '../status';

  let { status }: { status: JobStatus } = $props();
</script>

<span
  class="border-line text-ink inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
>
  <span class="size-1.5 rounded-full {STATUS_DOT[status]}" aria-hidden="true"></span>
  {STATUS_LABELS[status]}
</span>
