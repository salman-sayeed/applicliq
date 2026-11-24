<script lang="ts">
  import {
    type CsvTable,
    type ImportDraft,
    type ImportOptions,
    type ImportRow,
    type Job,
    LINKEDIN_EXPORT_URL,
    importBatches,
    linkedInImportOptions,
    readLinkedInExport,
    reviewImport,
  } from '@applicliq/core';
  import type { DashboardAdapter } from '../dashboard/adapter';
  import { getPrefs } from '../prefs.svelte';
  import { button, link, primary } from '../settings/styles';
  import CsvSetup from './CsvSetup.svelte';
  import DropZone from './DropZone.svelte';
  import ImportReview from './ImportReview.svelte';

  let {
    adapter,
    jobs,
    notify,
  }: {
    adapter: DashboardAdapter;
    /** Live jobs, to find duplicates and list past imports. */
    jobs: Job[];
    notify: (message: string, tone?: 'info' | 'error') => void;
  } = $props();

  const prefs = getPrefs();

  type Step =
    | { kind: 'choose' }
    | { kind: 'linkedin'; problem?: string }
    | { kind: 'csv'; text?: string; fileName?: string }
    | { kind: 'checking'; total: number }
    | { kind: 'review'; rows: ImportRow[]; back: 'linkedin' | 'csv' }
    | { kind: 'done'; batchId: string; count: number; undone?: number };

  let step = $state.raw<Step>({ kind: 'choose' });
  let busy = $state(false);
  let lastCsv: { text: string; fileName: string } | undefined;

  const batches = $derived(importBatches(jobs));

  async function review(table: CsvTable, options: ImportOptions, back: 'linkedin' | 'csv') {
    step = { kind: 'checking', total: table.rows.length };
    try {
      const rows = await reviewImport(table, options, $state.snapshot(jobs) as Job[]);
      step = { kind: 'review', rows, back };
    } catch (error) {
      notify(`Could not read the file: ${String(error)}`, 'error');
      step = back === 'csv' ? { kind: 'csv', ...lastCsv } : { kind: 'linkedin' };
    }
  }

  async function readLinkedIn(file: File) {
    busy = true;
    try {
      const table = await readLinkedInExport(new Uint8Array(await file.arrayBuffer()));
      if (!table) {
        step = { kind: 'linkedin', problem: 'missing' };
        return;
      }
      if (table.rows.length === 0) {
        step = { kind: 'linkedin', problem: 'empty' };
        return;
      }
      await review(table, linkedInImportOptions(table), 'linkedin');
    } catch {
      step = { kind: 'linkedin', problem: 'unreadable' };
    } finally {
      busy = false;
    }
  }

  async function readCsv(file: File) {
    busy = true;
    try {
      lastCsv = { text: await file.text(), fileName: file.name };
      step = { kind: 'csv', ...lastCsv };
    } catch {
      notify('Could not read that file.', 'error');
    } finally {
      busy = false;
    }
  }

  async function runImport(drafts: ImportDraft[]) {
    busy = true;
    try {
      const { batchId, count } = await adapter.importJobs(drafts);
      step = { kind: 'done', batchId, count };
    } catch (error) {
      notify(`Import failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      busy = false;
    }
  }

  async function undo(batchId: string, count: number, ask: boolean) {
    const jobsWord = count === 1 ? 'job' : 'jobs';
    if (ask && !confirm(`Delete the ${count} ${jobsWord} this import added?`)) return;
    busy = true;
    try {
      const removed = await adapter.undoImport(batchId);
      if (step.kind === 'done' && step.batchId === batchId) step = { ...step, undone: removed };
      notify(`Removed ${removed} imported ${removed === 1 ? 'job' : 'jobs'}`);
    } catch (error) {
      notify(`Could not undo: ${String(error)}`, 'error');
    } finally {
      busy = false;
    }
  }

  const plural = (n: number) => `${n} ${n === 1 ? 'job' : 'jobs'}`;
  const SOURCE_NAMES: Record<string, string> = { linkedin: 'LinkedIn' };
</script>

{#if step.kind === 'choose'}
  <div class="grid gap-3 py-4 sm:grid-cols-2">
    <button
      type="button"
      onclick={() => (step = { kind: 'linkedin' })}
      class="border-line hover:bg-surface-muted/60 focus-visible:ring-accent rounded-lg border p-4 text-left transition focus-visible:ring-2 focus-visible:outline-none"
    >
      <span class="block text-sm font-medium">From LinkedIn</span>
      <span class="text-ink-muted mt-1 block text-xs leading-relaxed">
        The jobs you applied to on LinkedIn, from your LinkedIn data export.
      </span>
    </button>
    <button
      type="button"
      onclick={() => (step = { kind: 'csv' })}
      class="border-line hover:bg-surface-muted/60 focus-visible:ring-accent rounded-lg border p-4 text-left transition focus-visible:ring-2 focus-visible:outline-none"
    >
      <span class="block text-sm font-medium">From a spreadsheet (CSV)</span>
      <span class="text-ink-muted mt-1 block text-xs leading-relaxed">
        Excel, Google Sheets, Notion, Huntr, Teal or any tracker that exports CSV.
      </span>
    </button>
  </div>
  <p class="text-ink-muted text-xs">
    Files are read in this browser; nothing is uploaded anywhere. Imported applications count in
    your stats but not toward past goals or streaks.
  </p>

  <section class="border-line mt-5 border-t pt-4" aria-labelledby="import-history">
    <h3 id="import-history" class="text-sm font-medium">Past imports</h3>
    {#if batches.length === 0}
      <p class="text-ink-muted mt-1 text-xs">None yet.</p>
    {:else}
      <ul class="divide-line mt-2 divide-y text-sm">
        {#each batches as batch (batch.id)}
          <li class="flex items-center justify-between gap-3 py-2">
            <span>
              {prefs.dateTime(batch.importedAt)}
              <span class="text-ink-muted">
                · {plural(batch.count)}{batch.source
                  ? ` · ${SOURCE_NAMES[batch.source] ?? batch.source}`
                  : ''}
              </span>
            </span>
            <button
              type="button"
              class="{button} text-xs"
              disabled={busy}
              onclick={() => undo(batch.id, batch.count, true)}
            >
              Undo
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{:else if step.kind === 'linkedin'}
  <div class="space-y-4 py-4">
    <ol class="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
      <li>
        Open LinkedIn's
        <a href={LINKEDIN_EXPORT_URL} target="_blank" rel="noreferrer" class={link}>
          Get a copy of your data
        </a> page (signed in).
      </li>
      <li>
        Pick the data you want, with <strong>Job applications</strong> ticked, or the larger
        archive. Then click <strong>Request archive</strong>.
      </li>
      <li>LinkedIn emails you when it's ready (often minutes, up to a day). Download the .zip.</li>
      <li>Drop the .zip here, or the Job Applications CSV from inside it.</li>
    </ol>

    <DropZone
      accept=".zip,.csv,application/zip,text/csv"
      label="Drop your LinkedIn export here, or click to choose it"
      hint=".zip or .csv"
      {busy}
      onfile={readLinkedIn}
    />

    {#if step.problem}
      <div role="alert" class="bg-surface-muted rounded-md px-3 py-2 text-sm">
        {#if step.problem === 'missing'}
          <p>
            No job applications in this file. LinkedIn only includes them when the export has your
            job activity and you applied on LinkedIn. Request the export again with Job applications
            ticked, or import your own spreadsheet instead.
          </p>
        {:else if step.problem === 'empty'}
          <p>The job applications file is empty: LinkedIn has no applications on record.</p>
        {:else}
          <p>This file couldn't be read. Is it the .zip LinkedIn sent, or a CSV from it?</p>
        {/if}
        <button type="button" class="{link} mt-1 text-sm" onclick={() => (step = { kind: 'csv' })}>
          Import a CSV instead
        </button>
      </div>
    {/if}

    <button type="button" class={button} onclick={() => (step = { kind: 'choose' })}>Back</button>
  </div>
{:else if step.kind === 'csv'}
  {#if step.text !== undefined}
    {#key step.text}
      <CsvSetup
        text={step.text}
        fileName={step.fileName ?? 'File'}
        oncontinue={(table, options) => review(table, options, 'csv')}
        oncancel={() => (step = { kind: 'csv' })}
      />
    {/key}
  {:else}
    <div class="space-y-4 py-4">
      <p class="text-ink-muted text-sm">
        Export your tracker or sheet as CSV (in Excel: Save As → CSV; in Google Sheets: File →
        Download → CSV; in Notion: ••• → Export → Markdown & CSV). You'll match its columns next.
      </p>
      <DropZone
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
        label="Drop a CSV file here, or click to choose it"
        hint=".csv or .tsv"
        {busy}
        onfile={readCsv}
      />
      <button type="button" class={button} onclick={() => (step = { kind: 'choose' })}>
        Back
      </button>
    </div>
  {/if}
{:else if step.kind === 'checking'}
  <p class="text-ink-muted py-8 text-center text-sm" aria-busy="true">
    Checking {step.total} rows for duplicates…
  </p>
{:else if step.kind === 'review'}
  {@const back = step.back}
  <ImportReview
    rows={step.rows}
    {busy}
    onimport={runImport}
    oncancel={() =>
      (step = back === 'csv' && lastCsv ? { kind: 'csv', ...lastCsv } : { kind: back })}
  />
{:else}
  <div class="py-6">
    {#if step.undone === undefined}
      <p class="text-sm" role="status">
        <span class="font-medium">Imported {plural(step.count)}</span>
        <span class="text-ink-muted">·</span>
        <button
          type="button"
          class="{link} text-sm"
          disabled={busy}
          onclick={() => step.kind === 'done' && undo(step.batchId, step.count, false)}
        >
          Undo
        </button>
      </p>
      <p class="text-ink-muted mt-1 text-xs">
        They're on your dashboard now. You can also undo this later from Past imports here.
      </p>
    {:else}
      <p class="text-sm" role="status">Import undone: {plural(step.undone)} removed.</p>
    {/if}
    <button type="button" class="{primary} mt-4" onclick={() => (step = { kind: 'choose' })}>
      Done
    </button>
  </div>
{/if}
