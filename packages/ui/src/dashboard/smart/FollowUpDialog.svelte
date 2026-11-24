<script lang="ts">
  import {
    type Job,
    type JobPatch,
    fillFollowUp,
    followUpText,
    mailtoUrl,
    templateValues,
    unfilledPlaceholders,
  } from '@applicliq/core';
  import { addDays, startOfDay } from '@applicliq/core';
  import { untrack } from 'svelte';
  import { slide } from '../../motion';
  import { getPrefs } from '../../prefs.svelte';
  import { copyText } from '../format';
  import Modal from '../Modal.svelte';
  import { btn, btnPrimary, field, label, linkBtn } from './styles';

  /** Follow-up messages from templates (Smart helpers → Follow-up templates). */
  let {
    job,
    onupdate,
    onclose,
    onsettings,
  }: {
    job: Job;
    onupdate: (patch: JobPatch) => Promise<unknown>;
    onclose: () => void;
    /** Opens Settings → Smart helpers to edit templates, where the app can. */
    onsettings?: () => void;
  } = $props();

  const REMIND_DAYS = 7;
  const prefs = getPrefs();
  const templates = $derived(prefs.settings.helpers.followUpTemplates);
  // svelte-ignore state_referenced_locally
  let templateId = $state(templates[0]?.id);
  const template = $derived(templates.find((t) => t.id === templateId) ?? templates[0]);

  const values = $derived(
    templateValues(job, {
      myName: prefs.settings.helpers.myName,
      formatDate: (ms) => prefs.date(ms),
    }),
  );
  /** The filled text, editable before copying. */
  let subject = $state('');
  let body = $state('');
  // Filled when the template changes only, so a job update (the reminder) keeps edits.
  $effect(() => {
    const current = template;
    if (!current) return;
    const filled = fillFollowUp(
      current,
      untrack(() => values),
    );
    subject = filled.subject;
    body = filled.body;
  });

  const missing = $derived(unfilledPlaceholders(`${subject}\n${body}`));
  const mailto = $derived(mailtoUrl(job.contact?.email, { subject, body }));

  let copied = $state(false);
  let error = $state<string>();
  let reminded = $state(false);

  async function copy() {
    error = undefined;
    try {
      await copyText(followUpText({ subject, body }));
      copied = true;
    } catch {
      error = 'Could not copy. Select the text and copy it yourself.';
    }
  }

  async function remindLater() {
    const at = addDays(startOfDay(Date.now()), REMIND_DAYS) + 9 * 60 * 60 * 1000;
    try {
      await onupdate({ followUpAt: at });
      reminded = true;
    } catch {
      // The dashboard reports it.
    }
  }
</script>

<Modal title="Follow up" description="{job.title} · {job.company}" {onclose}>
  {#if !template}
    <p class="text-ink-muted text-sm">
      You have no follow-up templates.
      {#if onsettings}
        <button type="button" class={linkBtn} onclick={onsettings}>Add one in Settings</button>
      {/if}
    </p>
  {:else}
    <div class="space-y-3">
      <div>
        <label class={label} for="fu-template">Template</label>
        <select id="fu-template" class={field} bind:value={templateId}>
          {#each templates as t (t.id)}
            <option value={t.id}>{t.name}</option>
          {/each}
        </select>
      </div>
      <div>
        <label class={label} for="fu-subject">Subject</label>
        <input id="fu-subject" class={field} bind:value={subject} />
      </div>
      <div>
        <label class={label} for="fu-body">Message</label>
        <textarea id="fu-body" rows="10" class="{field} resize-y" bind:value={body}></textarea>
      </div>
      {#if missing.length}
        <p class="text-ink-muted text-xs" transition:slide={{ duration: 150 }}>
          Still to fill in: {missing.map((m) => `{${m}}`).join(', ')}.
          {#if missing.includes('myName') && onsettings}
            Set your name in <button type="button" class={linkBtn} onclick={onsettings}>
              Settings
            </button>.
          {/if}
        </p>
      {/if}
      {#if error}<p role="alert" class="text-status-rejected text-xs">{error}</p>{/if}
      {#if copied}
        <div
          transition:slide={{ duration: 150 }}
          role="status"
          class="bg-surface-muted flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-sm"
        >
          {#if reminded}
            <span>Copied. We'll remind you in {REMIND_DAYS} days.</span>
          {:else}
            <span>Copied. Follow up again if there's no reply?</span>
            <button type="button" class={linkBtn} onclick={remindLater}>
              Remind me again in {REMIND_DAYS} days
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  {#snippet footer()}
    {#if template}
      {#if mailto}
        <a href={mailto} class={btn} onclick={() => (copied = true)}>Open in email</a>
      {/if}
      <button type="button" class={btnPrimary} onclick={copy}>
        {copied ? 'Copy again' : 'Copy'}
      </button>
    {:else}
      <button type="button" class={btn} onclick={onclose}>Close</button>
    {/if}
  {/snippet}
</Modal>
