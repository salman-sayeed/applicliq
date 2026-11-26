<script lang="ts" module>
  export const SETTINGS_PAGES = [
    { id: 'goals', label: 'Goals', reset: 'goals' },
    { id: 'automation', label: 'Automation', reset: 'automation' },
    { id: 'notifications', label: 'Notifications', reset: 'notifications', extensionOnly: true },
    { id: 'job-pages', label: 'Job pages', reset: 'jobPages', extensionOnly: true },
    { id: 'appearance', label: 'Appearance', reset: 'appearance' },
    { id: 'regional', label: 'Regional', reset: 'regional' },
    { id: 'statuses', label: 'Statuses & tags', reset: 'labels' },
    { id: 'features', label: 'Features' },
    { id: 'helpers', label: 'Smart helpers', reset: 'helpers', feature: 'smartHelpers' },
    { id: 'resumes', label: 'Resumes', reset: 'resumes', feature: 'resumeMatch' },
    { id: 'autofill', label: 'Autofill profile', feature: 'autofill', extensionOnly: true },
    { id: 'import', label: 'Import', feature: 'import' },
    { id: 'data', label: 'Sync & data', reset: 'sync' },
    { id: 'about', label: 'About' },
  ] as const;

  export type SettingsPageId = (typeof SETTINGS_PAGES)[number]['id'];
</script>

