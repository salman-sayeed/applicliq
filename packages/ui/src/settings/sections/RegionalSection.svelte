<script lang="ts">
  import { type DateFormat, type SalaryPeriod, checkSetting } from '@pocket-career/core';
  import { formatDate } from '../../dashboard/format';
  import { PERIOD_LABELS } from '../../status';
  import Field from '../Field.svelte';
  import { input } from '../styles';
  import type { SectionProps } from '../types';

  let { settings, save }: SectionProps = $props();

  const r = $derived(settings.regional);
  let currencyError = $state<string>();

  const COMMON = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'BDT', 'JPY', 'CHF', 'SGD'];
  const sample = new Date(new Date().getFullYear(), 11, 31, 9, 30).getTime();
  const formats: { value: DateFormat; label: string }[] = [
    { value: 'system', label: `Browser default (${formatDate(sample)})` },
    { value: 'dmy', label: `Day/month/year (${formatDate(sample, 'dmy')})` },
    { value: 'mdy', label: `Month/day/year (${formatDate(sample, 'mdy')})` },
    { value: 'ymd', label: `Year-month-day (${formatDate(sample, 'ymd')})` },
  ];

  function saveCurrency(value: string) {
    const clean = checkSetting('regional', 'currency', value.trim());
    if (clean === undefined) {
      currencyError = 'Use a 3-letter currency code like USD, or leave it empty.';
      return;
    }
    currencyError = undefined;
    void save({ regional: { currency: clean } });
  }
</script>

<Field
  label="Default currency"
  id="currency"
  hint="Used for salaries you enter without a currency."
  error={currencyError}
>
  <input
    id="currency"
    class="{input} w-24 uppercase"
    maxlength="3"
    placeholder="None"
    list="currency-codes"
    value={r.currency}
    onchange={(e) => saveCurrency(e.currentTarget.value)}
  />
  <datalist id="currency-codes">
    {#each COMMON as code (code)}<option value={code}></option>{/each}
  </datalist>
</Field>

<Field label="Default salary period" id="salary-period">
  <select
    id="salary-period"
    class={input}
    value={r.salaryPeriod}
    onchange={(e) => save({ regional: { salaryPeriod: e.currentTarget.value as SalaryPeriod } })}
  >
    {#each Object.entries(PERIOD_LABELS) as [value, label] (value)}
      <option {value}>{label[0]!.toUpperCase() + label.slice(1)}</option>
    {/each}
  </select>
</Field>

<Field label="Date format" id="date-format">
  <select
    id="date-format"
    class={input}
    value={r.dateFormat}
    onchange={(e) => save({ regional: { dateFormat: e.currentTarget.value as DateFormat } })}
  >
    {#each formats as f (f.value)}
      <option value={f.value}>{f.label}</option>
    {/each}
  </select>
</Field>
