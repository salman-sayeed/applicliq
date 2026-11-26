<script lang="ts">
  import Seo from '#lib/Seo.svelte';
  import { resolve } from '$app/paths';
  import { GITHUB_URL } from '#lib/links.ts';
  import { MANUAL_BROWSERS, STORES, storeById, type StoreId } from '#lib/config.ts';
  import { detectBrowser, type DetectedBrowser } from '#lib/browser.ts';
  import StoreGrid from '#lib/StoreGrid.svelte';
  import SupportSection from '#lib/SupportSection.svelte';
  import boardShot from '#lib/assets/screenshots/dashboard-board.webp';
  import listShot from '#lib/assets/screenshots/dashboard-list.webp';
  import statsShot from '#lib/assets/screenshots/dashboard-stats.webp';
  import settingsShot from '#lib/assets/screenshots/settings-data.webp';
  import sidebarShot from '#lib/assets/screenshots/extension-sidebar.webp';
  import pickerShot from '#lib/assets/screenshots/extension-picker.webp';
  import menuShot from '#lib/assets/screenshots/extension-menu.webp';
  import Screenshots from '#lib/Screenshots.svelte';
  import saveVideo from '#lib/assets/screenshots/save-a-job.mp4';
  import savePoster from '#lib/assets/screenshots/save-a-job-poster.jpg';
  import { onMount } from 'svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  // The demo plays only when motion is welcome; otherwise its poster shows and the button
  // starts it. Autoplay starts here, after hydration, never from the prerendered HTML.
  let video = $state<HTMLVideoElement>();
  let playing = $state(false);
  onMount(() => {
    const reduced =
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.hasAttribute('data-reduce-motion');
    if (!reduced) video?.play().catch(() => {});
  });
  const toggleVideo = () => (video?.paused ? video.play().catch(() => {}) : video?.pause());

  // The visitor's browser picks the highlighted store card and the manual install button. The
  // prerendered HTML (no browser known yet) shows neither.
  let browser = $state<DetectedBrowser>('other');
  onMount(() => (browser = detectBrowser()));

  const storeFor: Partial<Record<DetectedBrowser, StoreId>> = {
    firefox: 'firefox',
    'firefox-android': 'firefox-android',
    chrome: 'chrome',
    brave: 'chrome',
    edge: 'edge',
    opera: 'opera',
    safari: 'safari',
  };
  const myStore = $derived.by(() => {
    const id = storeFor[browser];
    return id ? storeById(id) : null;
  });
  // Chrome, Brave, Edge and Opera can load the release zip by hand.
  const manual = $derived(MANUAL_BROWSERS.find((b) => b.id === browser));

  // Icon paths (24×24, stroke) for the feature list.
  const features = [
    {
      title: 'Save from any job site',
      text: 'One click or Alt+Shift+S saves title, company, location and salary from LinkedIn, Indeed, Greenhouse, Lever and most other boards, and flags jobs you already saved.',
      icon: 'M12 5v14M5 12h14',
    },
    {
      title: 'List, board and stats',
      text: 'Sort and filter every application, drag cards across a kanban board, and see your weekly pace against your goals.',
      icon: 'M4 5h6v14H4zM14 5h6v8h-6z',
    },
    {
      title: 'Reminders that matter',
      text: 'Follow-up and interview reminders, plus applications that go quiet are marked ghosted for you after three weeks.',
      icon: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
    },
    {
      title: 'Bring your history',
      text: 'Import the jobs you applied to on LinkedIn, or any spreadsheet from Excel, Notion, Huntr or Teal. Duplicates are caught, and one click undoes it.',
      icon: 'M12 4v11M8 11l4 4 4-4M5 20h14',
    },
    {
      title: 'A heads-up before you apply',
      text: 'Notes on old or closed postings, missing salaries and companies you applied to recently, and the same job saved from two sites merged into one.',
      icon: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    },
    {
      title: 'Resume match',
      text: 'See which skills a job asks for that are on your resume, and which are missing, required or nice to have. Worked out on your device: no AI, no score, nothing uploaded.',
      icon: 'M9 12l2 2 4-4M7 3h7l5 5v13H7zM14 3v5h5',
    },
    {
      title: 'Autofill',
      text: 'Fill Greenhouse, Lever, Ashby, Google Forms and Microsoft Forms applications from your profile, after a preview you can edit, with undo. You always submit yourself.',
      icon: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4zM13.5 6.5l4 4',
    },
    {
      title: 'Follow-ups and offers',
      text: 'Follow-up messages from templates, a list of applications waiting on one, and offers compared side by side with deadline reminders.',
      icon: 'M4 6h16v12H4zM4 7l8 6 8-6',
    },
    {
      title: 'Insights you can share',
      text: 'Response rates and reply times by source and work type, a weekly recap, and a card of your numbers to share (never company names).',
      icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    },
    {
      title: 'Synced through your Drive',
      text: 'Your jobs sync between browsers through a hidden folder in your own Google Drive, encrypted with your own passphrase if you like. No account with us, no server.',
      icon: 'M7 18a5 5 0 0 1-.9-9.9A6 6 0 0 1 17.7 7 4.5 4.5 0 0 1 17 18z',
    },
    {
      title: 'Offline and open source',
      text: 'Everything works offline and syncs later. Free forever, MIT licensed, no analytics, no ads.',
      icon: 'M8 9l-4 3 4 3M16 9l4 3-4 3M13.5 6l-3 12',
    },
  ];

  // Captured with docs/screenshots/capture.mjs and capture-extension.mjs (fictional demo data),
  // 2560×1600.
  const screenshots = [
    {
      id: 'sidebar',
      label: 'Save a job',
      src: sidebarShot,
      alt: 'A job posting with the AppliCliq sidebar next to it: title, company, location, work type and salary already filled in from the page, and a note added.',
      caption:
        'Open the sidebar on any posting: the details fill themselves in, and your draft is kept',
    },
    {
      id: 'picker',
      label: 'Pick from page',
      src: pickerShot,
      alt: 'Picking the location on a job posting for a Product Designer: the location is highlighted, with a label saying "Click to set Location · Esc to cancel", and the empty Location field in the sidebar.',
      caption:
        'Something missing? Click the target next to a field, then click the text on the page',
    },
    {
      id: 'menu',
      label: 'Right-click',
      src: menuShot,
      alt: 'The salary selected on a Data Engineer posting, with the right-click menu open at AppliCliq, then Set as Salary.',
      caption: 'Or select text, right-click and choose Set as Title, Company, Location or Salary',
    },
    {
      id: 'list',
      label: 'List',
      src: listShot,
      alt: 'The AppliCliq dashboard: a list of job applications with their status, location and salary, and the details of one job open in a side panel.',
      caption: 'Every application in one list, with the details a click away',
    },
    {
      id: 'board',
      label: 'Board',
      src: boardShot,
      alt: 'The board view: job cards in Saved, Applied, Assessment, Interview and Offer columns, with salaries, tags and upcoming interview dates.',
      caption: 'Drag jobs across the board as they progress',
    },
    {
      id: 'stats',
      label: 'Stats',
      src: statsShot,
      alt: 'The stats view: daily, weekly and monthly goal rings, a streak, a heatmap of applications per day and an application funnel.',
      caption: 'Goals, streaks and where your applications lead',
    },
    {
      id: 'sync',
      label: 'Sync & data',
      src: settingsShot,
      alt: 'The Sync & data settings: Google Drive account, sync interval, export to JSON or CSV, and import.',
      caption: 'Sync through your own Google Drive, export to JSON or CSV any time',
    },
  ];

  const secondaryBtn =
    'border-line text-ink hover:bg-surface-muted focus-visible:ring-accent rounded-md border px-4 py-2 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none';

  const liveStores = [
    ...new Set(STORES.filter((s) => s.status === 'live').map((s) => s.name.split(' ')[0])),
  ].join(', ');

  const steps = [
    [
      'Install the extension',
      `Get it from ${liveStores}, or install it by hand in Chrome, Brave, Edge or Opera.`,
    ],
    ['Save while you browse', 'Click the icon on any job posting; the details fill themselves in.'],
    ['Track it anywhere', 'Update statuses in the extension or here on the web, after signing in.'],
  ];
