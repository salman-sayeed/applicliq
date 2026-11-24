<script lang="ts">
  import { type ConversionRate, type Job, compareOffers, hasOffer } from '@applicliq/core';
  import { getPrefs } from '../../prefs.svelte';
  import { WORK_TYPE_LABELS } from '../../status';
  import { formatMoney } from '../format';
  import Modal from '../Modal.svelte';
  import { btn, fieldInline, label } from './styles';

  /**
   * Offers side by side (Smart helpers → Offer comparison). Loaded on demand. No exchange rates
   * are fetched: different currencies stay apart unless the user types a rate.
   */
  let {
    jobs,
    initial = [],
    onopen,
    onclose,
  }: {
    jobs: Job[];
    /** Jobs to start with selected (e.g. the open job). */
    initial?: string[];
    onopen: (id: string) => void;
    onclose: () => void;
  } = $props();

  const MAX = 3;
  const prefs = getPrefs();
  const offers = $derived(
    jobs.filter(hasOffer).sort((a, b) => (b.offer?.base ?? 0) - (a.offer?.base ?? 0)),
  );

  // svelte-ignore state_referenced_locally
  let selected = $state<string[]>(
    [...initial, ...jobs.filter(hasOffer).map((j) => j.id)]
      .filter((id, i, all) => all.indexOf(id) === i && jobs.some((j) => j.id === id))
      .slice(0, MAX),
  );
  const chosen = $derived(
    selected.map((id) => jobs.find((j) => j.id === id)).filter((j): j is Job => !!j),
  );

  let rateFrom = $state('');
  let rateTo = $state('');
  let rateText = $state('');
  const rate = $derived.by((): ConversionRate | undefined => {
    const value = Number(rateText.replace(',', '.'));
    return rateFrom && rateTo && rateFrom !== rateTo && value > 0
      ? { from: rateFrom, to: rateTo, rate: value }
      : undefined;
  });

  const comparison = $derived(compareOffers(chosen, rate));
  const mixed = $derived(comparison.currencies.length > 1);
  $effect(() => {
    // Suggest the pair to convert between when two currencies are in play.
    if (comparison.currencies.length === 2 && !rateFrom && !rateTo) {
      rateFrom = comparison.currencies[0]!;
      rateTo = comparison.currencies[1]!;
    }
  });

  function toggle(id: string, on: boolean) {
    selected = on ? [...selected, id].slice(-MAX) : selected.filter((s) => s !== id);
  }

  const dash = '—';
  const date = (ms: number | undefined) => (ms === undefined ? dash : prefs.date(ms));

  type Row = { label: string; cells: (string | undefined)[]; pre?: boolean };
  const rows = $derived.by((): Row[] => {
    const o = comparison.offers;
    const money = (i: number, key: 'perMonth' | 'perYear') => {
      const pay = o[i]!.pay;
      if (!pay) return dash;
      const own = formatMoney(pay[key], pay.currency);
      const conv = o[i]!.converted;
      return conv && conv.currency && conv.currency !== pay.currency
        ? `${own} (≈ ${formatMoney(conv[key], conv.currency)})`
        : own;
    };
    return [
      { label: 'Base per year', cells: o.map((_, i) => money(i, 'perYear')) },
      { label: 'Base per month', cells: o.map((_, i) => money(i, 'perMonth')) },
      { label: 'Currency', cells: o.map((c) => c.job.offer?.currency) },
      { label: 'Bonus', cells: o.map((c) => c.job.offer?.bonus) },
      { label: 'Equity', cells: o.map((c) => c.job.offer?.equity) },
      { label: 'Benefits', cells: o.map((c) => c.job.offer?.benefits?.join(', ')) },
      {
        label: 'Work type',
        cells: o.map((c) => (c.job.workType ? WORK_TYPE_LABELS[c.job.workType] : undefined)),
      },
      { label: 'Location', cells: o.map((c) => c.job.location) },
      { label: 'Start date', cells: o.map((c) => date(c.job.offer?.startDate)) },
      { label: 'Answer by', cells: o.map((c) => date(c.job.offer?.deadline)) },
      { label: 'Pros', cells: o.map((c) => c.job.offer?.pros), pre: true },
      { label: 'Cons', cells: o.map((c) => c.job.offer?.cons), pre: true },
      { label: 'Notes', cells: o.map((c) => c.job.notes), pre: true },
    ];
  });
