<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type Props = HTMLButtonAttributes & {
    variant?: 'primary' | 'secondary' | 'ghost';
    children: Snippet;
  };

  let {
    variant = 'primary',
    type = 'button',
    class: className = '',
    children,
    ...rest
  }: Props = $props();

  const variants = {
    primary: 'bg-accent text-accent-ink hover:opacity-90',
    secondary: 'border border-line text-ink hover:bg-surface-muted',
    ghost: 'text-ink hover:bg-surface-muted',
  };
</script>

<button
  {type}
  class="focus-visible:ring-accent inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50 {variants[
    variant
  ]} {className}"
  {...rest}
>
  {@render children()}
</button>
