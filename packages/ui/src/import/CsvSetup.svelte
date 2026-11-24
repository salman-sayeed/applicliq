<script lang="ts">
  import {
    CSV_DELIMITERS,
    type ColumnMapping,
    type CsvDelimiter,
    type CsvTable,
    type DateOrder,
    IMPORT_FIELDS,
    IMPORT_FIELD_LABELS,
    type ImportField,
    type ImportOptions,
    JOB_STATUSES,
    type JobStatus,
    detectDateOrder,
    guessMapping,
    guessStatus,
    hasAmbiguousDates,
    readCsvTable,
    statusValues,
  } from '@applicliq/core';
  import { getPrefs } from '../prefs.svelte';
  import { button, input, primary } from '../settings/styles';

  let {
    text,
    fileName,
    oncontinue,
    oncancel,
  }: {
    /** The CSV file's text. */
    text: string;
    fileName: string;
    oncontinue: (table: CsvTable, options: ImportOptions) => void;
    oncancel: () => void;
  } = $props();

  const prefs = getPrefs();

  const DELIMITER_LABELS: Record<CsvDelimiter, string> = {
    ',': 'Comma',
    ';': 'Semicolon',
    '\t': 'Tab',
    '|': 'Pipe',
  };

  // Detected on load; the user may override both.
  // svelte-ignore state_referenced_locally
  const detected = readCsvTable(text);
  let delimiter = $state<CsvDelimiter>(detected.delimiter);
  let headerRow = $state(detected.headerLine - 1);
  const table = $derived(
    delimiter === detected.delimiter && headerRow === detected.headerLine - 1
      ? detected
      : readCsvTable(text, { delimiter, headerRow }),
  );

  // Guesses, which the user can change; a new table (other separator or header row) or status
  // column guesses again.
  let mapping = $derived<ColumnMapping>(guessMapping(table.headers));
  let extraToNotes = $state(false);
  let dateOrder = $state<DateOrder>(defaultDateOrder());

  const labels = $derived(prefs.settings.labels.statusLabels);
  const values = $derived(statusValues(table, mapping.status).slice(0, 50));
  const unknown = $derived(
    new Set(values.filter((v) => !guessStatus(v.value, labels)).map((v) => v.key)),
  );
  let statusMap = $derived<Record<string, JobStatus>>(
    Object.fromEntries(values.map((v) => [v.key, guessStatus(v.value, labels) ?? 'applied'])),
  );

  const dates = $derived(
    mapping.appliedAt === undefined ? [] : table.rows.map((r) => r[mapping.appliedAt!] ?? ''),
  );
  const ambiguousDates = $derived(hasAmbiguousDates(dates));

  function defaultDateOrder(): DateOrder {
    const format = prefs.settings.regional.dateFormat;
    if (format === 'dmy' || format === 'mdy') return format;
    return /^en-(US|PH)|^es-US/.test(navigator.language) ? 'mdy' : 'dmy';
  }

  const used = $derived(new Set(Object.values(mapping)));
  const canContinue = $derived(mapping.title !== undefined || mapping.company !== undefined);

  function setField(field: ImportField, value: string) {
    const next = { ...mapping };
    if (value === '') delete next[field];
    else next[field] = Number(value);
    mapping = next;
  }

  function submit() {
    const noteColumns = extraToNotes
      ? table.headers.map((_, i) => i).filter((i) => !used.has(i))
      : [];
    oncontinue(table, {
      mapping: $state.snapshot(mapping),
      statusMap: $state.snapshot(statusMap),
      dateOrder: detectDateOrder(dates) ?? dateOrder,
      noteColumns,
      statusLabels: labels,
    });
  }

  const preview = $derived(table.rows.slice(0, 5));
</script>

