<script lang="ts">
  import type { StatusChange } from '@applicliq/core';
  import { getPrefs } from '../prefs.svelte';
  import { STATUS_DOT } from '../status';
  import { formatAgo } from './format';

  let { history }: { history: StatusChange[] } = $props();

  const prefs = getPrefs();
</script>

{#if history.length}
  <ol class="relative ml-1">
    {#each history as entry, i (i)}
      <li class="relative flex gap-3 pb-3 last:pb-0">
        {#if i < history.length - 1}
          <span class="bg-line absolute top-3 left-[3px] h-full w-px" aria-hidden="true"></span>
        {/if}
        <span
          class="ring-surface relative mt-1.5 size-[7px] shrink-0 rounded-full ring-4 {STATUS_DOT[
            entry.status
          ]}"
          aria-hidden="true"
        ></span>
        <div class="min-w-0 text-sm">
          <span class="font-medium">{prefs.status(entry.status)}</span>
          <span class="text-ink-muted block text-xs">
            <time datetime={new Date(entry.at).toISOString()}>{prefs.dateTime(entry.at)}</time>
            · {formatAgo(entry.at)}
          </span>
        </div>
      </li>
    {/each}
  </ol>
{:else}
  <p class="text-ink-muted text-sm">No status changes yet.</p>
{/if}
