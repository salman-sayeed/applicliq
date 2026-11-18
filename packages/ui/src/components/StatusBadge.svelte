<script lang="ts">
  import type { JobStatus } from '@pocket-career/core';
  import { STATUS_LABELS } from '../status';

  let { status }: { status: JobStatus } = $props();

  // Full class names so Tailwind can detect them.
  const dot: Record<JobStatus, string> = {
    saved: 'bg-status-saved',
    applied: 'bg-status-applied',
    assessment: 'bg-status-assessment',
    interview: 'bg-status-interview',
    offer: 'bg-status-offer',
    rejected: 'bg-status-rejected',
    ghosted: 'bg-status-ghosted',
    withdrawn: 'bg-status-withdrawn',
  };
</script>

<span
  class="border-line text-ink inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
>
  <span class="size-1.5 rounded-full {dot[status]}" aria-hidden="true"></span>
  {STATUS_LABELS[status]}
</span>
