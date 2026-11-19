<script lang="ts">
  import { resolve } from '$app/paths';
  import { GITHUB_URL, INSTALL_LINKS } from '#lib/links.ts';
  import boardShot from '#lib/assets/screenshots/dashboard-board.webp';
  import listShot from '#lib/assets/screenshots/dashboard-list.webp';
  import statsShot from '#lib/assets/screenshots/dashboard-stats.webp';
  import saveVideo from '#lib/assets/screenshots/save-a-job.mp4';
  import savePoster from '#lib/assets/screenshots/save-a-job-poster.jpg';
  import { onMount } from 'svelte';

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

  // Icon paths (24×24, stroke) for the feature list.
  const features = [
    {
      title: 'Save from any job site',
      text: 'One click or Alt+Shift+S saves title, company, location and salary from LinkedIn, Indeed, Greenhouse, Lever and most other boards.',
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
      title: 'Spot duplicates',
      text: 'A badge on job pages you already saved, and a heads-up when you have applied to the same company before.',
      icon: 'M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
    },
    {
      title: 'Synced through your Drive',
      text: 'Your jobs sync between browsers through a hidden folder in your own Google Drive. No account with us, no server.',
      icon: 'M7 18a5 5 0 0 1-.9-9.9A6 6 0 0 1 17.7 7 4.5 4.5 0 0 1 17 18z',
    },
    {
      title: 'Offline and open source',
      text: 'Everything works offline and syncs later. Free forever, MIT licensed, no analytics, no ads.',
      icon: 'M8 9l-4 3 4 3M16 9l4 3-4 3M13.5 6l-3 12',
    },
  ];

  // Captured with docs/screenshots/capture.mjs (fictional demo data), 2560×1600.
  const screenshots = [
    {
      src: listShot,
      label: 'Every application in one list, with the details a click away',
      alt: 'The Career Pocket dashboard: a list of job applications with their status, location and salary, and the details of one job open in a side panel.',
      wide: true,
    },
    {
      src: boardShot,
      label: 'Drag jobs across the board as they progress',
      alt: 'The board view: job cards in Saved, Applied, Assessment, Interview and Offer columns, with salaries, tags and upcoming interview dates.',
      wide: false,
    },
    {
      src: statsShot,
      label: 'Goals, streaks and where your applications lead',
      alt: 'The stats view: daily, weekly and monthly goal rings, a four-day streak, a heatmap of applications per day and an application funnel.',
      wide: false,
    },
  ];

  const steps = [
    ['Install the extension', 'Add Career Pocket to Chrome, Firefox or Edge.'],
    ['Save while you browse', 'Click the icon on any job posting; the details fill themselves in.'],
    ['Track it anywhere', 'Update statuses in the extension or here on the web, after signing in.'],
  ];
</script>

<svelte:head>
  <title>Career Pocket: a private, free job application tracker</title>
  <meta
    name="description"
    content="Save job postings from any site and track every application from saved to offer. Free and open source. Your data stays in your browser and your own Google Drive."
  />
</svelte:head>

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
    <div id="install" class="mt-8 flex scroll-mt-20 flex-wrap justify-center gap-3">
      {#each INSTALL_LINKS as { browser, href } (browser)}
        <a
          {href}
          rel="external"
          class="bg-accent text-accent-ink focus-visible:ring-accent rounded-md px-4 py-2 text-sm font-medium transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Add to {browser}
        </a>
      {/each}
    </div>
    <div class="text-ink-muted mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
      <a href={resolve('/app')} class="hover:text-ink underline-offset-4 hover:underline">
        Open the web dashboard →
      </a>
      <a href={GITHUB_URL} rel="external" class="hover:text-ink underline-offset-4 hover:underline">
        View the source on GitHub →
      </a>
    </div>
  </section>

  <section aria-label="Screenshots" class="mx-auto max-w-5xl px-4 pb-20">
    <figure class="mb-4">
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
          aria-label="Saving a job: on a job posting, the Career Pocket popup opens with the title, company, location and salary already filled in; a note is added and the job is saved."
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
    <div class="grid gap-4 sm:grid-cols-2">
      {#each screenshots as shot, i (shot.src)}
        <figure class={shot.wide ? 'sm:col-span-2' : ''}>
          <img
            src={shot.src}
            alt={shot.alt}
            width="2560"
            height="1600"
            loading={i === 0 ? 'eager' : 'lazy'}
            decoding="async"
            class="border-line bg-surface-muted h-auto w-full rounded-xl border shadow-sm"
          />
          <figcaption class="text-ink-muted mt-2 text-center text-sm">{shot.label}</figcaption>
        </figure>
      {/each}
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

  <section class="mx-auto max-w-5xl px-4 pb-24">
    <div class="border-line rounded-2xl border p-8 sm:p-10">
      <h2 class="text-2xl font-semibold tracking-tight">Private by design</h2>
      <p class="text-ink-muted mt-3 max-w-2xl">
        There is no Career Pocket server. Your jobs live in your browser's storage and sync through
        a hidden app folder in your own Google Drive, which Career Pocket can't see outside of. No
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
</main>
