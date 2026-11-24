<script lang="ts">
  import { MIN_GROUP_SIZE, type ResponseRow } from '@applicliq/core';
  import { percent } from '../stats/percent';

  /** Response, interview and offer rates per group, as plain bars (no chart library). */
  let {
    title,
    rows,
    labelFor,
  }: { title: string; rows: ResponseRow[]; labelFor: (key: string | undefined) => string } =
    $props();

  const METRICS = [
    { key: 'responseRate', label: 'Response', bar: 'bg-accent' },
    { key: 'interviewRate', label: 'Interview', bar: 'bg-status-interview' },
    { key: 'offerRate', label: 'Offer', bar: 'bg-status-offer' },
  ] as const;
</script>

<section aria-label={title}>
  <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
    <h3 class="text-sm font-semibold">{title}</h3>
    <ul class="text-ink-muted flex gap-3 text-xs" aria-label="Legend">
      {#each METRICS as m (m.key)}
        <li class="flex items-center gap-1">
          <span class="size-2 rounded-full {m.bar}" aria-hidden="true"></span>{m.label}
        </li>
      {/each}
    </ul>
  </div>
  {#if rows.length === 0}
    <p class="text-ink-muted text-sm">No applications yet.</p>
  {:else}
    <ul class="space-y-3">
      {#each rows as row (row.key ?? '')}
        <li>
          <div class="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span class="truncate font-medium">{labelFor(row.key)}</span>
            <span class="text-ink-muted shrink-0 text-xs tabular-nums">
              {row.applied} applied
            </span>
          </div>
          {#if row.enoughData}
            <dl class="space-y-1">
              {#each METRICS as m (m.key)}
                {@const value = row[m.key] ?? 0}
                <div class="grid grid-cols-[4.5rem_1fr_2.75rem] items-center gap-2 text-xs">
                  <dt class="text-ink-muted">{m.label}</dt>
                  <dd class="bg-surface-muted h-2 overflow-hidden rounded-full">
                    <div class="h-full rounded-full {m.bar}" style:width="{value * 100}%"></div>
                  </dd>
                  <dd class="text-right tabular-nums">{percent(value)}</dd>
                </div>
              {/each}
            </dl>
          {:else}
            <p class="text-ink-muted text-xs">
              Not enough data (fewer than {MIN_GROUP_SIZE} applications)
            </p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>
