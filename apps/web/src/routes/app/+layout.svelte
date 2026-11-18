<script lang="ts">
  import './app.css';
  import { applyCachedAppearance } from '@pocket-career/ui';
  import type { LayoutProps } from './$types';

  // Theme and accent from the last visit, before settings load from IndexedDB.
  if (typeof document !== 'undefined') applyCachedAppearance();

  let { children }: LayoutProps = $props();
</script>

{@render children()}
