<script lang="ts">
  let {
    accept,
    label,
    hint,
    busy = false,
    onfile,
  }: {
    /** For the file picker, e.g. ".zip,.csv". */
    accept: string;
    label: string;
    hint?: string;
    busy?: boolean;
    onfile: (file: File) => void;
  } = $props();

  let input = $state<HTMLInputElement>();
  let over = $state(false);

  function pick(files: FileList | null | undefined) {
    const file = files?.[0];
    if (file) onfile(file);
  }
</script>

<input
  bind:this={input}
  type="file"
  {accept}
  class="hidden"
  onchange={(e) => {
    pick(e.currentTarget.files);
    e.currentTarget.value = '';
  }}
/>
<button
  type="button"
  disabled={busy}
  onclick={() => input?.click()}
  ondragover={(e) => {
    e.preventDefault();
    over = true;
  }}
  ondragleave={() => (over = false)}
  ondrop={(e) => {
    e.preventDefault();
    over = false;
    pick(e.dataTransfer?.files);
  }}
  class="focus-visible:ring-accent flex w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60 {over
    ? 'border-accent bg-accent/5'
    : 'border-line hover:bg-surface-muted/60'}"
>
  <span class="text-sm font-medium">{busy ? 'Reading the file…' : label}</span>
  {#if hint}<span class="text-ink-muted text-xs">{hint}</span>{/if}
</button>
