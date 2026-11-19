<script lang="ts">
  import {
    ACCENT_COLORS,
    type DashboardViewSetting,
    type Density,
    type Theme,
  } from '@career-pocket/core';
  import { ACCENT_SWATCH } from '../../status';
  import Choice from '../Choice.svelte';
  import Field from '../Field.svelte';
  import Toggle from '../Toggle.svelte';
  import type { SectionProps } from '../types';

  let { settings, save }: SectionProps = $props();

  const a = $derived(settings.appearance);

  const themes: { value: Theme; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
  const views: { value: DashboardViewSetting; label: string }[] = [
    { value: 'list', label: 'List' },
    { value: 'board', label: 'Board' },
    { value: 'stats', label: 'Stats' },
  ];
  const densities: { value: Density; label: string }[] = [
    { value: 'comfortable', label: 'Comfortable' },
    { value: 'compact', label: 'Compact' },
  ];
</script>

<Field label="Theme">
  <Choice
    label="Theme"
    value={a.theme}
    options={themes}
    onchange={(theme) => save({ appearance: { theme } })}
  />
</Field>

<Field label="Accent colour">
  <div class="flex gap-2" role="radiogroup" aria-label="Accent colour">
    {#each ACCENT_COLORS as color (color)}
      <button
        type="button"
        role="radio"
        aria-checked={a.accentColor === color}
        aria-label={color}
        title={color[0]!.toUpperCase() + color.slice(1)}
        onclick={() => a.accentColor !== color && save({ appearance: { accentColor: color } })}
        style:background-color={ACCENT_SWATCH[color]}
        class="ring-offset-surface focus-visible:ring-ink size-7 rounded-full ring-offset-2 transition focus-visible:ring-2 focus-visible:outline-none {a.accentColor ===
        color
          ? 'ring-ink ring-2'
          : 'hover:scale-110'}"
      ></button>
    {/each}
  </div>
</Field>

<Field
  label="Reduce motion"
  hint="Turns off animations. Career Pocket already follows your system's reduced-motion setting."
>
  <Toggle
    label="Reduce motion"
    checked={a.reduceMotion}
    onchange={(reduceMotion) => save({ appearance: { reduceMotion } })}
  />
</Field>

<Field label="Dashboard opens on">
  <Choice
    label="Dashboard opens on"
    value={a.defaultDashboardView}
    options={views}
    onchange={(defaultDashboardView) => save({ appearance: { defaultDashboardView } })}
  />
</Field>

<Field label="Density" hint="Compact fits more jobs on screen in the list and on the board.">
  <Choice
    label="Density"
    value={a.density}
    options={densities}
    onchange={(density) => save({ appearance: { density } })}
  />
</Field>
