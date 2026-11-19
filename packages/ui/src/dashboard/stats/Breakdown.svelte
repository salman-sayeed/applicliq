<script lang="ts">
  import type { BreakdownRow } from '@career-pocket/core';
  import { percent } from './percent';

  let {
    title,
    rows,
    labelFor = (key) => key ?? 'Unknown',
  }: {
    title: string;
    rows: BreakdownRow[];
    labelFor?: (key: string | undefined) => string;
  } = $props();

  const maxApplied = $derived(Math.max(1, ...rows.map((r) => r.applied)));
</script>

<table class="w-full text-left text-sm">
  <caption class="text-ink-muted mb-2 text-left text-xs font-semibold tracking-wide uppercase">
    {title}
  </caption>
  <thead class="text-ink-muted text-xs">
    <tr>
      <th scope="col" class="py-1.5 pr-2 font-medium"><span class="sr-only">{title}</span></th>
      <th scope="col" class="px-2 py-1.5 text-right font-medium">Saved</th>
      <th scope="col" class="px-2 py-1.5 font-medium">Applied</th>
      <th scope="col" class="px-2 py-1.5 text-right font-medium">Interviews</th>
      <th scope="col" class="px-2 py-1.5 text-right font-medium">Offers</th>
      <th scope="col" class="py-1.5 pl-2 text-right font-medium" title="Interviews per application">
        Interview rate
      </th>
    </tr>
  </thead>
  <tbody class="divide-line divide-y">
    {#each rows as row (row.key ?? '')}
      <tr>
        <th
          scope="row"
          class="max-w-32 truncate py-2 pr-2 font-medium {row.key ? '' : 'text-ink-muted italic'}"
        >
          {labelFor(row.key)}
        </th>
        <td class="text-ink-muted px-2 py-2 text-right tabular-nums">{row.saved}</td>
        <td class="px-2 py-2">
          <span class="flex items-center gap-2">
            <span class="w-6 text-right tabular-nums">{row.applied}</span>
            <span class="bg-surface-muted hidden h-1.5 flex-1 rounded-full sm:block">
              <span
                class="bg-status-applied block h-full rounded-full"
                style:width="{(row.applied / maxApplied) * 100}%"
              ></span>
            </span>
          </span>
        </td>
        <td class="px-2 py-2 text-right tabular-nums">{row.interview}</td>
        <td class="px-2 py-2 text-right tabular-nums">{row.offer}</td>
        <td class="py-2 pl-2 text-right font-medium tabular-nums">{percent(row.interviewRate)}</td>
      </tr>
    {/each}
  </tbody>
</table>
