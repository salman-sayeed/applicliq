<script lang="ts">
  import { resolve } from '$app/paths';
  import './site.css';
  import logo from '#lib/assets/logo.png';
  import { AUTHOR_LINKS, AUTHOR_URL, GITHUB_URL } from '#lib/links.ts';
  import SocialIcon from '#lib/SocialIcon.svelte';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();

  const year = new Date().getFullYear();

  const link =
    'hover:text-ink focus-visible:ring-accent rounded transition focus-visible:ring-2 focus-visible:outline-none';
</script>

<div class="flex min-h-dvh flex-col">
  <header class="border-line border-b">
    <nav class="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 text-sm sm:gap-6">
      <a href={resolve('/(site)')} class="flex items-center gap-2 font-semibold {link}">
        <img src={logo} alt="" class="size-7" />
        AppliCliq
      </a>
      <div class="text-ink-muted ml-auto flex items-center gap-4 sm:gap-6">
        <a href={resolve('/(site)/privacy')} class="hidden sm:inline {link}">Privacy</a>
        <a href={GITHUB_URL} rel="external" class={link}>GitHub</a>
        <a
          href={resolve('/app')}
          class="bg-accent text-accent-ink focus-visible:ring-accent rounded-md px-3 py-1.5 font-medium transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Open app
        </a>
      </div>
    </nav>
  </header>

  <div class="flex-1">
    {@render children()}
  </div>

  <footer class="border-line text-ink-muted border-t text-sm">
    <div
      class="mx-auto flex max-w-5xl flex-col items-center gap-5 px-4 py-8 sm:flex-row sm:justify-between"
    >
      <div class="flex flex-col items-center gap-2 sm:items-start">
        <p class="flex items-center gap-2">
          <img src={logo} alt="" class="size-5" />
          AppliCliq · free and open source (MIT)
        </p>
        <div class="flex gap-6">
          <a href={resolve('/(site)/install')} class={link}>Manual install</a>
          <a href={resolve('/(site)/privacy')} class={link}>Privacy policy</a>
          <a href={GITHUB_URL} rel="external" class={link}>Source code</a>
        </div>
      </div>
      <ul class="flex items-center gap-2" aria-label="Salman Sayeed's links">
        {#each AUTHOR_LINKS as social (social.name)}
          <li>
            <a
              href={social.href}
              rel="external me"
              aria-label={social.name}
              title={social.name}
              class="social social-{social.icon} border-line focus-visible:ring-accent flex size-9 items-center justify-center rounded-full border transition focus-visible:ring-2 focus-visible:outline-none"
            >
              <SocialIcon icon={social.icon} />
            </a>
          </li>
        {/each}
      </ul>
    </div>
    <div class="border-line border-t">
      <p class="mx-auto max-w-5xl px-4 py-4 text-center text-xs">
        © {year} Handcrafted by
        <a
          href={AUTHOR_URL}
          rel="external"
          class="text-ink hover:text-accent focus-visible:ring-accent rounded font-mono font-medium whitespace-nowrap transition focus-visible:ring-2 focus-visible:outline-none"
        >
          <span class="text-accent">&lt;/</span> Salman <span class="text-accent">&gt;</span>
        </a>
      </p>
    </div>
  </footer>
</div>

<style>
  /* Each icon shows its network's own colour on hover or keyboard focus. */
  .social:hover,
  .social:focus-visible {
    color: var(--brand);
    border-color: color-mix(in srgb, var(--brand) 45%, transparent);
    background-color: color-mix(in srgb, var(--brand) 10%, transparent);
  }
  .social-mail {
    --brand: #ea4335;
  }
  .social-globe {
    --brand: var(--color-accent);
  }
  .social-linkedin {
    --brand: light-dark(#0a66c2, #70b5f9);
  }
  .social-github {
    --brand: light-dark(#181717, #f0f6fc);
  }
  .social-instagram {
    --brand: #e1306c;
  }
  .social-instagram:hover :global(svg),
  .social-instagram:focus-visible :global(svg) {
    stroke: url(#instagram-gradient);
  }
</style>