</script>

<Modal title="Compare offers" description="Pick two or three to see side by side." wide {onclose}>
  {#if offers.length === 0}
    <p class="text-ink-muted text-sm">
      No offers yet. Move a job to “{prefs.status('offer')}” or add offer details in its panel.
    </p>
  {:else}
    <fieldset class="mb-4">
      <legend class={label}>Offers</legend>
      <div class="flex flex-wrap gap-2">
        {#each offers as job (job.id)}
          {@const on = selected.includes(job.id)}
          <label
            class="border-line has-[:checked]:border-accent has-[:checked]:bg-accent/5 flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
          >
            <input
              type="checkbox"
              checked={on}
              onchange={(e) => toggle(job.id, e.currentTarget.checked)}
              class="accent-[var(--color-accent)]"
            />
            <span class="max-w-48 truncate">{job.company}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    {#if mixed}
      <div class="bg-surface-muted mb-4 rounded-md p-3 text-sm">
        <p class="mb-2">
          These offers are in different currencies. Rates aren't looked up online: type one to
          compare, or read each in its own currency.
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <span>1</span>
          <select class="{fieldInline} w-24" bind:value={rateFrom} aria-label="Convert from">
            {#each comparison.currencies as c (c)}<option value={c}>{c}</option>{/each}
          </select>
          <span>=</span>
          <input
            class="{fieldInline} w-28 tabular-nums"
            inputmode="decimal"
            placeholder="rate"
            aria-label="Conversion rate"
            bind:value={rateText}
          />
          <select class="{fieldInline} w-24" bind:value={rateTo} aria-label="Convert to">
            {#each comparison.currencies as c (c)}<option value={c}>{c}</option>{/each}
          </select>
        </div>
        {#if comparison.currencies.length > 2}
          <p class="text-ink-muted mt-2 text-xs">With three currencies, compare two at a time.</p>
        {/if}
      </div>
    {/if}

    {#if chosen.length < 2}
      <p class="text-ink-muted text-sm">Pick at least two offers.</p>
    {:else}
      <div class="-mx-5 overflow-x-auto px-5">
        <table class="w-full min-w-[32rem] border-collapse text-sm">
          <thead>
            <tr>
              <th class="w-32"><span class="sr-only">Detail</span></th>
              {#each comparison.offers as offer, i (offer.job.id)}
                <th scope="col" class="px-2 pb-2 text-left align-bottom font-semibold">
                  <button
                    type="button"
                    class="focus-visible:ring-accent rounded text-left hover:underline focus-visible:ring-2 focus-visible:outline-none"
                    onclick={() => onopen(offer.job.id)}
                  >
                    {offer.job.company}
                  </button>
                  <span class="text-ink-muted block text-xs font-normal">{offer.job.title}</span>
                  {#if comparison.highest === i}
                    <span
                      class="bg-status-offer/15 text-status-offer mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium"
                    >
                      Highest base
                    </span>
                  {/if}
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each rows as row (row.label)}
              <tr class="border-line border-t">
                <th scope="row" class="text-ink-muted py-2 pr-2 text-left text-xs font-medium">
                  {row.label}
                </th>
                {#each row.cells as cell, i (i)}
                  <td
                    class="px-2 py-2 align-top {row.pre ? 'whitespace-pre-wrap' : ''} tabular-nums"
                  >
                    {cell || dash}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}

  {#snippet footer()}
    <button type="button" class={btn} onclick={onclose}>Done</button>
  {/snippet}
</Modal>
