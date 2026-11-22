<script lang="ts">
  /**
   * One screenshot at a time with named tabs above it. The pictures sit in a scroll-snap row,
   * so phones can swipe between them; a tab jumps straight to its picture (no animation).
   */
  type Shot = { id: string; label: string; src: string; alt: string; caption: string };
  let { shots }: { shots: Shot[] } = $props();

  let current = $state(0);
  let track = $state<HTMLDivElement>();
  let tabs: HTMLButtonElement[] = $state([]);

  // The pictures load lazily, but all of them once the section is near the screen, so a tab
  // never shows an empty frame.
  let near = $state(false);
  $effect(() => {
    if (!track || near) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) near = true;
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(track);
    return () => observer.disconnect();
  });

  function show(index: number, focus = false) {
    current = index;
    track?.scrollTo({ left: index * track.clientWidth, behavior: 'instant' });
    tabs[index]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    if (focus) tabs[index]?.focus();
  }

  // Swiping moves the selection along with it.
  function onScroll() {
    if (!track) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);
    if (index !== current && index >= 0 && index < shots.length) {
      current = index;
      tabs[index]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    }
  }

  function onKey(event: KeyboardEvent) {
    const last = shots.length - 1;
    const keys: Record<string, number> = {
      ArrowRight: current === last ? 0 : current + 1,
      ArrowLeft: current === 0 ? last : current - 1,
      Home: 0,
      End: last,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    show(keys[event.key], true);
  }
</script>

<div>
  <div
    role="tablist"
    aria-label="Screenshots"
    tabindex="-1"
    onkeydown={onKey}
    class="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0"
  >
    {#each shots as shot, i (shot.id)}
      <button
        bind:this={tabs[i]}
        type="button"
        role="tab"
        id="shot-tab-{shot.id}"
        aria-selected={current === i}
        aria-controls="shot-{shot.id}"
        tabindex={current === i ? 0 : -1}
        onclick={() => show(i)}
        class="focus-visible:ring-accent shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition focus-visible:ring-2 focus-visible:outline-none {current ===
        i
          ? 'border-accent bg-accent text-accent-ink'
          : 'border-line text-ink-muted hover:text-ink hover:bg-surface-muted'}"
      >
        {shot.label}
      </button>
    {/each}
  </div>

  <div
    bind:this={track}
    onscroll={onScroll}
    class="no-scrollbar border-line bg-surface-muted mt-4 flex snap-x snap-mandatory overflow-x-auto rounded-xl border shadow-sm"
  >
    {#each shots as shot, i (shot.id)}
      <div
        id="shot-{shot.id}"
        role="tabpanel"
        aria-labelledby="shot-tab-{shot.id}"
        inert={current !== i}
        class="w-full shrink-0 snap-center"
      >
        <img
          src={shot.src}
          alt={shot.alt}
          width="2560"
          height="1600"
          loading={i === 0 || near ? 'eager' : 'lazy'}
          decoding="async"
          class="h-auto w-full"
        />
      </div>
    {/each}
  </div>
  <p class="text-ink-muted mt-3 text-center text-sm" aria-live="polite">
    {shots[current].caption}
  </p>
</div>

<style>
  .no-scrollbar {
    scrollbar-width: none;
  }
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
</style>
