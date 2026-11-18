<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';

  let { onclose }: { onclose: () => void } = $props();

  const steps = [
    {
      title: 'Save jobs from any site',
      body: 'Open a job posting and click the Pocket Career icon in your toolbar, or press the save shortcut. Title, company and salary are filled in from the page.',
    },
    {
      title: 'Track every application',
      body: 'Move jobs from Saved to Applied, Interview and Offer in the list or on the board. Set follow-up and interview dates to get reminders.',
    },
    {
      title: 'Stay in sync, privately',
      body: 'Your jobs live in this browser. Sign in with Google to sync them through a hidden folder in your own Drive. No servers, no tracking.',
    },
  ];

  let step = $state(0);
  let dialog = $state<HTMLElement>();
  onMount(() => dialog?.focus());

  const last = $derived(step === steps.length - 1);
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') onclose();
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
    tabindex="-1"
    transition:fly={{ y: 12, duration: 150 }}
    class="bg-surface border-line w-full max-w-md rounded-xl border p-6 shadow-2xl outline-none"
  >
    <p class="text-ink-muted text-xs font-medium">
      Welcome to Pocket Career · {step + 1} of {steps.length}
    </p>
    {#key step}
      <div in:fade={{ duration: 120 }}>
        <h2 id="onboarding-title" class="mt-2 text-lg font-semibold">{steps[step]!.title}</h2>
        <p class="text-ink-muted mt-2 text-sm leading-relaxed">{steps[step]!.body}</p>
      </div>
    {/key}

    <div class="mt-5 flex items-center gap-1.5" aria-hidden="true">
      {#each steps as s, i (s.title)}
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
        Skip
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
          onclick={() => (last ? onclose() : step++)}
          class="bg-accent text-accent-ink focus-visible:ring-accent rounded-md px-3 py-1.5 text-sm font-medium transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {last ? 'Get started' : 'Next'}
        </button>
      </div>
    </div>
  </div>
</div>
