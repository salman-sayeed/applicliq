<script lang="ts">
  let {
    checked,
    label,
    id,
    disabled = false,
    onchange,
  }: {
    checked: boolean;
    /** Accessible name; the visible label is the field's. */
    label: string;
    id?: string;
    disabled?: boolean;
    /** Runs inside the click, so it may ask for browser permissions. */
    onchange: (checked: boolean) => void;
  } = $props();
</script>

<button
  {id}
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  {disabled}
  onclick={() => onchange(!checked)}
  class="focus-visible:ring-accent relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50 {checked
    ? 'bg-accent'
    : 'bg-line'}"
>
  <span
    class="bg-surface size-4 rounded-full shadow transition {checked
      ? 'translate-x-[18px]'
      : 'translate-x-0.5'}"
  ></span>
</button>