</script>

<Seo
  title="AppliCliq – Job Application Tracker"
  description="Save job postings from any site and track every application from saved to offer. Free and open source. Your data stays in your browser and your own Google Drive."
  path="/"
/>

<main>
  <section class="mx-auto max-w-5xl px-4 pt-16 pb-12 text-center sm:pt-24">
    <p class="text-accent text-sm font-medium">Free · open source · no account</p>
    <h1
      class="mx-auto mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
    >
      Every job application, in your pocket
    </h1>
    <p class="text-ink-muted mx-auto mt-5 max-w-xl text-lg text-balance">
      Save postings from any job site in one click and track them from saved to offer. Your data
      never leaves your browser, except to sync with your own Google Drive.
    </p>
    <div id="install" class="mx-auto mt-10 max-w-3xl scroll-mt-20 text-left">
      <StoreGrid current={myStore?.id ?? null} />
    </div>
    <div class="mt-6">
      <a href="{resolve('/(site)/install')}{manual ? `#${manual.id}` : ''}" class={secondaryBtn}>
        {manual ? `Install manually on ${manual.name}` : 'Manual install'}
      </a>
    </div>
    <div class="text-ink-muted mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
      <a href={resolve('/app')} class="hover:text-ink underline-offset-4 hover:underline">
        Open the web dashboard →
      </a>
      <a href={GITHUB_URL} rel="external" class="hover:text-ink underline-offset-4 hover:underline">
        View the source on GitHub →
      </a>
    </div>
  </section>

  <section aria-label="Screenshots" class="mx-auto max-w-5xl px-4 pb-20">
    <figure>
      <div class="relative">
        <!-- Silent screen recording; the caption and the popup screenshot below describe it. -->
        <video
          bind:this={video}
          src={saveVideo}
          poster={savePoster}
          width="1600"
          height="1000"
          muted
          loop
          playsinline
          preload="metadata"
          onplay={() => (playing = true)}
          onpause={() => (playing = false)}
          aria-label="Saving a job: on a job posting, the AppliCliq popup opens with the title, company, location and salary already filled in; a note is added and the job is saved."
          class="border-line bg-surface-muted h-auto w-full rounded-xl border shadow-sm"
        ></video>
        <button
          type="button"
          onclick={toggleVideo}
          aria-label={playing ? 'Pause the demo' : 'Play the demo'}
          class="bg-ink/70 text-surface hover:bg-ink/85 focus-visible:ring-accent absolute right-3 bottom-3 flex size-9 items-center justify-center rounded-full backdrop-blur transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="size-4" aria-hidden="true">
            {#if playing}
              <path d="M5.5 4h3v12h-3zM11.5 4h3v12h-3z" />
            {:else}
              <path
                d="M6 4.5v11a.5.5 0 0 0 .77.42l8.5-5.5a.5.5 0 0 0 0-.84l-8.5-5.5A.5.5 0 0 0 6 4.5Z"
              />
            {/if}
          </svg>
        </button>
      </div>
      <figcaption class="text-ink-muted mt-2 text-center text-sm">
        Save a job in seconds: the details fill themselves in from the page
      </figcaption>
    </figure>
    <div class="mt-10">
      <Screenshots shots={screenshots} />
    </div>
  </section>

  <section id="features" class="bg-surface-muted scroll-mt-16 py-20">
    <div class="mx-auto max-w-5xl px-4">
      <h2 class="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
        Everything a job search needs, nothing it doesn't
      </h2>
      <div class="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {#each features as feature (feature.title)}
          <div>
            <div
              class="bg-accent/10 text-accent flex size-9 items-center justify-center rounded-lg"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                class="size-5"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d={feature.icon} />
              </svg>
            </div>
            <h3 class="mt-3 font-semibold">{feature.title}</h3>
            <p class="text-ink-muted mt-1 text-sm">{feature.text}</p>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="mx-auto max-w-5xl px-4 py-20">
    <h2 class="text-center text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
    <ol class="mt-10 grid gap-6 sm:grid-cols-3">
      {#each steps as [title, text], i (title)}
        <li class="border-line rounded-xl border p-5">
          <span
            class="bg-accent text-accent-ink flex size-7 items-center justify-center rounded-full text-sm font-semibold"
          >
            {i + 1}
          </span>
          <h3 class="mt-3 font-semibold">{title}</h3>
          <p class="text-ink-muted mt-1 text-sm">{text}</p>
        </li>
      {/each}
    </ol>
  </section>

  <section class="mx-auto max-w-5xl px-4 pb-20">
    <div class="border-line rounded-2xl border p-8 sm:p-10">
      <h2 class="text-2xl font-semibold tracking-tight">Private by design</h2>
      <p class="text-ink-muted mt-3 max-w-2xl">
        There is no AppliCliq server. Your jobs live in your browser's storage and sync through a
        hidden app folder in your own Google Drive, which AppliCliq can't see outside of. No
        analytics, no tracking, no third parties.
      </p>
      <a
        href={resolve('/(site)/privacy')}
        class="text-accent mt-4 inline-block text-sm font-medium hover:underline"
      >
        Read the privacy policy →
      </a>
    </div>
  </section>

  <SupportSection qr={data.qr} />
</main>
