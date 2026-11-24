<script lang="ts">
  import {
    type Job,
    type JobPatch,
    type Offer,
    type OfferPeriod,
    offerFromJob,
    offerPay,
    parseBenefits,
  } from '@applicliq/core';
  import { untrack } from 'svelte';
  import { getPrefs } from '../../prefs.svelte';
  import { formatMoney, fromDateInput, toDateInput } from '../format';

  /** "Offer details" in the job panel (Smart helpers → Offer comparison). */
  let {
    job,
    onupdate,
    oncompare,
  }: {
    job: Job;
    onupdate: (patch: JobPatch) => Promise<unknown>;
    /** Opens the comparison, when there are other offers to compare with. */
    oncompare?: () => void;
  } = $props();

  type Draft = {
    base: string;
    currency: string;
    period: OfferPeriod;
    bonus: string;
    equity: string;
    benefits: string;
    startDate: string;
    deadline: string;
    pros: string;
    cons: string;
  };

  const prefs = getPrefs();

  function toDraft(offer: Offer): Draft {
    return {
      base: offer.base?.toString() ?? '',
      currency: offer.currency ?? '',
      period: offer.period ?? 'year',
      bonus: offer.bonus ?? '',
      equity: offer.equity ?? '',
      benefits: offer.benefits?.join(', ') ?? '',
      startDate: toDateInput(offer.startDate),
      deadline: toDateInput(offer.deadline),
      pros: offer.pros ?? '',
      cons: offer.cons ?? '',
    };
  }

  // svelte-ignore state_referenced_locally
  let draft = $state(toDraft(job.offer ?? {}));
  // svelte-ignore state_referenced_locally
  let synced = JSON.stringify(job.offer ?? null);
  $effect(() => {
    const next = JSON.stringify(job.offer ?? null);
    untrack(() => {
      if (next !== synced) {
        synced = next;
        draft = toDraft(job.offer ?? {});
      }
    });
  });

  // svelte-ignore state_referenced_locally
  let open = $state(job.status === 'offer' || job.offer !== undefined);

  function fromDraft(): Offer | undefined {
    const offer: Offer = {};
    const base = Number(draft.base.replace(/[,\s]/g, ''));
    if (draft.base.trim() && Number.isFinite(base) && base >= 0) offer.base = base;
    const currency = draft.currency.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(currency)) offer.currency = currency;
    else if (offer.base !== undefined && prefs.settings.regional.currency) {
      offer.currency = draft.currency = prefs.settings.regional.currency;
    }
    if (offer.base !== undefined) offer.period = draft.period;
    for (const key of ['bonus', 'equity', 'pros', 'cons'] as const) {
      if (draft[key].trim()) offer[key] = draft[key].trim();
    }
    const benefits = parseBenefits(draft.benefits);
    if (benefits.length) offer.benefits = benefits;
    const start = fromDateInput(draft.startDate);
    if (start !== undefined) offer.startDate = start;
    const deadline = fromDateInput(draft.deadline);
    if (deadline !== undefined) offer.deadline = deadline;
    return Object.keys(offer).length ? offer : undefined;
  }

  function commit() {
    const offer = fromDraft();
    if (JSON.stringify(offer ?? null) === JSON.stringify(job.offer ?? null)) return;
    void onupdate({ offer });
  }

  function start() {
    open = true;
    // Start from the posted salary, if any.
    draft = toDraft(offerFromJob(job));
  }

  const pay = $derived(offerPay(job.offer));

  const input =
    'border-line bg-surface text-ink placeholder:text-ink-muted/60 focus:border-accent focus:ring-accent/25 w-full rounded-md border px-2.5 py-1.5 text-sm transition focus:ring-2 focus:outline-none';
  const labelClass = 'text-ink-muted mb-1 block text-xs font-medium';
  const sectionTitle = 'text-ink-muted text-xs font-semibold tracking-wide uppercase';
</script>

