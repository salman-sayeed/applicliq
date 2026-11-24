<script lang="ts">
  import {
    type FeatureDefinition,
    type FeatureId,
    getFeature,
    isFeatureEnabled,
    needsPermissions,
    permissionsToRemove,
    visibleFeatures,
  } from '@applicliq/core';
  import type { DashboardAdapter } from '../../dashboard/adapter';
  import Toggle from '../Toggle.svelte';
  import { button } from '../styles';
  import type { SectionProps, SettingsPlatform } from '../types';

  let {
    settings,
    save,
    platform,
    adapter,
  }: SectionProps & { platform: SettingsPlatform; adapter: DashboardAdapter } = $props();

  const features = visibleFeatures();
  let errors = $state<Partial<Record<FeatureId, string>>>({});
  /** Features the extension turned off at start-up because a permission was taken away. */
  let turnedOff = $state<FeatureId[]>([]);

  $effect(() => {
    adapter.getLocalState().then(
      (state) => (turnedOff = state.featuresTurnedOff ?? []),
      () => {},
    );
  });

  function dismissNotice() {
    turnedOff = [];
    adapter.setLocalState({ featuresTurnedOff: [] }).catch(() => {});
  }

  const available = (f: FeatureDefinition) => f.platforms.includes(platform.kind);

  function toggle(feature: FeatureDefinition, on: boolean) {
    errors = { ...errors, [feature.id]: undefined };
    const turn = (value: boolean) => save({ features: { [feature.id]: value } });
    if (!needsPermissions(feature)) return void turn(on);
    if (on) {
      if (!platform.requestPermissions) {
        errors = { ...errors, [feature.id]: 'This feature needs the AppliCliq extension.' };
        return;
      }
      // The browser shows its permission prompt only within the click: ask before any await.
      platform.requestPermissions(feature.permissions).then(
        (granted) => {
          if (granted) return turn(true);
          errors = {
            ...errors,
            [feature.id]: 'Permission not granted, so the feature stays off.',
          };
        },
        () => (errors = { ...errors, [feature.id]: 'Could not ask for the permission.' }),
      );
    } else {
      const unused = permissionsToRemove(settings, feature.id);
      void turn(false).then(() => platform.removePermissions?.(unused).catch(() => {}));
    }
  }
</script>

<p class="text-ink-muted py-3 text-xs leading-relaxed">
  Turn optional features on or off. A feature that needs extra browser access asks for it only when
  you turn it on, and gives it back when you turn it off.
</p>

{#if turnedOff.length}
  <div
    role="status"
    class="bg-surface-muted mb-3 flex items-start justify-between gap-3 rounded-md px-3 py-2 text-xs"
  >
    <p>
      Turned off because the browser no longer gives AppliCliq the access they need:
      {turnedOff.map((id) => getFeature(id).name).join(', ')}. Turn them on again to grant it.
    </p>
    <button type="button" class="{button} shrink-0 px-2 py-0.5 text-xs" onclick={dismissNotice}>
      OK
    </button>
  </div>
{/if}

<ul class="grid gap-3 py-2">
  {#each features as feature (feature.id)}
    {@const usable = available(feature)}
    {@const on = usable && isFeatureEnabled(settings, feature.id)}
    <li class="border-line rounded-lg border p-4 {usable ? '' : 'opacity-60'}">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h3 id="feature-{feature.id}" class="text-sm font-medium">{feature.name}</h3>
          <p class="text-ink-muted mt-0.5 text-xs leading-relaxed">{feature.description}</p>
        </div>
        <Toggle
          label={feature.name}
          checked={on}
          disabled={!usable}
          onchange={(value) => toggle(feature, value)}
        />
      </div>
      <div class="text-ink-muted mt-2 text-xs">
        {#if !usable}
          <p>Available in the AppliCliq browser extension.</p>
        {:else if feature.permissionNotes.length}
          <p class="text-ink font-medium">Needs your permission to:</p>
          <ul class="mt-0.5 list-disc pl-4">
            {#each feature.permissionNotes as note (note)}<li>{note}</li>{/each}
          </ul>
        {:else}
          <p>No extra permissions. Works on this device, and offline.</p>
        {/if}
      </div>
      {#if errors[feature.id]}
        <p role="alert" class="text-status-rejected mt-2 text-xs">{errors[feature.id]}</p>
      {/if}
    </li>
  {/each}
</ul>
