<script lang="ts">
  import { SUPPORT } from '#lib/config.ts';
  import CopyButton from '#lib/CopyButton.svelte';

  /** QR code of the crypto address, drawn at build time (see (site)/+page.server.ts). */
  let { qr }: { qr: { size: number; path: string } | null } = $props();

  const { donationUrl, donationLabel, crypto } = SUPPORT;
</script>

<section id="support" aria-labelledby="support-title" class="mx-auto max-w-5xl px-4 pb-20">
  <div class="border-line flex flex-col gap-6 rounded-2xl border p-6 sm:flex-row sm:items-center">
    <div class="min-w-0 flex-1">
      <h2 id="support-title" class="font-semibold">Support Career Pocket</h2>
      <p class="text-ink-muted mt-1 text-sm">
        Career Pocket is free. If it helped you, you can buy me a coffee ☕
      </p>
      {#if donationUrl}
        <a
          href={donationUrl}
          target="_blank"
          rel="external noopener"
          class="bg-accent text-accent-ink focus-visible:ring-accent mt-4 inline-block rounded-md px-4 py-2 text-sm font-medium transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {donationLabel}
        </a>
      {:else}
        <!-- Placeholder until SUPPORT.donationUrl is set in config.ts. -->
        <span
          class="border-line text-ink-muted mt-4 inline-block rounded-md border border-dashed px-4 py-2 text-sm"
        >
          {donationLabel} · link coming soon
        </span>
      {/if}
      {#if crypto.address}
        <div class="mt-4">
          <p class="text-sm font-medium">
            {crypto.coin}
            {#if crypto.network}
              <span class="bg-surface-muted text-ink-muted ml-1 rounded-full px-2 py-0.5 text-xs">
                {crypto.network} network
              </span>
            {/if}
          </p>
          <div class="mt-2 flex items-center gap-2">
            <code
              class="bg-surface-muted min-w-0 flex-1 rounded-md px-2.5 py-1.5 text-xs break-all"
            >
              {crypto.address}
            </code>
            <CopyButton text={crypto.address} />
          </div>
          {#if crypto.network}
            <p class="text-ink-muted mt-1.5 text-xs">
              Send only {crypto.coin || 'this coin'} on the {crypto.network} network to this address.
            </p>
          {/if}
        </div>
      {:else}
        <!-- Placeholder until SUPPORT.crypto is set in config.ts. -->
        <div class="mt-4">
          <p class="text-ink-muted text-sm font-medium">Crypto</p>
          <p
            class="border-line text-ink-muted mt-2 rounded-md border border-dashed px-2.5 py-1.5 text-xs"
          >
            Wallet address coming soon
          </p>
        </div>
      {/if}
    </div>
    {#if qr}
      <svg
        viewBox="-4 -4 {qr.size + 8} {qr.size + 8}"
        shape-rendering="crispEdges"
        role="img"
        aria-label="QR code of the {crypto.coin} address"
        class="size-36 shrink-0 self-center rounded-lg bg-white"
      >
        <path d={qr.path} fill="#000" />
      </svg>
    {:else}
      <div
        class="border-line text-ink-muted flex size-36 shrink-0 items-center justify-center self-center rounded-lg border border-dashed text-xs"
        aria-hidden="true"
      >
        QR code
      </div>
    {/if}
  </div>
</section>
