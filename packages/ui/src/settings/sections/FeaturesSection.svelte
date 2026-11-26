<script lang="ts">
  import {
    type FeatureDefinition,
    type FeatureId,
    type SubToggle,
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
    onoptions,
  }: SectionProps & {
    platform: SettingsPlatform;
    adapter: DashboardAdapter;
    /** Opens a feature's own settings page. */
    onoptions?: (page: 'helpers' | 'notifications' | 'data' | 'resumes' | 'autofill') => void;
  } = $props();

  /** Where a feature's options live, if it has a page of them. */
  const OPTIONS: Partial<
    Record<FeatureId, { page: 'helpers' | 'notifications' | 'resumes' | 'autofill'; label: string }>
  > = {
    smartHelpers: { page: 'helpers', label: 'Options and templates' },
    insights: { page: 'notifications', label: 'Weekly recap time' },
    resumeMatch: { page: 'resumes', label: 'Your resumes and skills to ignore' },
    autofill: { page: 'autofill', label: 'Your profile, saved answers and options' },
  };

  function subValue(sub: SubToggle): boolean {
    return (settings[sub.section] as Record<string, unknown>)[sub.key] === true;
  }

  let subErrors = $state<Record<string, string | undefined>>({});

  /**
   * A part with its own permissions (Autofill's on-page button) asks for them from this click
   * and gives them back when turned off.
   */
  function setSub(sub: SubToggle, value: boolean) {
    const turn = () => save({ [sub.section]: { [sub.key]: value } });
    subErrors = { ...subErrors, [sub.key]: undefined };
    if (!sub.permissions || !needsPermissions(sub)) return void turn();
    if (value) {
      if (!platform.requestPermissions) return;
      // The browser shows its prompt only within the click: ask before any await.
      platform.requestPermissions(sub.permissions).then(
        (granted) => {
          if (granted) return turn();
          subErrors = { ...subErrors, [sub.key]: 'Permission not granted, so it stays off.' };
        },
        () => (subErrors = { ...subErrors, [sub.key]: 'Could not ask for the permission.' }),
      );
    } else {
      void turn().then(() => platform.removePermissions?.(sub.permissions!).catch(() => {}));
    }
  }

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

  /** Switched on and off in Sync & data: both ways need a passphrase. */
  const SET_UP_ELSEWHERE: Partial<Record<FeatureId, string>> = {
    encryptedSync:
      'Turned on and off in Sync & data, with a passphrase. Needs Google Drive sync. No extra permissions.',
  };

  function toggle(feature: FeatureDefinition, on: boolean) {
    errors = { ...errors, [feature.id]: undefined };
    if (SET_UP_ELSEWHERE[feature.id]) return onoptions?.('data');
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
      // Parts that hold their own permissions give them back with the feature.
      const parts = (feature.subToggles ?? []).filter((s) => s.permissions && subValue(s));
      void turn(false).then(() => {
        void platform.removePermissions?.(unused).catch(() => {});
        for (const sub of parts) {
          void save({ [sub.section]: { [sub.key]: false } });
          void platform.removePermissions?.(sub.permissions!).catch(() => {});
        }
      });
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
        {:else if SET_UP_ELSEWHERE[feature.id]}
          <p>{SET_UP_ELSEWHERE[feature.id]}</p>
          {#if onoptions}
            <button
              type="button"
              class="text-accent mt-1 font-medium hover:underline"
              onclick={() => onoptions('data')}
            >
              {on ? 'Encryption settings' : 'Set it up'} →
            </button>
          {/if}
        {:else if feature.permissionNotes.length}
          <p class="text-ink font-medium">Needs your permission to:</p>
          <ul class="mt-0.5 list-disc pl-4">
            {#each feature.permissionNotes as note (note)}<li>{note}</li>{/each}
          </ul>
        {:else}
          <p>No extra permissions. Works on this device, and offline.</p>
        {/if}
      </div>
      {#if on && feature.subToggles?.length}
        <ul class="border-line mt-3 space-y-2.5 border-t pt-3" aria-label="{feature.name} parts">
          {#each feature.subToggles as sub (sub.key)}
            {@const subUsable = (sub.platforms ?? feature.platforms).includes(platform.kind)}
            <li class="flex items-start justify-between gap-4 {subUsable ? '' : 'opacity-60'}">
              <div class="min-w-0">
                <p class="text-sm">{sub.name}</p>
                <p class="text-ink-muted text-xs leading-relaxed">
                  {sub.description}{subUsable ? '' : ' In the browser extension.'}
                </p>
                {#if sub.permissionNotes?.length}
                  <p class="text-ink-muted mt-0.5 text-xs leading-relaxed">
                    Asks for permission to: {sub.permissionNotes.join(' ')}
                  </p>
                {/if}
                {#if subErrors[sub.key]}
                  <p role="alert" class="text-status-rejected mt-0.5 text-xs">
                    {subErrors[sub.key]}
                  </p>
                {/if}
              </div>
              <Toggle
                label={sub.name}
                checked={subValue(sub)}
                onchange={(value) => setSub(sub, value)}
              />
            </li>
          {/each}
        </ul>
        {#if OPTIONS[feature.id] && onoptions && (OPTIONS[feature.id]!.page !== 'notifications' || platform.kind === 'extension')}
          <button
            type="button"
            class="text-accent mt-3 text-xs font-medium hover:underline"
            onclick={() => onoptions(OPTIONS[feature.id]!.page)}
          >
            {OPTIONS[feature.id]!.label} →
          </button>
        {/if}
      {/if}
      {#if errors[feature.id]}
        <p role="alert" class="text-status-rejected mt-2 text-xs">{errors[feature.id]}</p>
      {/if}
    </li>
  {/each}
</ul>
