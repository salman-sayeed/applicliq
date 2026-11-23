<script lang="ts">
  import { JOB_STATUSES, TAG_COLORS, type JobStatus, type TagColor } from '@applicliq/core';
  import { STATUS_DOT, STATUS_LABELS, TAG_CLASSES, TAG_SWATCH } from '../../status';
  import { button, input } from '../styles';
  import type { SectionProps } from '../types';

  let {
    settings,
    save,
    usedTags,
    renameTag,
  }: SectionProps & {
    /** Tags on saved jobs, for the list (they may have no colour yet). */
    usedTags: string[];
    renameTag: (from: string, to: string) => Promise<void>;
  } = $props();

  const labels = $derived(settings.labels);
  let statusError = $state<string>();
  let tagText = $state('');
  let tagError = $state<string>();
  let resumeText = $state('');
  let resumeError = $state<string>();

  /** Tags with a colour first (in their order), then other tags in use. */
  const tags = $derived.by(() => {
    const known = labels.tags.map((t) => ({ ...t, saved: true }));
    const extra = usedTags
      .filter((name) => !labels.tags.some((t) => t.name.toLowerCase() === name.toLowerCase()))
      .map((name) => ({ name, color: 'gray' as TagColor, saved: false }));
    return [...known, ...extra];
  });

  function setLabel(status: JobStatus, value: string) {
    const label = value.trim();
    if (label.length > 30) {
      statusError = 'Status names can be up to 30 characters.';
      return;
    }
    statusError = undefined;
    const statusLabels = { ...labels.statusLabels };
    if (label && label !== STATUS_LABELS[status]) statusLabels[status] = label;
    else delete statusLabels[status];
    void save({ labels: { statusLabels } });
  }

  function setHidden(status: JobStatus, hidden: boolean) {
    const visible = JOB_STATUSES.length - labels.hiddenStatuses.length - (hidden ? 1 : 0);
    if (visible < 1) {
      statusError = 'At least one status has to stay visible.';
      return;
    }
    statusError = undefined;
    const next = hidden
      ? [...labels.hiddenStatuses, status]
      : labels.hiddenStatuses.filter((s) => s !== status);
    void save({ labels: { hiddenStatuses: next } });
  }

  function setColor(name: string, color: TagColor) {
    const exists = labels.tags.some((t) => t.name === name);
    const next = exists
      ? labels.tags.map((t) => (t.name === name ? { ...t, color } : t))
      : [...labels.tags, { name, color }];
    void save({ labels: { tags: next } });
  }

  async function rename(from: string, value: string, field: HTMLInputElement) {
    const to = value.trim().replace(/^#/, '');
    if (to === from) return;
    if (!to || to.length > 40) {
      tagError = 'Tag names need 1 to 40 characters.';
      field.value = from;
      return;
    }
    tagError = undefined;
    await renameTag(from, to);
  }

  function addTag(event: SubmitEvent) {
    event.preventDefault();
    const name = tagText.trim().replace(/^#/, '');
    if (!name || name.length > 40) {
      tagError = 'Tag names need 1 to 40 characters.';
      return;
    }
    tagError = undefined;
    tagText = '';
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) return;
    void save({ labels: { tags: [...labels.tags, { name, color: 'blue' }] } });
  }

  function addResume(event: SubmitEvent) {
    event.preventDefault();
    const name = resumeText.trim();
    if (!name || name.length > 60) {
      resumeError = 'Resume names need 1 to 60 characters.';
      return;
    }
    resumeError = undefined;
    resumeText = '';
    if (labels.resumeVersions.some((r) => r.toLowerCase() === name.toLowerCase())) return;
    void save({ labels: { resumeVersions: [...labels.resumeVersions, name] } });
  }

  const sub = 'text-ink-muted mb-1 text-xs font-semibold tracking-wide uppercase';
</script>

<section class="py-4" aria-labelledby="statuses-heading">
  <h3 id="statuses-heading" class={sub}>Statuses</h3>
  <p class="text-ink-muted mb-3 text-xs">
    Rename a status or hide the ones you don't use. Hidden statuses leave the pickers and the board;
    jobs already in them stay where they are. Sync and exports keep the original names.
  </p>
  {#if statusError}<p role="alert" class="text-status-rejected mb-2 text-xs">{statusError}</p>{/if}
  <ul class="border-line divide-line divide-y rounded-lg border">
    {#each JOB_STATUSES as status (status)}
      {@const hidden = labels.hiddenStatuses.includes(status)}
      <li class="flex items-center gap-3 px-3 py-2">
        <span class="size-2 shrink-0 rounded-full {STATUS_DOT[status]}" aria-hidden="true"></span>
        <input
          class="{input} min-w-0 flex-1 {hidden ? 'opacity-60' : ''}"
          aria-label="Name for {STATUS_LABELS[status]}"
          placeholder={STATUS_LABELS[status]}
          maxlength="30"
          value={labels.statusLabels[status] ?? ''}
          onchange={(e) => setLabel(status, e.currentTarget.value)}
        />
        <label class="text-ink-muted flex shrink-0 items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            class="accent-accent size-3.5"
            checked={!hidden}
            onchange={(e) => setHidden(status, !e.currentTarget.checked)}
          />
          Shown
        </label>
      </li>
    {/each}
  </ul>
</section>

<section class="py-4" aria-labelledby="tags-heading">
  <h3 id="tags-heading" class={sub}>Tags</h3>
  <p class="text-ink-muted mb-3 text-xs">
    Pick a colour for each tag. Renaming a tag changes it on every job.
  </p>
  {#if tagError}<p role="alert" class="text-status-rejected mb-2 text-xs">{tagError}</p>{/if}
  {#if tags.length}
    <ul class="border-line divide-line mb-3 divide-y rounded-lg border">
      {#each tags as tag (tag.name)}
        <li class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
          <span class="rounded px-1.5 py-0.5 text-xs font-medium {TAG_CLASSES[tag.color]}">
            #{tag.name}
          </span>
          <input
            class="{input} min-w-28 flex-1"
            aria-label="Rename tag {tag.name}"
            value={tag.name}
            maxlength="40"
            onchange={(e) => rename(tag.name, e.currentTarget.value, e.currentTarget)}
          />
          <div class="flex gap-1" role="radiogroup" aria-label="Colour for {tag.name}">
            {#each TAG_COLORS as color (color)}
              <button
                type="button"
                role="radio"
                aria-checked={tag.color === color}
                aria-label={color}
                title={color}
                onclick={() => setColor(tag.name, color)}
                class="ring-offset-surface focus-visible:ring-ink size-4 rounded-full ring-offset-1 focus-visible:ring-2 focus-visible:outline-none {TAG_SWATCH[
                  color
                ]} {tag.color === color ? 'ring-ink ring-2' : ''}"
              ></button>
            {/each}
          </div>
          {#if tag.saved}
            <button
              type="button"
              aria-label="Remove {tag.name} from this list"
              title="Remove from this list (jobs keep the tag)"
              onclick={() =>
                save({ labels: { tags: labels.tags.filter((t) => t.name !== tag.name) } })}
              class="text-ink-muted hover:text-ink hover:bg-surface-muted focus-visible:ring-accent rounded px-1.5 py-0.5 focus-visible:ring-2 focus-visible:outline-none"
            >
              ×
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <form class="flex gap-2" onsubmit={addTag}>
    <input class="{input} w-48" placeholder="New tag" aria-label="New tag" bind:value={tagText} />
    <button type="submit" class={button} disabled={!tagText.trim()}>Add tag</button>
  </form>
</section>

<section class="py-4" aria-labelledby="resumes-heading">
  <h3 id="resumes-heading" class={sub}>Resume versions</h3>
  <p class="text-ink-muted mb-3 text-xs">Offered when you pick a resume version on a job.</p>
  {#if resumeError}<p role="alert" class="text-status-rejected mb-2 text-xs">{resumeError}</p>{/if}
  {#if labels.resumeVersions.length}
    <ul class="mb-3 flex flex-wrap gap-2">
      {#each labels.resumeVersions as version (version)}
        <li
          class="border-line inline-flex items-center gap-1 rounded-md border py-0.5 pr-1 pl-2 text-sm"
        >
          {version}
          <button
            type="button"
            aria-label="Remove {version}"
            onclick={() =>
              save({
                labels: { resumeVersions: labels.resumeVersions.filter((r) => r !== version) },
              })}
            class="text-ink-muted hover:text-ink focus-visible:ring-accent rounded px-1 focus-visible:ring-2 focus-visible:outline-none"
          >
            ×
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <form class="flex gap-2" onsubmit={addResume}>
    <input
      class="{input} w-48"
      placeholder="e.g. frontend-v3"
      aria-label="New resume version"
      bind:value={resumeText}
    />
    <button type="submit" class={button} disabled={!resumeText.trim()}>Add</button>
  </form>
</section>
