<script lang="ts">
  import type { Streak } from '@applicliq/core';

  let { streak, dailyGoal, todayCount }: { streak: Streak; dailyGoal: number; todayCount: number } =
    $props();

  const remaining = $derived(Math.max(0, dailyGoal - todayCount));
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
</script>

<div class="flex items-center gap-4">
  <svg
    viewBox="0 0 24 24"
    class="size-10 shrink-0 {streak.current > 0 ? 'text-status-interview' : 'text-ink-muted/40'}"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      d="M12 2.5c.3 2.6-.9 4.3-2.3 5.8C8.2 9.9 6.5 11.6 6.5 14.6A5.5 5.5 0 0 0 12 20.5a5.5 5.5 0 0 0 5.5-5.9c-.1-1.9-1-3.4-2-4.6-.3 1.3-1 2.3-2 2.8.6-3.5-.4-7-1.5-10.3Zm-.4 10.4c.9 1.2 2.4 2.3 2.4 4a2 2 0 0 1-4 0c0-1.5.8-2.6 1.6-4Z"
    />
  </svg>
  <div>
    {#if dailyGoal <= 0}
      <p class="font-semibold">No daily goal</p>
      <p class="text-ink-muted text-sm">Set one to start a streak.</p>
    {:else}
      <p class="text-lg font-semibold tabular-nums">
        {plural(streak.current, 'day')}
        <span class="text-ink-muted text-sm font-normal">streak</span>
      </p>
      <p class="text-ink-muted text-sm">
        {#if streak.todayMet}
          Today's goal is met.
        {:else}
          {plural(remaining, 'more application')} today {streak.current > 0
            ? 'to keep it going'
            : 'to start one'}.
        {/if}
        Best: {plural(streak.best, 'day')}.
      </p>
    {/if}
  </div>
</div>
