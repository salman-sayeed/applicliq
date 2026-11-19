<script lang="ts">
  import type { JobStatus } from '@career-pocket/core';
  import { getPrefs } from '../../prefs.svelte';
  import CountInput from '../CountInput.svelte';
  import Field from '../Field.svelte';
  import Toggle from '../Toggle.svelte';
  import { input } from '../styles';
  import type { SectionProps } from '../types';

  let { settings, save }: SectionProps = $props();

  const prefs = getPrefs();
  const automation = $derived(settings.automation);
  let ghostError = $state<string>();
</script>

<Field
  label="Mark as ghosted after"
  id="ghosted-after"
  hint="Jobs still in “{prefs.status(
    'applied',
  )}” this long after you applied move to “{prefs.status('ghosted')}”. Leave empty to turn it off."
  error={ghostError}
>
  <CountInput
    id="ghosted-after"
    label="Days before marking as ghosted"
    value={automation.ghostedAfterDays}
    max={365}
    suffix="days"
    allowOff
    onsave={(ghostedAfterDays) => save({ automation: { ghostedAfterDays } })}
    onerror={(message) => (ghostError = message)}
  />
</Field>

<Field
  label="Status for new jobs"
  id="default-status"
  hint="What saving from the popup or the shortcut sets."
>
  <select
    id="default-status"
    class={input}
    value={automation.defaultSaveStatus}
    onchange={(e) =>
      save({ automation: { defaultSaveStatus: e.currentTarget.value as JobStatus } })}
  >
    {#each prefs.statuses(automation.defaultSaveStatus) as status (status)}
      <option value={status}>{prefs.status(status)}</option>
    {/each}
  </select>
</Field>

<Field
  label="Save the job description"
  hint="Keeps a copy of the posting's text with the job, in case the page is taken down."
>
  <Toggle
    label="Save the job description"
    checked={automation.saveDescriptionSnapshot}
    onchange={(saveDescriptionSnapshot) => save({ automation: { saveDescriptionSnapshot } })}
  />
</Field>

<Field
  label="Clean up links"
  hint="Removes tracking parameters (utm_…, refs, click IDs) from saved job links. Duplicate detection works either way."
>
  <Toggle
    label="Clean up links"
    checked={automation.cleanUrls}
    onchange={(cleanUrls) => save({ automation: { cleanUrls } })}
  />
</Field>
