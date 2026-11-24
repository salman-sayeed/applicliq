<script lang="ts">
  import {
    type InsightPeriod,
    type Job,
    type Settings,
    WEEK_START_INDEX,
    shareCardData,
    sharePostText,
  } from '@applicliq/core';
  import { onMount } from 'svelte';
  import { copyText, downloadFile } from '../format';
  import { btn, btnPrimary } from '../smart/styles';
  import { SHARE_SITE, type ShareTheme, canvasToPng, drawShareCard, loadLogo } from './share-card';

  /** A PNG of your numbers to share, made in the browser. Never includes company names. */
  let { jobs, settings, logoUrl }: { jobs: Job[]; settings: Settings; logoUrl?: string } = $props();

  let period = $state<InsightPeriod>('week');
  let theme = $state<ShareTheme>(
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
  );
  let showStreak = $state(true);
  let showGoal = $state(true);

  let canvas = $state<HTMLCanvasElement>();
  let logo = $state<HTMLImageElement>();
  let status = $state<{ text: string; error?: boolean }>();

  const data = $derived(
    shareCardData(jobs, settings.goals, period, {
      weekStartsOn: WEEK_START_INDEX[settings.goals.weekStartsOn],
      streak: showStreak && settings.goals.daily !== null,
      goal: showGoal,
    }),
  );

  onMount(() => {
    void loadLogo(logoUrl).then((img) => (logo = img));
  });

  $effect(() => {
    if (canvas) drawShareCard(canvas, data, { theme, logo });
  });

  function say(text: string, error = false) {
    status = { text, error };
  }

  async function download() {
    if (!canvas) return;
    downloadFile(`applicliq-${period}.png`, await canvasToPng(canvas), 'image/png');
    say('Downloaded.');
  }

  async function copyImage() {
    if (!canvas) return;
    try {
      // A promise for the blob keeps the click's permission in Safari.
      const png = canvasToPng(canvas);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      say('Image copied.');
    } catch {
      say("This browser can't copy images. Use Download instead.", true);
    }
  }

  async function copyPost() {
    try {
      await copyText(sharePostText(data, SHARE_SITE));
      say('Post text copied.');
    } catch {
      say('Could not copy the text.', true);
    }
  }

  const seg = (active: boolean) =>
    `focus-visible:ring-accent rounded px-2.5 py-1 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none ${
      active ? 'bg-surface-muted text-ink' : 'text-ink-muted hover:text-ink'
    }`;
</script>

<div class="grid gap-4 md:grid-cols-[1fr_15rem]">
  <canvas
    bind:this={canvas}
    class="border-line aspect-[1200/630] w-full rounded-lg border"
    aria-label="Share card preview: {data.stats.applications} applications, {data.stats
      .responses} responses, {data.stats.interviews} interviews, {data.stats.offers} offers"
  ></canvas>

  <div class="space-y-3 text-sm">
    <div>
      <p class="text-ink-muted mb-1 text-xs font-medium">Period</p>
      <div class="border-line inline-flex rounded-md border p-0.5" role="group" aria-label="Period">
        {#each [['week', 'Week'], ['month', 'Month'], ['all', 'All time']] as const as [value, label] (value)}
          <button
            type="button"
            aria-pressed={period === value}
            class={seg(period === value)}
            onclick={() => (period = value)}
          >
            {label}
          </button>
        {/each}
      </div>
    </div>
    <div>
      <p class="text-ink-muted mb-1 text-xs font-medium">Theme</p>
      <div class="border-line inline-flex rounded-md border p-0.5" role="group" aria-label="Theme">
        {#each [['light', 'Light'], ['dark', 'Dark']] as const as [value, label] (value)}
          <button
            type="button"
            aria-pressed={theme === value}
            class={seg(theme === value)}
            onclick={() => (theme = value)}
          >
            {label}
          </button>
        {/each}
      </div>
    </div>
    <label class="flex items-center gap-2">
      <input type="checkbox" bind:checked={showStreak} class="accent-[var(--color-accent)]" />
      Show streak
    </label>
    <label class="flex items-center gap-2">
      <input
        type="checkbox"
        bind:checked={showGoal}
        disabled={period === 'all'}
        class="accent-[var(--color-accent)]"
      />
      Show goal progress
    </label>
    <div class="flex flex-wrap gap-2 pt-1">
      <button type="button" class={btnPrimary} onclick={download}>Download</button>
      <button type="button" class={btn} onclick={copyImage}>Copy image</button>
      <button type="button" class={btn} onclick={copyPost}>Copy LinkedIn post</button>
    </div>
    {#if status}
      <p
        role={status.error ? 'alert' : 'status'}
        class="text-xs {status.error ? 'text-status-rejected' : 'text-ink-muted'}"
      >
        {status.text}
      </p>
    {/if}
    <p class="text-ink-muted text-xs">
      Numbers only, never company names. The image is made on this device.
    </p>
  </div>
</div>
