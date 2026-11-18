<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    hint,
    error,
    id,
    children,
  }: {
    label: string;
    hint?: string;
    error?: string;
    /** The control's id, so the label points at it. */
    id?: string;
    children: Snippet;
  } = $props();
</script>

<div class="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
  <div class="min-w-0 sm:max-w-sm">
    {#if id}
      <label for={id} class="text-sm font-medium">{label}</label>
    {:else}
      <p class="text-sm font-medium">{label}</p>
    {/if}
    {#if hint}<p class="text-ink-muted mt-0.5 text-xs leading-relaxed">{hint}</p>{/if}
    {#if error}<p role="alert" class="text-status-rejected mt-1 text-xs">{error}</p>{/if}
  </div>
  <div class="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{@render children()}</div>
</div>
