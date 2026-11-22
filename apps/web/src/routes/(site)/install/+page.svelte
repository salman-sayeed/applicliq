<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    CHROMIUM_ZIP_URL,
    MANUAL_BROWSERS,
    storeById,
    type ManualBrowserId,
  } from '#lib/config.ts';
  import { detectBrowser } from '#lib/browser.ts';
  import CopyButton from '#lib/CopyButton.svelte';
  import { GITHUB_URL } from '#lib/links.ts';

  const firefox = storeById('firefox');

  // Opens on the tab named in the URL hash (/install#brave), else the visitor's browser.
  let selected = $state<ManualBrowserId>('chrome');
  let onFirefox = $state(false);
  const isManual = (id: string): id is ManualBrowserId => MANUAL_BROWSERS.some((b) => b.id === id);
  onMount(() => {
    const fromHash = location.hash.slice(1);
    const detected = detectBrowser();
    onFirefox = detected === 'firefox' || detected === 'firefox-android';
    if (isManual(fromHash)) selected = fromHash;
    else if (isManual(detected)) selected = detected;
  });

  const browser = $derived(MANUAL_BROWSERS.find((b) => b.id === selected)!);

  // Per-browser wording for the steps that differ.
  const details: Record<
    ManualBrowserId,
    { menu: string; devMode: string; loadUnpacked: string; pin: string; reload: string }
  > = {
    chrome: {
      menu: 'Or open the ⋮ menu, then Extensions → Manage Extensions.',
      devMode: 'Switch on the Developer mode toggle in the top-right corner.',
      loadUnpacked: 'A new bar appears at the top. Click Load unpacked.',
      pin: 'Click the puzzle-piece icon next to the address bar, then the pin next to Career Pocket.',
      reload: 'the circular reload arrow on the Career Pocket card',
    },
    brave: {
      menu: 'Or open the ☰ menu, then Extensions.',
      devMode: 'Switch on the Developer mode toggle in the top-right corner.',
      loadUnpacked: 'A new bar appears at the top. Click Load unpacked.',
      pin: 'Click the puzzle-piece icon next to the address bar, then the pin next to Career Pocket.',
      reload: 'the circular reload arrow on the Career Pocket card',
    },
    edge: {
      menu: 'Or open the ⋯ menu, then Extensions → Manage extensions.',
      devMode:
        'Switch on Developer mode in the left sidebar (on a narrow window, open the ☰ menu at the top left first).',
      loadUnpacked: 'Buttons appear above the list. Click Load unpacked.',
      pin: 'Click the puzzle-piece icon next to the address bar, then the eye icon next to Career Pocket (Show in toolbar).',
      reload: 'Reload under the Career Pocket card',
    },
    opera: {
      menu: 'Or press Ctrl+Shift+E (⌘+Shift+E on a Mac), or open the menu, then Extensions → Extensions.',
      devMode: 'Switch on the Developer mode toggle in the top-right corner.',
      loadUnpacked: 'A new bar appears at the top. Click Load unpacked.',
      pin: 'Click the cube icon next to the address bar, then the pin next to Career Pocket.',
      reload: 'the circular reload arrow on the Career Pocket card',
    },
  };
  const d = $derived(details[selected]);

  // Tabs: arrow keys move between them (WAI-ARIA tabs pattern, automatic activation).
  let tabButtons: HTMLButtonElement[] = $state([]);
  async function onTabKey(event: KeyboardEvent, index: number) {
    const last = MANUAL_BROWSERS.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1;
    if (next < 0) return;
    event.preventDefault();
    selected = MANUAL_BROWSERS[next].id;
    await tick();
    tabButtons[next]?.focus();
  }

  const faq = [
    {
      q: 'The browser warns about developer-mode extensions. Is that a problem?',
      a: 'No, that is normal for any extension loaded by hand rather than from a store. Close the message or choose to keep the extension; don’t turn developer mode off, or the browser disables Career Pocket.',
    },
    {
      q: 'Does it update by itself?',
      a: 'No. Extensions loaded by hand never update on their own. Follow “How to update” below when a new release comes out (the GitHub releases page lists them).',
    },
    {
      q: 'Do I keep my jobs when I update?',
      a: 'Yes. Replacing the files and clicking reload keeps everything. Only removing the extension deletes its data from this browser, so turn on Google Drive sync (or export a backup in Settings) before you ever remove it.',
    },
    {
      q: 'Does Google Drive sync work with a manual install?',
      a: 'Yes. The release zip keeps the same extension ID as every other copy, so signing in to Google works as usual.',
    },
    {
      q: 'Can I delete the folder after installing?',
      a: 'No. The browser runs the extension from that folder. Keep it where it is; moving or deleting it breaks the extension.',
    },
  ];

  const primaryBtn =
    'bg-accent text-accent-ink focus-visible:ring-accent inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none';