<div class="space-y-5 py-4">
  <div class="flex flex-wrap items-end gap-3 text-sm">
    <p class="min-w-0 flex-1">
      <span class="font-medium">{fileName}</span>
      <span class="text-ink-muted">· {table.rows.length} rows</span>
    </p>
    <label class="flex items-center gap-2 text-xs">
      Separator
      <select class={input} bind:value={delimiter}>
        {#each CSV_DELIMITERS as d (d)}<option value={d}>{DELIMITER_LABELS[d]}</option>{/each}
      </select>
    </label>
    <label class="flex items-center gap-2 text-xs">
      Header row
      <select
        class={input}
        value={String(headerRow)}
        onchange={(e) => (headerRow = Number(e.currentTarget.value))}
      >
        {#each Array.from({ length: 10 }, (_, i) => i) as i (i)}
          <option value={String(i)}>{i + 1}</option>
        {/each}
      </select>
    </label>
  </div>

  <div class="border-line overflow-x-auto rounded-md border">
    <table class="w-full text-left text-xs">
      <caption class="sr-only">First rows of the file</caption>
      <thead class="bg-surface-muted">
        <tr>
          {#each table.headers as header, i (i)}
            <th scope="col" class="px-2 py-1.5 font-medium whitespace-nowrap">{header}</th>
          {/each}
        </tr>
      </thead>
      <tbody class="divide-line divide-y">
        {#each preview as row, r (r)}
          <tr>
            {#each row as cell, c (c)}
              <td class="max-w-48 truncate px-2 py-1.5" title={cell}>{cell}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <section aria-labelledby="mapping-heading">
    <h3 id="mapping-heading" class="text-sm font-medium">Match the columns</h3>
    <p class="text-ink-muted mt-0.5 text-xs">
      We guessed from the column names. A job needs at least a title or a company.
    </p>
    <div class="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {#each IMPORT_FIELDS as field (field)}
        <label class="flex items-center justify-between gap-3 text-sm">
          <span>{IMPORT_FIELD_LABELS[field]}</span>
          <select
            class="{input} w-44"
            value={mapping[field] === undefined ? '' : String(mapping[field])}
            onchange={(e) => setField(field, e.currentTarget.value)}
          >
            <option value="">Not imported</option>
            {#each table.headers as header, i (i)}
              <option value={String(i)}>{header}</option>
            {/each}
          </select>
        </label>
      {/each}
    </div>
    <label class="mt-3 flex items-center gap-2 text-sm">
      <input type="checkbox" class="accent-accent" bind:checked={extraToNotes} />
      Add the other columns to the notes
    </label>
  </section>

  {#if values.length}
    <section aria-labelledby="status-heading">
      <h3 id="status-heading" class="text-sm font-medium">Statuses</h3>
      <p class="text-ink-muted mt-0.5 text-xs">
        What each value in “{table.headers[mapping.status!]}” means here.
        {#if unknown.size}Values we didn't recognise are marked.{/if}
      </p>
      <div class="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {#each values as v (v.key)}
          <label class="flex items-center justify-between gap-3 text-sm">
            <span class="min-w-0 truncate">
              {v.value}
              <span class="text-ink-muted text-xs">×{v.count}</span>
              {#if unknown.has(v.key)}
                <span class="text-status-interview text-xs font-medium">· not recognised</span>
              {/if}
            </span>
            <select
              class="{input} w-36"
              value={statusMap[v.key]}
              onchange={(e) =>
                (statusMap = { ...statusMap, [v.key]: e.currentTarget.value as JobStatus })}
            >
              {#each JOB_STATUSES as s (s)}<option value={s}>{prefs.status(s)}</option>{/each}
            </select>
          </label>
        {/each}
      </div>
    </section>
  {/if}

  {#if ambiguousDates}
    <label class="flex flex-wrap items-center gap-2 text-sm">
      Dates like 03/04/2024 mean
      <select class={input} bind:value={dateOrder}>
        <option value="dmy">3 April (day first)</option>
        <option value="mdy">March 4 (month first)</option>
      </select>
    </label>
  {/if}

  <div class="flex gap-2">
    <button type="button" class={primary} disabled={!canContinue} onclick={submit}>
      Review {table.rows.length} rows
    </button>
    <button type="button" class={button} onclick={oncancel}>Cancel</button>
  </div>
</div>