<section class="space-y-3" aria-labelledby="offer-heading">
  <div class="flex items-center justify-between gap-2">
    <h3 id="offer-heading" class={sectionTitle}>Offer details</h3>
    {#if open && oncompare}
      <button
        type="button"
        onclick={oncompare}
        class="text-accent focus-visible:ring-accent rounded text-xs font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
      >
        Compare offers
      </button>
    {/if}
  </div>

  {#if !open}
    <button
      type="button"
      onclick={start}
      class="border-line hover:bg-surface-muted focus-visible:ring-accent rounded-md border px-3 py-1.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none"
    >
      Add offer details
    </button>
  {:else}
    <div class="grid grid-cols-[1fr_4.5rem_6.5rem] gap-2">
      <div>
        <label class={labelClass} for="o-base">Base pay</label>
        <input
          id="o-base"
          class={input}
          inputmode="numeric"
          bind:value={draft.base}
          onchange={commit}
          placeholder="e.g. 85000"
        />
      </div>
      <div>
        <label class={labelClass} for="o-currency">Currency</label>
        <input
          id="o-currency"
          class="{input} uppercase"
          maxlength="3"
          bind:value={draft.currency}
          onchange={commit}
          placeholder={prefs.settings.regional.currency || 'USD'}
        />
      </div>
      <div>
        <label class={labelClass} for="o-period">Per</label>
        <select id="o-period" class={input} bind:value={draft.period} onchange={commit}>
          <option value="year">Year</option>
          <option value="month">Month</option>
        </select>
      </div>
    </div>
    {#if pay}
      <p class="text-ink-muted -mt-1 text-xs tabular-nums">
        {formatMoney(pay.perMonth, pay.currency)} a month ·
        {formatMoney(pay.perYear, pay.currency)} a year
      </p>
    {/if}
    <div class="grid grid-cols-2 gap-2">
      <div>
        <label class={labelClass} for="o-bonus">Bonus</label>
        <input
          id="o-bonus"
          class={input}
          bind:value={draft.bonus}
          onchange={commit}
          placeholder="e.g. 10% yearly"
        />
      </div>
      <div>
        <label class={labelClass} for="o-equity">Equity</label>
        <input
          id="o-equity"
          class={input}
          bind:value={draft.equity}
          onchange={commit}
          placeholder="e.g. 0.1% over 4 years"
        />
      </div>
    </div>
    <div>
      <label class={labelClass} for="o-benefits">Benefits</label>
      <input
        id="o-benefits"
        class={input}
        bind:value={draft.benefits}
        onchange={commit}
        placeholder="Comma-separated, e.g. health, 30 days off"
      />
    </div>
    <div class="grid grid-cols-2 gap-2">
      <div>
        <label class={labelClass} for="o-start">Start date</label>
        <input
          id="o-start"
          type="date"
          class={input}
          bind:value={draft.startDate}
          onchange={commit}
        />
      </div>
      <div>
        <label class={labelClass} for="o-deadline">Answer by</label>
        <input
          id="o-deadline"
          type="date"
          class={input}
          bind:value={draft.deadline}
          onchange={commit}
        />
      </div>
    </div>
    {#if job.offer?.deadline !== undefined}
      <p class="text-ink-muted -mt-1 text-xs">
        You'll get a reminder the day before, if follow-up reminders are on.
      </p>
    {/if}
    <div class="grid grid-cols-2 gap-2">
      <div>
        <label class={labelClass} for="o-pros">Pros</label>
        <textarea
          id="o-pros"
          rows="3"
          class="{input} resize-y"
          bind:value={draft.pros}
          onchange={commit}></textarea>
      </div>
      <div>
        <label class={labelClass} for="o-cons">Cons</label>
        <textarea
          id="o-cons"
          rows="3"
          class="{input} resize-y"
          bind:value={draft.cons}
          onchange={commit}></textarea>
      </div>
    </div>
  {/if}
</section>
