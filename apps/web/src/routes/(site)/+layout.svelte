<script lang="ts">
  import { resolve } from '$app/paths';
  import './site.css';
  import favicon from '#lib/assets/favicon.svg';
  import { GITHUB_URL } from '#lib/links.ts';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();

  const link =
    'hover:text-ink focus-visible:ring-accent rounded transition focus-visible:ring-2 focus-visible:outline-none';
</script>

<div class="flex min-h-dvh flex-col">
  <header class="border-line border-b">
    <nav class="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 text-sm sm:gap-6">
      <a href={resolve('/(site)')} class="flex items-center gap-2 font-semibold {link}">
        <img src={favicon} alt="" class="size-7" />
        Pocket Career
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
    <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6">
      <p>Pocket Career · free and open source (MIT)</p>
      <div class="flex gap-6 sm:ml-auto">
        <a href={resolve('/(site)/privacy')} class={link}>Privacy policy</a>
        <a href={GITHUB_URL} rel="external" class={link}>Source code</a>
      </div>
    </div>
  </footer>
</div>
