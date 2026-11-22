<script lang="ts">
  /** Copies `text` to the clipboard and says so for a moment. */
  let { text, label = 'Copy' }: { text: string; label?: string } = $props();

  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    copied = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied = false), 1500);
  }
</script>

<button
  type="button"
  onclick={copy}
  class="border-line text-ink hover:bg-surface-muted focus-visible:ring-accent inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition focus-visible:ring-2 focus-visible:outline-none"
>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="size-3.5"
    aria-hidden="true"
  >
    {#if copied}
      <path d="M20 6 9 17l-5-5" />
    {:else}
      <rect width="13" height="13" x="9" y="9" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    {/if}
  </svg>
  <span aria-live="polite">{copied ? 'Copied' : label}</span>
</button>
