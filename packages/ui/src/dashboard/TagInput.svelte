<script lang="ts">
  let {
    id,
    tags,
    suggestions = [],
    onchange,
  }: {
    id?: string;
    tags: string[];
    suggestions?: string[];
    onchange: (tags: string[]) => void;
  } = $props();

  let text = $state('');
  const listId = `tag-suggestions-${Math.random().toString(36).slice(2)}`;
  const available = $derived(
    suggestions.filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase())),
  );

  function add(raw: string) {
    const tag = raw.trim().replace(/^#/, '');
    text = '';
    if (!tag || tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    onchange([...tags, tag]);
  }

  function remove(tag: string) {
    onchange(tags.filter((t) => t !== tag));
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add(text);
    } else if (event.key === 'Backspace' && !text && tags.length) {
      remove(tags[tags.length - 1]!);
    }
  }
</script>

<div
  class="border-line bg-surface focus-within:border-accent focus-within:ring-accent/25 flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 transition focus-within:ring-2"
>
  {#each tags as tag (tag)}
    <span
      class="bg-surface-muted inline-flex items-center gap-1 rounded py-0.5 pr-1 pl-2 text-xs font-medium"
    >
      #{tag}
      <button
        type="button"
        onclick={() => remove(tag)}
        aria-label="Remove tag {tag}"
        class="text-ink-muted hover:text-ink focus-visible:ring-accent rounded px-0.5 leading-none focus-visible:ring-2 focus-visible:outline-none"
      >
        ×
      </button>
    </span>
  {/each}
  <input
    {id}
    bind:value={text}
    {onkeydown}
    onblur={() => add(text)}
    list={listId}
    placeholder={tags.length ? '' : 'Add a tag, press Enter'}
    class="text-ink placeholder:text-ink-muted/60 min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none"
  />
  <datalist id={listId}>
    {#each available as tag (tag)}
      <option value={tag}></option>
    {/each}
  </datalist>
</div>
