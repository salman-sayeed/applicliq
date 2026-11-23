<script lang="ts">
  import { SITE_URL } from '#lib/links.ts';

  /**
   * <title>, description, canonical link and Open Graph / Twitter tags for a public page.
   * `path` is the page's path on the site, e.g. '/' or '/install'.
   */
  let { title, description, path }: { title: string; description: string; path: string } = $props();

  const url = $derived(SITE_URL + path);
  const image = `${SITE_URL}/og-image.png`;
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={url} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="AppliCliq" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={url} />
  <meta property="og:image" content={image} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="AppliCliq – Job Application Tracker" />
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>
