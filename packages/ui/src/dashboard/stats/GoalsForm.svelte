<script lang="ts">
  import type { Goals } from '@applicliq/core';

  let {
    goals,
    onsave,
    oncancel,
  }: { goals: Goals; onsave: (goals: Goals) => void; oncancel: () => void } = $props();

  /** Inputs as text: empty means the goal is off. */
  // svelte-ignore state_referenced_locally
  let draft = $state({
    daily: goals.daily?.toString() ?? '',
    weekly: goals.weekly?.toString() ?? '',
    monthly: goals.monthly?.toString() ?? '',
  });

  const fields: { key: keyof Goals; label: string }[] = [
    { key: 'daily', label: 'Per day' },
    { key: 'weekly', label: 'Per week' },
    { key: 'monthly', label: 'Per month' },
  ];

  const clean = (value: string | number | null) => {
    const n = Math.floor(Number(value));
    return value !== '' && value !== null && Number.isFinite(n) && n > 0 ? n : null;
  };

  function submit(event: SubmitEvent) {
    event.preventDefault();
    onsave({
      daily: clean(draft.daily),
      weekly: clean(draft.weekly),
      monthly: clean(draft.monthly),
    });
  }
</script>

<form onsubmit={submit} class="flex flex-wrap items-end gap-3">
  {#each fields as field (field.key)}
    <label class="text-ink-muted flex flex-col gap-1 text-xs font-medium">
      {field.label}
      <input
        type="number"
        min="1"
        step="1"
        placeholder="Off"
        inputmode="numeric"
        bind:value={draft[field.key]}
        class="border-line bg-surface text-ink focus:border-accent focus:ring-accent/25 w-24 rounded-md border px-2.5 py-1.5 text-sm tabular-nums transition focus:ring-2 focus:outline-none"
      />
    </label>
  {/each}
  <div class="flex gap-2">
    <button
      type="submit"
      class="bg-accent text-accent-ink focus-visible:ring-accent rounded-md px-3 py-1.5 text-sm font-medium transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      Save goals
    </button>
    <button
      type="button"
      onclick={oncancel}
      class="text-ink hover:bg-surface-muted focus-visible:ring-accent rounded-md px-3 py-1.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none"
    >
      Cancel
    </button>
  </div>
  <p class="text-ink-muted w-full text-xs">Leave a goal empty to turn it off.</p>
</form>
