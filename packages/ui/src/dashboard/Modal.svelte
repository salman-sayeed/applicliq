<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { rememberFocus, trapTab } from '../a11y/focus';
  import { fade, fly } from '../motion';

  /** A modal dialog: focus moves in and comes back, Tab stays inside, Escape closes. */
  let {
    title,
    description,
    wide = false,
    onclose,
    children,
    footer,
  }: {
    title: string;
    description?: string;
    /** Wider panel (comparisons). */
    wide?: boolean;
    onclose: () => void;
    children: Snippet;
    footer?: Snippet;
  } = $props();

  const id = `modal-${Math.random().toString(36).slice(2, 8)}`;
  let dialog = $state<HTMLElement>();
  const restoreFocus = rememberFocus();
  onMount(() => {
    dialog?.focus();
    return restoreFocus;
  });
</script>

<!-- Capture phase: Escape closes only the dialog, not the job panel under it. -->
<svelte:window
  onkeydowncapture={(e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    } else trapTab(e, dialog);
  }}
/>

<div
  transition:fade={{ duration: 150 }}
  class="bg-ink/40 fixed inset-0 z-50 flex items-end justify-center p-2 sm:items-center sm:p-4"
  role="presentation"
  onclick={(e) => {
    if (e.target === e.currentTarget) onclose();
  }}
>
  <div
    bind:this={dialog}
    role="dialog"
    aria-modal="true"
    aria-labelledby="{id}-title"
    aria-describedby={description ? `${id}-desc` : undefined}
    tabindex="-1"
    transition:fly={{ y: 12, duration: 150 }}
    class="bg-surface border-line flex max-h-[92dvh] w-full flex-col rounded-xl border shadow-2xl outline-none {wide
      ? 'max-w-4xl'
      : 'max-w-lg'}"
  >
    <header class="border-line flex items-start gap-3 border-b px-5 py-4">
      <div class="min-w-0 flex-1">
        <h2 id="{id}-title" class="text-base font-semibold">{title}</h2>
        {#if description}
          <p id="{id}-desc" class="text-ink-muted mt-0.5 text-sm">{description}</p>
        {/if}
      </div>
      <button
        type="button"
        onclick={onclose}
        aria-label="Close"
        class="text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:ring-accent -mt-1 -mr-2 rounded-md p-1.5 text-lg leading-none transition focus-visible:ring-2 focus-visible:outline-none"
      >
        ×
      </button>
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">{@render children()}</div>
    {#if footer}
      <footer class="border-line flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3">
        {@render footer()}
      </footer>
    {/if}
  </div>
</div>
