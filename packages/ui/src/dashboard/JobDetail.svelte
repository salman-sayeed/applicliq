<script lang="ts">
  import {
    JOB_STATUSES,
    type Job,
    type JobPatch,
    type JobStatus,
    type Salary,
    type SalaryPeriod,
    type WorkType,
    interviewIcs,
    interviewIcsFileName,
  } from '@pocket-career/core';
  import { onMount, untrack } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { PERIOD_LABELS, STATUS_LABELS, WORK_TYPE_LABELS } from '../status';
  import {
    downloadFile,
    formatDateTime,
    fromDateInput,
    fromDateTimeInput,
    toDateInput,
    toDateTimeInput,
  } from './format';
  import TagInput from './TagInput.svelte';
  import Timeline from './Timeline.svelte';

  let {
    job,
    facets,
    onupdate,
    ondelete,
    onclose,
  }: {
    job: Job;
    facets: { tags: string[]; resumeVersions: string[] };
    onupdate: (patch: JobPatch) => Promise<unknown>;
    ondelete: () => void;
    onclose: () => void;
  } = $props();

  type Draft = {
    status: JobStatus;
    title: string;
    company: string;
    url: string;
    location: string;
    workType: WorkType | '';
    source: string;
    salaryMin: string;
    salaryMax: string;
    currency: string;
    period: SalaryPeriod | '';
    tags: string[];
    resumeVersion: string;
    contactName: string;
    contactEmail: string;
    interviewAt: string;
    followUpAt: string;
    notes: string;
  };

  function toDraft(j: Job): Draft {
    return {
      status: j.status,
      title: j.title,
      company: j.company,
      url: j.url,
      location: j.location ?? '',
      workType: j.workType ?? '',
      source: j.source ?? '',
      salaryMin: j.salary?.min?.toString() ?? '',
      salaryMax: j.salary?.max?.toString() ?? '',
      currency: j.salary?.currency ?? '',
      period: j.salary?.period ?? '',
      tags: [...(j.tags ?? [])],
      resumeVersion: j.resumeVersion ?? '',
      contactName: j.contact?.name ?? '',
      contactEmail: j.contact?.email ?? '',
      interviewAt: toDateTimeInput(j.interviewAt),
      followUpAt: toDateInput(j.followUpAt),
      notes: j.notes ?? '',
    };
  }

  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  // svelte-ignore state_referenced_locally
  let draft = $state(toDraft(job));
  // svelte-ignore state_referenced_locally
  let synced = toDraft(job);

  // When the job changes (a save here, or an edit elsewhere), refresh only the fields that
  // changed, so a field being typed in is never overwritten.
  $effect(() => {
    const next = toDraft(job);
    untrack(() => {
      for (const key of Object.keys(next) as (keyof Draft)[]) {
        if (!same(next[key], synced[key])) (draft as Record<keyof Draft, unknown>)[key] = next[key];
      }
      synced = next;
    });
  });

  let saved = $state(false);
  let error = $state<string>();
  let savedTimer: ReturnType<typeof setTimeout> | undefined;

  async function commit(patch: JobPatch) {
    error = undefined;
    try {
      await onupdate(patch);
      saved = true;
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => (saved = false), 1200);
    } catch {
      // The dashboard reports the failure; put the field back.
      draft = toDraft(job);
    }
  }

  function commitRequired(field: 'title' | 'company' | 'url', label: string) {
    const value = draft[field].trim();
    if (!value) {
      draft[field] = job[field];
      error = `${label} can't be empty.`;
      return;
    }
    if (value !== job[field]) void commit({ [field]: value });
  }

  function commitOptional(field: 'location' | 'source' | 'resumeVersion' | 'notes') {
    const value = draft[field].trim();
    if (value !== (job[field] ?? '')) void commit({ [field]: value || undefined });
  }

  const toNumber = (value: string) => {
    const n = Number(value.replace(/[,\s]/g, ''));
    return value.trim() && Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  function commitSalary() {
    const min = toNumber(draft.salaryMin);
    const max = toNumber(draft.salaryMax);
    let salary: Salary | undefined;
    if (min !== undefined || max !== undefined) {
      salary = { min: min ?? max, max: max ?? min };
      const currency = draft.currency.trim().toUpperCase();
      if (currency) salary.currency = currency;
      if (draft.period) salary.period = draft.period;
    }
    if (!same(salary, job.salary)) void commit({ salary });
  }

  function commitContact() {
    const name = draft.contactName.trim();
    const email = draft.contactEmail.trim();
    const contact = name || email ? { ...(name && { name }), ...(email && { email }) } : undefined;
    if (!same(contact, job.contact)) void commit({ contact });
  }

  function commitDate(field: 'interviewAt' | 'followUpAt') {
    const value =
      field === 'interviewAt'
        ? fromDateTimeInput(draft.interviewAt)
        : fromDateInput(draft.followUpAt);
    if (value !== job[field]) void commit({ [field]: value });
  }

  function downloadIcs() {
    const ics = interviewIcs(job);
    if (ics) downloadFile(interviewIcsFileName(job), ics, 'text/calendar;charset=utf-8');
  }

  let panel = $state<HTMLElement>();
  onMount(() => panel?.focus());

  const inputClass =
    'border-line bg-surface text-ink placeholder:text-ink-muted/60 focus:border-accent focus:ring-accent/25 w-full rounded-md border px-2.5 py-1.5 text-sm transition focus:ring-2 focus:outline-none';
  const labelClass = 'text-ink-muted mb-1 block text-xs font-medium';
  const sectionTitle = 'text-ink-muted mb-2 text-xs font-semibold tracking-wide uppercase';
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape' && !e.defaultPrevented) onclose();
  }}
