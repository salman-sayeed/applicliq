<script lang="ts">
  import type { RedFlag } from '@applicliq/core';
  import { slide } from '@applicliq/ui';

  /** The "Heads up" row: short, neutral notes about the job on this page (Smart helpers). */
  let { flags, onopen }: { flags: RedFlag[]; onopen: (jobId: string) => void } = $props();
</script>

{#if flags.length}
  <div
    transition:slide={{ duration: 150 }}
    role="status"
    class="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-900 dark:text-amber-200"
  >
    <p class="font-semibold">Heads up</p>
    <ul class="mt-0.5 space-y-0.5">
      {#each flags as flag (flag.kind)}
        <li class="flex items-baseline gap-1.5">
          <span aria-hidden="true" class="opacity-60">•</span>
          <span>
            {flag.text}
            {#if flag.jobId}
              ·
              <button
                type="button"
                onclick={() => onopen(flag.jobId!)}
                class="focus-visible:ring-accent rounded font-medium underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                See that job
              </button>
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  </div>
{/if}
