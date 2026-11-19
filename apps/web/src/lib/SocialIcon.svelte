<script lang="ts">
  /** Outline social icons (24×24, stroke), drawn inline: the site loads no remote images. */
  let { icon }: { icon: 'mail' | 'globe' | 'linkedin' | 'github' | 'instagram' } = $props();
</script>

<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.75"
  stroke-linecap="round"
  stroke-linejoin="round"
  class="size-[18px]"
  aria-hidden="true"
>
  {#if icon === 'mail'}
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  {:else if icon === 'globe'}
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  {:else if icon === 'linkedin'}
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect width="4" height="12" x="2" y="9" />
    <circle cx="4" cy="4" r="2" />
  {:else if icon === 'github'}
    <path
      d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"
    />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  {:else}
    <defs>
      <!-- Instagram's own gradient, used for the stroke on hover (see the footer styles). -->
      <linearGradient id="instagram-gradient" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="#feda75" />
        <stop offset="0.3" stop-color="#fa7e1e" />
        <stop offset="0.6" stop-color="#d62976" />
        <stop offset="0.85" stop-color="#962fbf" />
        <stop offset="1" stop-color="#4f5bd5" />
      </linearGradient>
    </defs>
    <rect width="20" height="20" x="2" y="2" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <path d="M17.5 6.5h.01" />
  {/if}
</svg>
