<script lang="ts" generics="T extends string">
  let {
    value,
    options,
    label,
    disabled = false,
    onchange,
  }: {
    value: T;
    options: readonly { value: T; label: string }[];
    label: string;
    disabled?: boolean;
    onchange: (value: T) => void;
  } = $props();
</script>

<div class="border-line inline-flex rounded-md border p-0.5" role="radiogroup" aria-label={label}>
  {#each options as option (option.value)}
    <button
      type="button"
      role="radio"
      aria-checked={value === option.value}
      {disabled}
      onclick={() => option.value !== value && onchange(option.value)}
      class="focus-visible:ring-accent rounded px-2.5 py-1 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50 {value ===
      option.value
        ? 'bg-surface-muted text-ink'
        : 'text-ink-muted hover:text-ink'}"
    >
      {option.label}
    </button>
  {/each}
</div>
