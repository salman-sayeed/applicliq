<script lang="ts">
  import { type Job, daysSince } from '@career-pocket/core';
  import { StatusBadge } from '@career-pocket/ui';

  let { jobs }: { jobs: Job[] } = $props();

  const ago = (at: number) => {
    const days = daysSince(at);
    return days === 0 ? 'today' : `${days}d`;
  };
</script>

{#if jobs.length}
  <section class="border-line border-t pt-3">
    <h2 class="text-ink-muted mb-1.5 text-xs font-medium tracking-wide uppercase">Recent</h2>
    <ul class="-mx-2 flex flex-col">
      {#each jobs as job (job.id)}
        <li>
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            class="hover:bg-surface-muted focus-visible:ring-accent flex items-center gap-2 rounded-md px-2 py-1.5 transition focus-visible:ring-2 focus-visible:outline-none"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm">{job.title}</span>
              <span class="text-ink-muted block truncate text-xs">{job.company}</span>
            </span>
            <StatusBadge status={job.status} />
            <span class="text-ink-muted w-9 text-right text-xs tabular-nums">
              {ago(job.updatedAt)}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  </section>
{/if}
