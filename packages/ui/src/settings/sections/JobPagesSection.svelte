<script lang="ts">
  import { type BadgePosition, type ToolbarBadgeMode, siteHost } from '@career-pocket/core';
  import Choice from '../Choice.svelte';
  import Field from '../Field.svelte';
  import Toggle from '../Toggle.svelte';
  import { button, input } from '../styles';
  import type { SectionProps } from '../types';

  let {
    settings,
    save,
    disabled = false,
    setPageAccess,
  }: SectionProps & {
    disabled?: boolean;
    setPageAccess?: (on: boolean) => Promise<boolean>;
  } = $props();

  const pages = $derived(settings.jobPages);
  let badgeError = $state<string>();
  let siteText = $state('');
  let siteError = $state<string>();

  const positions: { value: BadgePosition; label: string }[] = [
    { value: 'bottom-right', label: 'Bottom right' },
    { value: 'bottom-left', label: 'Bottom left' },
    { value: 'top-right', label: 'Top right' },
    { value: 'top-left', label: 'Top left' },
  ];

  const toolbarModes: { value: ToolbarBadgeMode; label: string }[] = [
    { value: 'goal', label: 'Today / goal' },
    { value: 'today', label: 'Today' },
    { value: 'off', label: 'Off' },
  ];

  function toggleBadge(on: boolean) {
    badgeError = undefined;
    if (!setPageAccess) return void save({ jobPages: { showBadge: on } });
    // The permission prompt needs the click's user gesture: ask before any await.
    setPageAccess(on).then(
      (granted) => save({ jobPages: { showBadge: on && granted } }),
      () => (badgeError = 'Could not change site access.'),
    );
  }

  function addSite(event: SubmitEvent) {
    event.preventDefault();
    const host = siteHost(siteText);
    if (!host) {
      siteError = 'Enter a site like linkedin.com.';
      return;
    }
    siteError = undefined;
    siteText = '';
    if (!pages.sitesWithBadgeOff.includes(host)) {
      void save({ jobPages: { sitesWithBadgeOff: [...pages.sitesWithBadgeOff, host] } });
    }
  }
</script>

<Field
  label="Badge on saved job pages"
  hint="Shows “Applied 12 days ago · Interview” on pages of jobs you saved. Needs access to all sites; page addresses are only checked against your saved jobs, on this device."
  error={badgeError}
>
  <Toggle
    label="Badge on saved job pages"
    checked={pages.showBadge}
    {disabled}
    onchange={toggleBadge}
  />
</Field>

<Field label="Badge position" id="badge-position">
  <select
    id="badge-position"
    class={input}
    disabled={disabled || !pages.showBadge}
    value={pages.badgePosition}
    onchange={(e) => save({ jobPages: { badgePosition: e.currentTarget.value as BadgePosition } })}
  >
    {#each positions as p (p.value)}
      <option value={p.value}>{p.label}</option>
    {/each}
  </select>
</Field>

<Field
  label="Sites without the badge"
  hint="The badge never shows on these sites (subdomains included)."
  error={siteError}
>
  <div class="flex w-full flex-col gap-2 sm:w-72">
    <form class="flex gap-2" onsubmit={addSite}>
      <input
        class="{input} min-w-0 flex-1"
        placeholder="e.g. linkedin.com"
        aria-label="Site to turn the badge off on"
        {disabled}
        bind:value={siteText}
      />
      <button type="submit" class={button} disabled={disabled || !siteText.trim()}>Add</button>
    </form>
    {#if pages.sitesWithBadgeOff.length}
      <ul class="border-line divide-line divide-y rounded-md border text-sm">
        {#each pages.sitesWithBadgeOff as site (site)}
          <li class="flex items-center justify-between gap-2 py-1 pr-1 pl-2.5">
            <span class="truncate">{site}</span>
            <button
              type="button"
              {disabled}
              aria-label="Show the badge on {site} again"
              onclick={() =>
                save({
                  jobPages: {
                    sitesWithBadgeOff: pages.sitesWithBadgeOff.filter((s) => s !== site),
                  },
                })}
              class="text-ink-muted hover:text-ink hover:bg-surface-muted focus-visible:ring-accent rounded px-1.5 py-0.5 focus-visible:ring-2 focus-visible:outline-none"
            >
              ×
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</Field>

<Field
  label="Warn about the same company"
  hint="When saving, mention other jobs you saved or applied to at that company."
>
  <Toggle
    label="Warn about the same company"
    checked={pages.duplicateWarning}
    {disabled}
    onchange={(duplicateWarning) => save({ jobPages: { duplicateWarning } })}
  />
</Field>

<Field label="Toolbar badge" hint="What the number on the Career Pocket toolbar icon shows.">
  <Choice
    label="Toolbar badge"
    value={pages.toolbarBadge}
    options={toolbarModes}
    {disabled}
    onchange={(toolbarBadge) => save({ jobPages: { toolbarBadge } })}
  />
</Field>
