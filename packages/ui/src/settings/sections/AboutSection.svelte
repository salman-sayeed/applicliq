<script lang="ts">
  import Field from '../Field.svelte';
  import { button, link } from '../styles';
  import type { SettingsPlatform } from '../types';

  let { platform }: { platform: SettingsPlatform } = $props();

  let shortcut = $state<string>();
  $effect(() => {
    platform.getShortcut?.().then(
      (value) => (shortcut = value),
      () => {},
    );
  });

  const extension = $derived(platform.kind === 'extension');
</script>

<Field label="Version">
  <span class="text-sm tabular-nums">{platform.version}</span>
</Field>

<Field label="Source code" hint="Career Pocket is free and open source (MIT).">
  <a href={platform.githubUrl} target="_blank" rel="noreferrer" class="{link} text-sm">
    GitHub ↗
  </a>
</Field>

<Field label="Found a bug?" hint="Opens a new issue on GitHub. Please don't include personal data.">
  <a href={platform.issuesUrl} target="_blank" rel="noreferrer" class="{link} text-sm">
    Report a bug ↗
  </a>
</Field>

<Field
  label="Save shortcut"
  hint={extension
    ? 'Saves the job on the current page. Change it in your browser’s shortcut settings.'
    : 'Available in the browser extension.'}
>
  {#if extension}
    {#if shortcut}
      <kbd class="border-line bg-surface-muted rounded border px-1.5 py-0.5 font-sans text-sm">
        {shortcut}
      </kbd>
    {:else}
      <span class="text-ink-muted text-sm">Not set</span>
    {/if}
  {/if}
  <button
    type="button"
    class={button}
    disabled={!platform.openShortcutSettings}
    onclick={() => platform.openShortcutSettings?.()}
  >
    Change shortcut
  </button>
</Field>

<Field label="Introduction" hint="Shows the welcome tour on the dashboard again.">
  <button type="button" class={button} onclick={() => platform.replayOnboarding()}>
    Replay onboarding
  </button>
</Field>
