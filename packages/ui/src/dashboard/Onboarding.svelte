<script lang="ts">
  import type { Goals } from '@career-pocket/core';
  import { onMount, type Snippet } from 'svelte';
  import { fade, fly } from '../motion';
  import { rememberFocus, trapTab } from '../a11y/focus';

  let {
    goals,
    onsavegoals,
    sync,
    onclose,
  }: {
    /** Current targets, used to prefill the goals step. */
    goals?: Goals;
    onsavegoals: (goals: Goals) => Promise<void>;
    /** Sign-in control for the last step (optional: the user can skip it). */
    sync?: Snippet;
    onclose: () => void;
  } = $props();

  type Step = { id: 'save' | 'track' | 'goals' | 'sync'; title: string; body: string };
  const steps: Step[] = [
    {
      id: 'save',
      title: 'Save jobs from any site',
      body: 'Open a job posting and click the Career Pocket icon in your toolbar, or press the save shortcut. Title, company and salary are filled in from the page.',
    },
    {
      id: 'track',
      title: 'Track every application',
      body: 'Move jobs from Saved to Applied, Interview and Offer in the list or on the board. Set follow-up and interview dates to get reminders.',
    },
    {
      id: 'goals',
      title: 'Set your goals',
      body: 'How many applications do you want to send? Leave a box empty to skip that goal. You can change these any time in Settings.',
    },
    {
      id: 'sync',
      title: 'Stay in sync, privately',
      body: 'Your jobs live in this browser. Sign in with Google to back them up and sync them through a hidden folder in your own Drive. No servers, no tracking. This is optional.',
    },
  ];

  const MAX = { daily: 100, weekly: 500 } as const;

  let step = $state(0);
  let dialog = $state<HTMLElement>();
  let daily = $state<number | null>(null);
  let weekly = $state<number | null>(null);
  let goalError = $state<string>();
  let saving = $state(false);

  // Settings can load after the dialog opens: prefill the boxes once they arrive.
  let prefilled = false;
  $effect(() => {
    if (prefilled || !goals) return;
    prefilled = true;
    daily = goals.daily;
    weekly = goals.weekly;
  });

  const restoreFocus = rememberFocus();
  onMount(() => {
    dialog?.focus();
    return restoreFocus;
  });

  const current = $derived(steps[step]!);
  const last = $derived(step === steps.length - 1);

  /** null = goal off (empty box), undefined = invalid. */
  function parse(value: number | null | undefined, max: number): number | null | undefined {
    if (value === null || value === undefined || Number.isNaN(value)) return null;
    return Number.isInteger(value) && value >= 1 && value <= max ? value : undefined;
  }

  async function next() {
    if (current.id === 'goals') {
      const d = parse(daily, MAX.daily);
      const w = parse(weekly, MAX.weekly);
      if (d === undefined || w === undefined) {
        goalError = `Use whole numbers: up to ${MAX.daily} a day and ${MAX.weekly} a week.`;
        return;
      }
      goalError = undefined;
      if (d !== (goals?.daily ?? null) || w !== (goals?.weekly ?? null)) {
        saving = true;
        try {
          await onsavegoals({ daily: d, weekly: w, monthly: goals?.monthly ?? null });
        } catch {
          // The dashboard already shows a toast; let the user carry on.
        } finally {
          saving = false;
        }
      }
    }
    if (last) onclose();
    else step++;
  }

  const input =
    'border-line bg-surface focus-visible:ring-accent w-20 rounded-md border px-2 py-1 text-sm tabular-nums focus-visible:ring-2 focus-visible:outline-none';
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') onclose();
    else trapTab(e, dialog);
  }}
/>

<div
  transition:fade={{ duration: 150 }}
  class="bg-ink/40 fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
>
  <div
    bind:this={dialog}
    role="dialog"
    aria-modal="true"
    aria-labelledby="onboarding-title"
    aria-describedby="onboarding-body"
    tabindex="-1"
    transition:fly={{ y: 12, duration: 150 }}
    class="bg-surface border-line w-full max-w-md rounded-xl border p-6 shadow-2xl outline-none"
  >
    <p class="text-ink-muted text-xs font-medium" aria-live="polite">
      Welcome to Career Pocket · Step {step + 1} of {steps.length}
    </p>
    {#key step}
      <div in:fade={{ duration: 120 }}>
        <h2 id="onboarding-title" class="mt-2 text-lg font-semibold">{current.title}</h2>
        <p id="onboarding-body" class="text-ink-muted mt-2 text-sm leading-relaxed">
          {current.body}
        </p>

        {#if current.id === 'goals'}
          <form
            class="mt-4 flex flex-wrap gap-x-6 gap-y-3"
            onsubmit={(e) => {
              e.preventDefault();
              void next();
            }}
          >
            <label class="flex items-center gap-2 text-sm">
              <input
                type="number"
                inputmode="numeric"
                min="1"
                max={MAX.daily}
                bind:value={daily}
                class={input}
                aria-invalid={goalError ? 'true' : undefined}
                aria-describedby={goalError ? 'onboarding-goal-error' : undefined}
              />
              per day
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input
                type="number"
                inputmode="numeric"
                min="1"
                max={MAX.weekly}
                bind:value={weekly}
                class={input}
                aria-invalid={goalError ? 'true' : undefined}
                aria-describedby={goalError ? 'onboarding-goal-error' : undefined}
              />
              per week
            </label>
            <button type="submit" class="sr-only">Save goals</button>
          </form>
          {#if goalError}
            <p id="onboarding-goal-error" role="alert" class="text-status-rejected mt-2 text-sm">
              {goalError}
            </p>
          {/if}
        {:else if current.id === 'sync' && sync}
          <div class="mt-4">{@render sync()}</div>
        {/if}
      </div>
    {/key}

    <div class="mt-5 flex items-center gap-1.5" aria-hidden="true">
      {#each steps as s, i (s.id)}
        <span
          class="h-1.5 rounded-full transition-all {i === step ? 'bg-accent w-5' : 'bg-line w-1.5'}"
        ></span>
      {/each}
    </div>

    <div class="mt-6 flex items-center justify-between gap-2">
      <button
        type="button"
        onclick={onclose}
        class="text-ink-muted hover:text-ink focus-visible:ring-accent rounded px-1 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
      >
        Skip intro
      </button>
      <div class="flex gap-2">
        {#if step > 0}
          <button
            type="button"
            onclick={() => step--}
            class="border-line hover:bg-surface-muted focus-visible:ring-accent rounded-md border px-3 py-1.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none"
          >
            Back
          </button>
        {/if}
        <button
          type="button"
          onclick={() => void next()}
          disabled={saving}
          class="bg-accent text-accent-ink focus-visible:ring-accent rounded-md px-3 py-1.5 text-sm font-medium transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
        >
          {last ? 'Get started' : 'Next'}
        </button>
      </div>
    </div>
  </div>
</div>
