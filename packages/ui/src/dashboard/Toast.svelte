<script lang="ts">
  import { fly } from '../motion';
  import type { ToastMessage } from './types';

  let { toast, ondismiss }: { toast?: ToastMessage; ondismiss: () => void } = $props();
</script>

<div
  class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
  role="status"
  aria-live="polite"
>
  {#if toast}
    {#key toast.id}
      <div
        transition:fly={{ y: 8, duration: 150 }}
        class="bg-ink text-surface pointer-events-auto flex max-w-md items-center gap-3 rounded-lg py-2 pr-2 pl-4 text-sm shadow-lg"
      >
        <span>
          {#if toast.tone === 'error'}<span aria-hidden="true">⚠ </span>{/if}{toast.message}
        </span>
        {#if toast.action}
          <button
            type="button"
            onclick={() => {
              toast.action?.run();
              ondismiss();
            }}
            class="hover:bg-surface/15 focus-visible:ring-accent rounded px-2 py-1 font-semibold underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
          >
            {toast.action.label}
          </button>
        {/if}
        <button
          type="button"
          onclick={ondismiss}
          aria-label="Dismiss"
          class="text-surface/60 hover:text-surface focus-visible:ring-accent rounded px-1.5 py-1 focus-visible:ring-2 focus-visible:outline-none"
        >
          ×
        </button>
      </div>
    {/key}
  {/if}
</div>
