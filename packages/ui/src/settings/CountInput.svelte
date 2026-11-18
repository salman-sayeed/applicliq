<script lang="ts">
  let {
    id,
    value,
    min = 1,
    max,
    suffix,
    allowOff = false,
    label,
    onsave,
    onerror,
  }: {
    id: string;
    value: number | null;
    min?: number;
    max: number;
    suffix?: string;
    /** Empty input turns the setting off (null). */
    allowOff?: boolean;
    label: string;
    onsave: (value: number | null) => void;
    /** Reports a validation message, or undefined when the input is valid. */
    onerror: (message: string | undefined) => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let text = $state(value?.toString() ?? '');
  // svelte-ignore state_referenced_locally
  let lastValue = value;

  // Follow changes from elsewhere (reset, sync) unless the user is mid-edit with an error.
  $effect(() => {
    if (value !== lastValue) {
      lastValue = value;
      text = value?.toString() ?? '';
    }
  });

  function commit() {
    const raw = text.trim();
    if (raw === '' && allowOff) {
      onerror(undefined);
      if (value !== null) onsave(null);
      return;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      onerror(
        `Enter a whole number from ${min} to ${max}${allowOff ? ', or leave empty for off' : ''}.`,
      );
      return;
    }
    onerror(undefined);
    if (n !== value) onsave(n);
  }
</script>

<span class="inline-flex items-center gap-2">
  <input
    {id}
    type="text"
    inputmode="numeric"
    autocomplete="off"
    bind:value={text}
    onchange={commit}
    placeholder={allowOff ? 'Off' : ''}
    aria-label={label}
    class="border-line bg-surface text-ink placeholder:text-ink-muted/60 focus:border-accent focus:ring-accent/25 w-24 rounded-md border px-2.5 py-1.5 text-sm tabular-nums transition focus:ring-2 focus:outline-none"
  />
  {#if suffix}<span class="text-ink-muted text-sm">{suffix}</span>{/if}
</span>
