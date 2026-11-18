<script lang="ts">
  import { resolve } from '$app/paths';
  import './(site)/site.css';
  import { page } from '$app/state';
</script>

<svelte:head>
  <title>{page.status === 404 ? 'Page not found' : 'Error'} · Pocket Career</title>
</svelte:head>

<main
  class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center"
>
  <p class="text-accent text-sm font-medium">{page.status}</p>
  <h1 class="text-2xl font-semibold tracking-tight">
    {page.status === 404 ? 'This page doesn’t exist' : 'Something went wrong'}
  </h1>
  <a href={resolve('/(site)')} class="text-accent text-sm font-medium hover:underline">
    Back to the home page
  </a>
</main>
