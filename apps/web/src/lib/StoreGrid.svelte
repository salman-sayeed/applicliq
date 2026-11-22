<script lang="ts">
  import { STORES, type StoreId } from '#lib/config.ts';

  /** The store for the visitor's browser, highlighted as "Your browser". */
  let { current = null }: { current?: StoreId | null } = $props();

  const base =
    'store border-line bg-surface relative flex h-full items-center gap-3 rounded-xl border p-4 text-left';
</script>

<ul class="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 lg:grid-cols-3">
  {#each STORES as store (store.id)}
    {@const mine = store.id === current}
    <li style="--brand: {store.color}">
      {#snippet body()}
        <img src={store.icon} alt="" width="40" height="40" class="size-10 shrink-0" />
        <span class="min-w-0">
          <span class="block leading-snug font-medium">{store.name}</span>
          {#if store.status === 'live'}
            <span class="text-ink-muted mt-0.5 flex items-center gap-1.5 text-xs">
              <span class="size-1.5 rounded-full bg-emerald-500" aria-hidden="true"></span>
              Available
            </span>
          {:else}
            <span
              class="bg-surface-muted text-ink-muted mt-1 inline-block rounded-full px-2 py-0.5 text-xs"
            >
              Coming soon
            </span>
          {/if}
        </span>
        {#if mine}
          <span
            class="bg-accent text-accent-ink absolute -top-2.5 right-3 rounded-full px-2 py-0.5 text-[11px] font-medium"
          >
            Your browser
          </span>
        {/if}
      {/snippet}
      {#if store.status === 'live'}
        <a
          href={store.url}
          target="_blank"
          rel="external noopener"
          class="{base} live focus-visible:ring-accent transition focus-visible:ring-2 focus-visible:outline-none"
          class:mine
        >
          {@render body()}
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            class="text-ink-muted ml-auto size-4 shrink-0"
            aria-hidden="true"
          >
            <path d="M8 4h8v8M16 4 5 15" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="sr-only">(opens in a new tab)</span>
        </a>
      {:else}
        <a role="link" aria-disabled="true" class="{base} soon transition" class:mine>
          {@render body()}
        </a>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .live:hover,
  .live:focus-visible {
    border-color: color-mix(in srgb, var(--brand) 50%, transparent);
    box-shadow: 0 10px 28px -12px color-mix(in srgb, var(--brand) 70%, transparent);
  }
  @media (prefers-reduced-motion: no-preference) {
    .live:hover {
      transform: translateY(-2px);
    }
  }
  .soon {
    cursor: default;
  }
  .soon > :global(img),
  .soon > :global(span:not(.absolute)) {
    opacity: 0.6;
  }
  .soon > :global(img) {
    filter: grayscale(0.6);
  }
  .soon:hover {
    border-color: color-mix(in srgb, var(--brand) 25%, var(--color-line));
  }
  .soon:hover > :global(img) {
    filter: none;
  }
  .mine {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 1px var(--color-accent);
  }
</style>