/>

<aside
  bind:this={panel}
  tabindex="-1"
  aria-labelledby="job-detail-title"
  transition:fly={{ x: 32, duration: 150 }}
  class="bg-surface border-line fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l shadow-2xl outline-none"
>
  <header class="border-line flex items-start gap-3 border-b px-5 py-4">
    <div class="min-w-0 flex-1">
      <h2 id="job-detail-title" class="truncate text-base font-semibold" title={job.title}>
        {job.title}
      </h2>
      <p class="text-ink-muted truncate text-sm">
        {job.company}
        {#if /^https?:\/\//.test(job.url)}
          · <a href={job.url} target="_blank" rel="noreferrer" class="text-accent hover:underline">
            Open posting ↗
          </a>
        {/if}
      </p>
    </div>
    {#if saved}
      <span transition:fade={{ duration: 120 }} class="text-status-offer mt-1 text-xs">Saved</span>
    {/if}
    <button
      type="button"
      onclick={onclose}
      aria-label="Close details"
      class="text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:ring-accent -mt-1 -mr-2 rounded-md p-1.5 text-lg leading-none transition focus-visible:ring-2 focus-visible:outline-none"
    >
      ×
    </button>
  </header>

  <div class="flex-1 space-y-6 overflow-y-auto px-5 py-4">
    {#if error}
      <p role="alert" class="text-status-rejected text-sm">{error}</p>
    {/if}

    <section>
      <label class={labelClass} for="d-status">Status</label>
      <select
        id="d-status"
        class={inputClass}
        bind:value={draft.status}
        onchange={() => commit({ status: draft.status })}
      >
        {#each JOB_STATUSES as status (status)}
          <option value={status}>{STATUS_LABELS[status]}</option>
        {/each}
      </select>
    </section>

    <section class="space-y-3">
      <h3 class={sectionTitle}>Job</h3>
      <div>
        <label class={labelClass} for="d-title">Title</label>
        <input
          id="d-title"
          class={inputClass}
          bind:value={draft.title}
          onchange={() => commitRequired('title', 'Title')}
        />
      </div>
      <div>
        <label class={labelClass} for="d-company">Company</label>
        <input
          id="d-company"
          class={inputClass}
          bind:value={draft.company}
          onchange={() => commitRequired('company', 'Company')}
        />
      </div>
      <div>
        <label class={labelClass} for="d-url">Posting URL</label>
        <input
          id="d-url"
          type="url"
          class={inputClass}
          bind:value={draft.url}
          onchange={() => commitRequired('url', 'URL')}
        />
      </div>
      <div class="grid grid-cols-[1fr_8rem] gap-2">
        <div>
          <label class={labelClass} for="d-location">Location</label>
          <input
            id="d-location"
            class={inputClass}
            bind:value={draft.location}
            onchange={() => commitOptional('location')}
          />
        </div>
        <div>
          <label class={labelClass} for="d-worktype">Work type</label>
          <select
            id="d-worktype"
            class={inputClass}
            bind:value={draft.workType}
            onchange={() => commit({ workType: draft.workType || undefined })}
          >
            <option value="">—</option>
            {#each Object.entries(WORK_TYPE_LABELS) as [value, label] (value)}
              <option {value}>{label}</option>
            {/each}
          </select>
        </div>
      </div>
      <div>
        <label class={labelClass} for="d-source">Source</label>
        <input
          id="d-source"
          class={inputClass}
          bind:value={draft.source}
          onchange={() => commitOptional('source')}
          placeholder="e.g. linkedin, referral"
        />
      </div>
    </section>

    <fieldset>
      <legend class={sectionTitle}>Salary</legend>
      <div class="grid grid-cols-[1fr_1fr_4.5rem] gap-2">
        <input
          class={inputClass}
          bind:value={draft.salaryMin}
          onchange={commitSalary}
          inputmode="numeric"
          placeholder="Min"
          aria-label="Minimum salary"
        />
        <input
          class={inputClass}
          bind:value={draft.salaryMax}
          onchange={commitSalary}
          inputmode="numeric"
          placeholder="Max"
          aria-label="Maximum salary"
        />
        <input
          class="{inputClass} uppercase"
          bind:value={draft.currency}
          onchange={commitSalary}
          maxlength="3"
          placeholder="USD"
          aria-label="Currency"
        />
      </div>
      <select
        class="{inputClass} mt-2"
        bind:value={draft.period}
        onchange={commitSalary}
        aria-label="Salary period"
      >
        <option value="">Period —</option>
        {#each Object.entries(PERIOD_LABELS) as [value, label] (value)}
          <option {value}>{label}</option>
        {/each}
      </select>
    </fieldset>

    <section class="space-y-3">
      <h3 class={sectionTitle}>Application</h3>
      <div>
        <label class={labelClass} for="d-tags">Tags</label>
        <TagInput
          id="d-tags"
          tags={draft.tags}
          suggestions={facets.tags}
          onchange={(tags) => {
            draft.tags = tags;
            void commit({ tags: tags.length ? tags : undefined });
          }}
        />
      </div>
      <div>
        <label class={labelClass} for="d-resume">Resume version</label>
        <input
          id="d-resume"
          class={inputClass}
          bind:value={draft.resumeVersion}
          onchange={() => commitOptional('resumeVersion')}
          list="d-resume-versions"
          placeholder="e.g. frontend-v3"
        />
        <datalist id="d-resume-versions">
          {#each facets.resumeVersions as version (version)}
            <option value={version}></option>
          {/each}
        </datalist>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class={labelClass} for="d-contact-name">Contact name</label>
          <input
            id="d-contact-name"
            class={inputClass}
            bind:value={draft.contactName}
            onchange={commitContact}
            autocomplete="off"
          />
        </div>
        <div>
          <label class={labelClass} for="d-contact-email">Contact email</label>
          <input
            id="d-contact-email"
            type="email"
            class={inputClass}
            bind:value={draft.contactEmail}
            onchange={commitContact}
            autocomplete="off"
          />
        </div>
      </div>
    </section>

    <section class="space-y-3">
      <h3 class={sectionTitle}>Dates</h3>
      <div>
        <label class={labelClass} for="d-interview">Interview</label>
        <div class="flex gap-2">
          <input
            id="d-interview"
            type="datetime-local"
            class={inputClass}
            bind:value={draft.interviewAt}
            onchange={() => commitDate('interviewAt')}
          />
          <button
            type="button"
            onclick={downloadIcs}
            disabled={job.interviewAt === undefined}
            title="Download a calendar file for this interview"
            class="border-line hover:bg-surface-muted focus-visible:ring-accent shrink-0 rounded-md border px-2.5 text-sm font-medium whitespace-nowrap transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
          >
            .ics ↓
          </button>
        </div>
      </div>
      <div>
        <label class={labelClass} for="d-followup">Follow up on</label>
        <input
          id="d-followup"
          type="date"
          class={inputClass}
          bind:value={draft.followUpAt}
          onchange={() => commitDate('followUpAt')}
        />
      </div>
    </section>

    <section>
      <label class={sectionTitle + ' block'} for="d-notes">Notes</label>
      <textarea
        id="d-notes"
        rows="5"
        class="{inputClass} resize-y"
        bind:value={draft.notes}
        onchange={() => commitOptional('notes')}></textarea>
    </section>

    <section>
      <h3 class={sectionTitle}>Timeline</h3>
      <Timeline history={job.history} />
    </section>

    <section>
      <h3 class={sectionTitle}>Saved description</h3>
      {#if job.descriptionSnapshot}
        <details class="group">
          <summary class="text-accent cursor-pointer text-sm font-medium select-none">
            Show the posting as saved
          </summary>
          <div
            class="bg-surface-muted/60 mt-2 max-h-80 overflow-y-auto rounded-md p-3 text-sm leading-relaxed whitespace-pre-wrap"
          >
            {job.descriptionSnapshot}
          </div>
        </details>
      {:else}
        <p class="text-ink-muted text-sm">No description was saved for this job.</p>
      {/if}
    </section>
  </div>

  <footer class="border-line flex items-center justify-between gap-3 border-t px-5 py-3">
    <p class="text-ink-muted text-xs">
      Added {formatDateTime(job.createdAt)}<br />Updated {formatDateTime(job.updatedAt)}
    </p>
    <button
      type="button"
      onclick={ondelete}
      class="text-status-rejected hover:bg-status-rejected/10 focus-visible:ring-status-rejected rounded-md px-3 py-1.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none"
    >
      Delete job
    </button>
  </footer>
</aside>