</script>

<svelte:head>
  <title>Install Career Pocket manually · Chrome, Brave, Edge, Opera</title>
  <meta
    name="description"
    content="Install the Career Pocket extension by hand in Chrome, Brave, Edge or Opera from the latest GitHub release, and keep it up to date."
  />
</svelte:head>

{#snippet shot(caption: string)}
  <!-- Placeholder until a screenshot for this step is added. -->
  <div
    class="border-line text-ink-muted mt-3 flex aspect-[16/7] max-w-md items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs"
    role="img"
    aria-label="Screenshot: {caption}"
  >
    <span>Screenshot: {caption}</span>
  </div>
{/snippet}

<main class="mx-auto max-w-3xl px-4 pt-12 pb-24 sm:pt-16">
  <h1 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
    Install Career Pocket manually
  </h1>
  <p class="text-ink-muted mt-3 text-balance">
    Until Career Pocket is in the Chrome, Edge and Opera stores, you can load it by hand from the
    latest release. It takes about two minutes.
  </p>

  <aside
    class="mt-6 flex items-start gap-3 rounded-xl border p-4 text-sm {onFirefox
      ? 'border-accent bg-accent/5'
      : 'border-line'}"
  >
    <img src={firefox.icon} alt="" width="24" height="24" class="mt-0.5 size-6 shrink-0" />
    <p>
      <span class="font-medium">Using Firefox?</span>
      <span class="text-ink-muted">
        No manual steps needed:
        <a
          href={firefox.url}
          target="_blank"
          rel="external noopener"
          class="text-accent font-medium hover:underline"
        >
          get it from Firefox Add-ons
        </a>. It updates itself, on desktop and Android.
      </span>
    </p>
  </aside>

  <div
    role="tablist"
    aria-label="Browser"
    class="border-line mt-10 grid grid-cols-4 border-b sm:flex sm:gap-1"
  >
    {#each MANUAL_BROWSERS as b, i (b.id)}
      <button
        bind:this={tabButtons[i]}
        type="button"
        role="tab"
        id="tab-{b.id}"
        aria-selected={selected === b.id}
        aria-controls="panel"
        tabindex={selected === b.id ? 0 : -1}
        onclick={() => (selected = b.id)}
        onkeydown={(e) => onTabKey(e, i)}
        class="focus-visible:ring-accent -mb-px flex items-center justify-center gap-1.5 border-b-2 px-1 py-2.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none sm:gap-2 sm:px-3 {selected ===
        b.id
          ? 'border-accent text-ink'
          : 'text-ink-muted hover:text-ink border-transparent'}"
      >
        <img src={b.icon} alt="" width="18" height="18" class="size-[18px]" />
        {b.name}
      </button>
    {/each}
  </div>

  <div id="panel" role="tabpanel" aria-labelledby="tab-{selected}" tabindex="-1" class="pt-8">
    <ol class="space-y-8">
      <li class="step">
        <h2 class="font-semibold">Download the extension</h2>
        <p class="text-ink-muted mt-1 text-sm">
          The newest build for Chromium browsers, from the
          <a href="{GITHUB_URL}/releases/latest" rel="external" class="text-accent hover:underline">
            latest GitHub release
          </a>.
        </p>
        <a href={CHROMIUM_ZIP_URL} rel="external" class="{primaryBtn} mt-3">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="size-4"
            aria-hidden="true"
          >
            <path d="M10 3v10M6 9l4 4 4-4M4 16h12" />
          </svg>
          Download the zip
        </a>
        <p class="text-ink-muted mt-2 text-xs">career-pocket-chromium.zip</p>
      </li>

      <li class="step">
        <h2 class="font-semibold">Unzip it into a folder you'll keep</h2>
        <p class="text-ink-muted mt-1 text-sm">
          Double-click the zip on a Mac, or right-click it and choose Extract All on Windows. Move
          the folder somewhere permanent, like Documents: {browser.name} runs the extension from it.
        </p>
      </li>

      <li class="step">
        <h2 class="font-semibold">Open the extensions page</h2>
        <p class="text-ink-muted mt-1 text-sm">
          Copy this address into the address bar and press Enter (websites can't link to it).
        </p>
        <div class="mt-3 flex max-w-md items-center gap-2">
          <code class="bg-surface-muted flex-1 rounded-md px-3 py-1.5 text-sm">{browser.page}</code>
          <CopyButton text={browser.page} />
        </div>
        <p class="text-ink-muted mt-2 text-sm">{d.menu}</p>
        {@render shot(`the ${browser.name} extensions page`)}
      </li>

      <li class="step">
        <h2 class="font-semibold">Turn on Developer mode</h2>
        <p class="text-ink-muted mt-1 text-sm">{d.devMode}</p>
        {@render shot(`the Developer mode toggle in ${browser.name}`)}
      </li>

      <li class="step">
        <h2 class="font-semibold">Click “Load unpacked”</h2>
        <p class="text-ink-muted mt-1 text-sm">{d.loadUnpacked}</p>
        {@render shot('the Load unpacked button')}
      </li>

      <li class="step">
        <h2 class="font-semibold">Select the unzipped folder</h2>
        <p class="text-ink-muted mt-1 text-sm">
          Pick the folder that contains <code>manifest.json</code>, then click Select. Career Pocket
          appears in the list.
        </p>
        {@render shot('choosing the unzipped folder')}
      </li>

      <li class="step">
        <h2 class="font-semibold">Pin it to the toolbar</h2>
        <p class="text-ink-muted mt-1 text-sm">
          {d.pin} Then open any job posting and click the Career Pocket icon to save it.
        </p>
        {@render shot(`pinning Career Pocket in ${browser.name}`)}
      </li>
    </ol>
  </div>

  <section aria-labelledby="update-title" class="border-line mt-14 border-t pt-10">
    <h2 id="update-title" class="text-xl font-semibold tracking-tight">How to update</h2>
    <ol class="text-ink-muted mt-4 list-decimal space-y-2 pl-5 text-sm">
      <li>
        <a href={CHROMIUM_ZIP_URL} rel="external" class="text-accent hover:underline">
          Download the newest zip
        </a> and unzip it.
      </li>
      <li>
        Replace everything in your Career Pocket folder with the new files (same folder, same
        place).
      </li>
      <li>
        Open <code class="text-ink">{browser.page}</code> and click {d.reload}. Your jobs and
        settings stay as they were.
      </li>
    </ol>
  </section>

  <section aria-labelledby="faq-title" class="border-line mt-14 border-t pt-10">
    <h2 id="faq-title" class="text-xl font-semibold tracking-tight">Questions</h2>
    <div class="mt-4 space-y-2">
      {#each faq as item (item.q)}
        <details class="border-line group rounded-lg border">
          <summary
            class="focus-visible:ring-accent flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
          >
            {item.q}
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              class="text-ink-muted size-4 shrink-0 transition group-open:rotate-180"
              aria-hidden="true"
            >
              <path d="m5 8 5 5 5-5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </summary>
          <p class="text-ink-muted px-4 pb-4 text-sm">{item.a}</p>
        </details>
      {/each}
    </div>
  </section>
</main>

<style>
  /* Numbered steps: a filled accent circle in front of each heading. */
  ol:has(> .step) {
    counter-reset: step;
  }
  .step {
    counter-increment: step;
    position: relative;
    padding-left: 2.75rem;
  }
  .step::before {
    content: counter(step);
    position: absolute;
    left: 0;
    top: -0.125rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 9999px;
    background: var(--color-accent);
    color: var(--color-accent-ink);
    font-size: 0.875rem;
    font-weight: 600;
  }
</style>
