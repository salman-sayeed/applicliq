<script lang="ts">
  import Seo from '#lib/Seo.svelte';
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import { CHROMIUM_ZIP_URL, MANUAL_BROWSERS, storeById } from '#lib/config.ts';
  import { detectBrowser, type DetectedBrowser } from '#lib/browser.ts';
  import CopyButton from '#lib/CopyButton.svelte';
  import { GITHUB_URL } from '#lib/links.ts';

  const firefox = storeById('firefox');
  const safari = storeById('safari');

  /** Extensions page addresses. Arc and other Chromium browsers use chrome://extensions. */
  const ADDRESSES: { id: string; name: string; icon?: string; page: string }[] = [
    ...MANUAL_BROWSERS,
    { id: 'vivaldi', name: 'Vivaldi', page: 'vivaldi://extensions' },
  ];

  // The highlighted row: the one named in the URL hash (/install#brave, from the home page's
  // button), else the visitor's browser. Detected on mount: the page is prerendered.
  let detected = $state<DetectedBrowser>('other');
  let highlighted = $state<string>();
  onMount(() => {
    detected = detectBrowser();
    const fromHash = location.hash.slice(1);
    highlighted = ADDRESSES.some((a) => a.id === fromHash)
      ? fromHash
      : ADDRESSES.some((a) => a.id === detected)
        ? detected
        : undefined;
  });

  /** Firefox and Safari visitors see their own card first; the Chromium guide follows. */
  const onFirefox = $derived(detected === 'firefox' || detected === 'firefox-android');
  const onSafari = $derived(detected === 'safari');

  const faq = [
    {
      q: 'The browser warns about developer-mode extensions. Is that a problem?',
      a: 'No, that is normal for any extension loaded by hand rather than from a store. Close the message or choose to keep the extension; don’t turn developer mode off, or the browser disables AppliCliq.',
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
  const secondaryBtn =
    'border-line text-ink hover:bg-surface-muted focus-visible:ring-accent inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none';
</script>

<Seo
  title="Install AppliCliq · Chrome, Brave, Edge, Opera, Vivaldi, Arc"
  description="Install the AppliCliq extension in Chrome, Brave, Edge, Opera, Vivaldi, Arc or any Chromium browser from the latest release, or get it from Firefox Add-ons."
  path="/install"
/>

{#snippet firefoxCard(mine: boolean)}
  <section
    aria-labelledby="firefox-title"
    class="flex flex-col gap-3 rounded-xl border p-4 {mine
      ? 'border-accent ring-accent ring-1'
      : 'border-line'}"
  >
    <div class="flex items-center gap-3">
      <img src={firefox.icon} alt="" width="32" height="32" class="size-8 shrink-0" />
      <div>
        <h2 id="firefox-title" class="font-semibold">
          Firefox
          {#if mine}<span class="text-accent ml-1 text-xs font-medium">Your browser</span>{/if}
        </h2>
        <p class="text-ink-muted text-sm">Desktop and Android.</p>
      </div>
    </div>
    <p class="text-ink-muted text-sm">
      Firefox only allows signed add-ons, so the store is the way to install. It updates itself.
    </p>
    <a
      href={firefox.url}
      target="_blank"
      rel="external noopener"
      class="{mine ? primaryBtn : secondaryBtn} self-start"
    >
      Install from Firefox Add-ons
      <span aria-hidden="true">↗</span>
      <span class="sr-only">(opens in a new tab)</span>
    </a>
  </section>
{/snippet}

{#snippet safariCard(mine: boolean)}
  <section
    aria-labelledby="safari-title"
    class="flex flex-col gap-3 rounded-xl border p-4 {mine
      ? 'border-accent ring-accent ring-1'
      : 'border-line'}"
  >
    <div class="flex items-center gap-3">
      <img src={safari.icon} alt="" width="32" height="32" class="size-8 shrink-0" />
      <div>
        <h2 id="safari-title" class="font-semibold">
          Safari
          {#if mine}<span class="text-accent ml-1 text-xs font-medium">Your browser</span>{/if}
        </h2>
        <p class="text-ink-muted text-sm">Not available yet.</p>
      </div>
    </div>
    <p class="text-ink-muted text-sm">
      Safari needs an App Store release. Until then, the
      <a href={resolve('/app')} class="text-accent hover:underline">web dashboard</a> works in Safari.
    </p>
  </section>
{/snippet}

<main class="mx-auto max-w-3xl px-4 pt-12 pb-24 sm:pt-16">
  <h1 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Install AppliCliq</h1>
  <p class="text-ink-muted mt-3 text-balance">
    Until AppliCliq is in the Chrome Web Store, load it by hand from the latest release. It takes
    about two minutes.
  </p>

  {#if onFirefox || onSafari}
    <div class="mt-8">
      {#if onFirefox}{@render firefoxCard(true)}{:else}{@render safariCard(true)}{/if}
    </div>
  {/if}

  <section aria-labelledby="chromium-title" class="mt-10">
    <h2 id="chromium-title" class="text-xl font-semibold tracking-tight">Chromium browsers</h2>
    <p class="text-ink-muted mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span class="flex items-center gap-1" aria-hidden="true">
        {#each MANUAL_BROWSERS as b (b.id)}
          <img src={b.icon} alt="" width="18" height="18" class="size-[18px]" />
        {/each}
      </span>
      <span>
        Works in Chrome, Brave, Edge, Opera, Vivaldi, Arc and other Chromium-based browsers.
      </span>
    </p>

    <ol class="mt-8 space-y-8">
      <li class="step">
        <h3 class="font-semibold">Download applicliq-chromium.zip</h3>
        <p class="text-ink-muted mt-1 text-sm">
          The newest build, from the
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
      </li>

      <li class="step">
        <h3 class="font-semibold">Unzip it</h3>
        <p class="text-ink-muted mt-1 text-sm">
          Double-click it on a Mac, or right-click it and choose Extract All on Windows. Keep the
          folder somewhere permanent, like Documents: the browser runs AppliCliq from it.
        </p>
      </li>

      <li class="step">
        <h3 class="font-semibold">Open your browser's extensions page</h3>
        <p class="text-ink-muted mt-1 text-sm">
          Copy the address for your browser into the address bar and press Enter (websites can't
          link to it).
        </p>
        <!-- On the narrowest phones the table scrolls on its own; the page never does. -->
        <div class="relative mt-3 max-w-md overflow-x-auto">
          <table class="w-full text-sm">
            <caption class="sr-only">Extensions page address for each browser</caption>
            <tbody>
              {#each ADDRESSES as a (a.id)}
                {@const mine = a.id === highlighted}
                <tr
                  class={mine
                    ? 'bg-accent/10 outline-accent outline outline-1 -outline-offset-1'
                    : ''}
                >
                  <th
                    scope="row"
                    class="rounded-l-md py-1.5 pr-2 pl-2 text-left font-medium sm:pr-3"
                  >
                    <span class="flex items-center gap-2 whitespace-nowrap">
                      {#if a.icon}
                        <img src={a.icon} alt="" width="16" height="16" class="size-4 shrink-0" />
                      {:else}
                        <span class="size-4 shrink-0" aria-hidden="true"></span>
                      {/if}
                      {a.name}
                    </span>
                    {#if mine}
                      <span
                        class="text-accent block pl-6 text-[11px] font-medium whitespace-nowrap"
                      >
                        Your browser
                      </span>
                    {/if}
                  </th>
                  <td class="py-1.5 pr-2">
                    <code class="text-xs whitespace-nowrap sm:text-sm">{a.page}</code>
                  </td>
                  <td class="rounded-r-md py-1.5 pr-2 text-right">
                    <CopyButton text={a.page} compact />
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="text-ink-muted mt-2 text-xs">
          Arc and other Chromium browsers: chrome://extensions
        </p>
      </li>

      <li class="step">
        <h3 class="font-semibold">Turn on Developer mode</h3>
        <p class="text-ink-muted mt-1 text-sm">
          Switch on the Developer mode toggle, usually in the top-right corner (in Edge, in the left
          sidebar).
        </p>
      </li>

      <li class="step">
        <h3 class="font-semibold">Click “Load unpacked” and select the unzipped folder</h3>
        <p class="text-ink-muted mt-1 text-sm">
          Pick the folder that contains <code>manifest.json</code>. AppliCliq appears in the list.
        </p>
      </li>

      <li class="step">
        <h3 class="font-semibold">Pin AppliCliq to the toolbar</h3>
        <p class="text-ink-muted mt-1 text-sm">
          Click the extensions icon next to the address bar (a puzzle piece; a cube in Opera), then
          the pin next to AppliCliq (the eye icon in Edge). Open any job posting and click the
          AppliCliq icon to save it.
        </p>
      </li>
    </ol>
  </section>

  <section aria-labelledby="update-title" class="border-line mt-14 border-t pt-10">
    <h2 id="update-title" class="text-xl font-semibold tracking-tight">How to update</h2>
    <ol class="text-ink-muted mt-4 list-decimal space-y-2 pl-5 text-sm">
      <li>
        <a href={CHROMIUM_ZIP_URL} rel="external" class="text-accent hover:underline">
          Download the newest zip
        </a> and unzip it.
      </li>
      <li>
        Replace everything in your AppliCliq folder with the new files (same folder, same place).
      </li>
      <li>
        Open your browser's extensions page and click reload on the AppliCliq card (the circular
        arrow; “Reload” in Edge). Your jobs and settings stay as they were.
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

  <div class="border-line mt-14 grid gap-3 border-t pt-10 sm:grid-cols-2">
    {#if !onFirefox}{@render firefoxCard(false)}{/if}
    {#if !onSafari}{@render safariCard(false)}{/if}
  </div>
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