<script lang="ts">
  import {
    type Job,
    type Settings,
    type SettingsPatch,
    type SettingsSection,
    jobFacets,
  } from '@applicliq/core';
  import type { Snippet } from 'svelte';
  import { applyAppearance } from '../appearance';
  import type { DashboardAdapter } from '../dashboard/adapter';
  import Toast from '../dashboard/Toast.svelte';
  import type { ToastMessage } from '../dashboard/types';
  import { Prefs, setPrefs } from '../prefs.svelte';
  import AboutSection from './sections/AboutSection.svelte';
  import AppearanceSection from './sections/AppearanceSection.svelte';
  import AutomationSection from './sections/AutomationSection.svelte';
  import DataSection from './sections/DataSection.svelte';
  import FeaturesSection from './sections/FeaturesSection.svelte';
  import GoalsSection from './sections/GoalsSection.svelte';
  import HelpersSection from './sections/HelpersSection.svelte';
  import JobPagesSection from './sections/JobPagesSection.svelte';
  import LabelsSection from './sections/LabelsSection.svelte';
  import NotificationsSection from './sections/NotificationsSection.svelte';
  import RegionalSection from './sections/RegionalSection.svelte';
  import ResumesSection from './sections/ResumesSection.svelte';
  import { button } from './styles';
  import type { SettingsPlatform, SettingsSync } from './types';

  let {
    adapter,
    platform,
    sync,
    section = $bindable('goals'),
    header,
  }: {
    adapter: DashboardAdapter;
    platform: SettingsPlatform;
    sync: SettingsSync;
    /** The open section; bind it to keep it in the URL. */
    section?: SettingsPageId;
    /** Rendered at the left of the top bar (logo, link back to the dashboard). */
    header?: Snippet;
  } = $props();

  const prefs = setPrefs(new Prefs());

  let settings = $state.raw<Settings>();
  let jobs = $state.raw<Job[]>([]);
  let toast = $state<ToastMessage>();
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  /** Pages of features that are off are left out of the nav. */
  const pages = $derived(
    SETTINGS_PAGES.filter((p) => !('feature' in p) || !settings || prefs.feature(p.feature)),
  );
  const current = $derived(SETTINGS_PAGES.find((p) => p.id === section) ?? SETTINGS_PAGES[0]);
  const featureOff = $derived(
    !!settings && 'feature' in current && !prefs.feature(current.feature),
  );
  const unavailable = $derived(
    platform.kind === 'web' && 'extensionOnly' in current && current.extensionOnly,
  );
  const usedTags = $derived(jobFacets(jobs).tags);

  $effect(() =>
    adapter.watchSettings(
      (next) => {
        settings = next;
        prefs.settings = next;
        applyAppearance(next.appearance);
      },
      (error) => notify(`Could not load settings: ${String(error)}`, 'error'),
    ),
  );

  $effect(() => adapter.watchJobs((next) => (jobs = next)));

  function notify(message: string, tone: 'info' | 'error' = 'info') {
    clearTimeout(toastTimer);
    toast = { id: Date.now(), message, tone };
    toastTimer = setTimeout(() => (toast = undefined), tone === 'error' ? 6000 : 1500);
  }

  /** Auto-save: every control saves on change, with a small confirmation. */
  async function save(patch: SettingsPatch) {
    try {
      await adapter.updateSettings(patch);
      notify('Saved');
    } catch (error) {
      notify(`Could not save: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }

  async function reset(target: SettingsSection) {
    if (!confirm(`Reset “${current.label}” to the defaults?`)) return;
    try {
      // The page badge's site access is the browser's to grant; drop it with the setting.
      if (target === 'jobPages' && settings?.jobPages.showBadge) {
        await platform.setPageAccess?.(false).catch(() => false);
      }
      await adapter.resetSettingsSection(target);
      notify('Reset to defaults');
    } catch (error) {
      notify(`Could not reset: ${String(error)}`, 'error');
    }
  }

  async function renameTag(from: string, to: string) {
    try {
      const count = await adapter.renameTag(from, to);
      notify(count ? `Renamed on ${count} ${count === 1 ? 'job' : 'jobs'}` : 'Saved');
    } catch (error) {
      notify(`Could not rename the tag: ${String(error)}`, 'error');
    }
  }

  function onNavKey(event: KeyboardEvent) {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    const index = pages.findIndex((p) => p.id === section);
    const next = pages[(index + step + pages.length) % pages.length]!;
    section = next.id;
    document.getElementById(`settings-tab-${next.id}`)?.focus();
  }
</script>

<div class="flex min-h-dvh flex-col">
  <header class="border-line flex items-center gap-3 border-b px-4 py-3">
    {#if header}{@render header()}{/if}
  </header>

  <div class="mx-auto flex w-full max-w-5xl flex-1 flex-col md:flex-row md:gap-8 md:px-4 md:py-6">
    <nav
      aria-label="Settings sections"
      class="border-line bg-surface sticky top-0 z-10 shrink-0 border-b md:static md:w-48 md:border-b-0"
    >
      <h1 class="sr-only">Settings</h1>
      <ul
        role="tablist"
        aria-orientation="vertical"
        tabindex="-1"
        onkeydown={onNavKey}
        class="flex gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] md:flex-col md:overflow-visible md:p-0"
      >
        {#each pages as page (page.id)}
          <li role="presentation" class="shrink-0">
            <button
              id="settings-tab-{page.id}"
              type="button"
              role="tab"
              aria-selected={section === page.id}
              aria-controls="settings-panel"
              tabindex={section === page.id ? 0 : -1}
              onclick={() => (section = page.id)}
              class="focus-visible:ring-accent flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm font-medium whitespace-nowrap transition focus-visible:ring-2 focus-visible:outline-none {section ===
              page.id
                ? 'bg-surface-muted text-ink'
                : 'text-ink-muted hover:text-ink hover:bg-surface-muted/60'}"
            >
              {page.label}
              {#if platform.kind === 'web' && 'extensionOnly' in page}
                <span class="text-ink-muted text-[10px] font-normal">Extension</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </nav>

    <div
      id="settings-panel"
      role="tabpanel"
      aria-labelledby="settings-tab-{current.id}"
      class="min-w-0 flex-1 px-4 py-5 md:p-0"
    >
      <div class="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-lg font-semibold">{current.label}</h2>
        {#if 'reset' in current && settings && !unavailable}
          <button type="button" class="{button} text-xs" onclick={() => reset(current.reset)}>
            Reset section to defaults
          </button>
        {/if}
      </div>

      {#if unavailable}
        <p class="bg-surface-muted mb-2 rounded-md px-3 py-2 text-sm">
          These settings belong to the AppliCliq browser extension, which shows reminders and badges
          in your browser. Change them in the extension's settings.
        </p>
      {/if}

      {#if !settings}
        <div class="space-y-3" aria-busy="true" aria-label="Loading settings">
          {#each [0, 1, 2] as i (i)}
            <div class="bg-surface-muted h-12 animate-pulse rounded-md"></div>
          {/each}
        </div>
      {:else}
        <fieldset
          disabled={unavailable}
          class="divide-line min-w-0 divide-y {unavailable ? 'opacity-60' : ''}"
        >
          <legend class="sr-only">{current.label}</legend>
          {#if section === 'goals'}
            <GoalsSection {settings} {save} />
          {:else if section === 'automation'}
            <AutomationSection {settings} {save} />
          {:else if section === 'notifications'}
            <NotificationsSection {settings} {save} disabled={unavailable} />
          {:else if section === 'job-pages'}
            <JobPagesSection
              {settings}
              {save}
              disabled={unavailable}
              setPageAccess={platform.setPageAccess}
            />
          {:else if section === 'appearance'}
            <AppearanceSection {settings} {save} />
          {:else if section === 'regional'}
            <RegionalSection {settings} {save} />
          {:else if section === 'statuses'}
            <LabelsSection {settings} {save} {usedTags} {renameTag} />
          {:else if section === 'features'}
            <FeaturesSection
              {settings}
              {save}
              {platform}
              {adapter}
              onoptions={(id) => (section = id)}
            />
          {:else if section === 'helpers'}
            {#if featureOff}
              <p class="bg-surface-muted my-3 rounded-md px-3 py-2 text-sm">
                Smart helpers are turned off.
                <button
                  type="button"
                  class="text-accent font-medium hover:underline"
                  onclick={() => (section = 'features')}
                >
                  Turn them on in Features
                </button>
              </p>
            {:else}
              <HelpersSection {settings} {save} onfeatures={() => (section = 'features')} />
            {/if}
          {:else if section === 'resumes'}
            {#if featureOff}
              <p class="bg-surface-muted my-3 rounded-md px-3 py-2 text-sm">
                Resume match is turned off.
                <button
                  type="button"
                  class="text-accent font-medium hover:underline"
                  onclick={() => (section = 'features')}
                >
                  Turn it on in Features
                </button>
              </p>
            {:else}
              <ResumesSection
                {settings}
                {save}
                {adapter}
                {jobs}
                {notify}
                ondata={() => (section = 'data')}
              />
            {/if}
          {:else if section === 'autofill'}
            {#if featureOff}
              <p class="bg-surface-muted my-3 rounded-md px-3 py-2 text-sm">
                Autofill is turned off.
                <button
                  type="button"
                  class="text-accent font-medium hover:underline"
                  onclick={() => (section = 'features')}
                >
                  Turn it on in Features
                </button>
              </p>
            {:else}
              <!-- Loaded on demand: only people who use Autofill need it. -->
              {#await import('./sections/AutofillSection.svelte')}
                <div class="bg-surface-muted my-4 h-24 animate-pulse rounded-md"></div>
              {:then { default: AutofillSection }}
                <div>
                  <AutofillSection
                    {settings}
                    {save}
                    {adapter}
                    {notify}
                    ondata={() => (section = 'data')}
                  />
                </div>
              {:catch}
                <p role="alert" class="text-status-rejected py-4 text-sm">
                  Could not load the Autofill settings. Reload and try again.
                </p>
              {/await}
            {/if}
          {:else if section === 'import'}
            {#if featureOff}
              <p class="bg-surface-muted my-3 rounded-md px-3 py-2 text-sm">
                Import is turned off.
                <button
                  type="button"
                  class="text-accent font-medium hover:underline"
                  onclick={() => (section = 'features')}
                >
                  Turn it on in Features
                </button>
              </p>
            {:else}
              <!-- Loaded on demand: the parsers (and the zip reader) stay out of other pages. -->
              {#await import('../import/ImportPage.svelte')}
                <div class="bg-surface-muted my-4 h-24 animate-pulse rounded-md"></div>
              {:then { default: ImportPage }}
                <div><ImportPage {adapter} {jobs} {notify} /></div>
              {:catch}
                <p role="alert" class="text-status-rejected py-4 text-sm">
                  Could not load the import page. Reload and try again.
                </p>
              {/await}
            {/if}
          {:else if section === 'data'}
            <DataSection
              {settings}
              {save}
              {sync}
              {platform}
              {notify}
              openImport={prefs.feature('import') ? () => (section = 'import') : undefined}
            />
          {:else}
            <AboutSection {platform} />
          {/if}
        </fieldset>
      {/if}
    </div>
  </div>
</div>

<Toast {toast} ondismiss={() => (toast = undefined)} />
