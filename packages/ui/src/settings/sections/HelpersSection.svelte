<script lang="ts">
  import {
    DEFAULT_FOLLOW_UP_TEMPLATES,
    type FollowUpTemplate,
    TEMPLATE_PLACEHOLDERS,
  } from '@applicliq/core';
  import { slide } from '../../motion';
  import CountInput from '../CountInput.svelte';
  import Field from '../Field.svelte';
  import { button, danger, input, link } from '../styles';
  import type { SectionProps } from '../types';

  let { settings, save, onfeatures }: SectionProps & { onfeatures: () => void } = $props();

  const h = $derived(settings.helpers);
  let errors = $state<Record<string, string | undefined>>({});
  const setError = (key: string) => (message: string | undefined) =>
    (errors = { ...errors, [key]: message });

  /** The template being edited (by id). */
  let editing = $state<string>();

  function saveTemplates(next: FollowUpTemplate[]) {
    void save({ helpers: { followUpTemplates: next } });
  }

  function updateTemplate(id: string, patch: Partial<FollowUpTemplate>) {
    const next = h.followUpTemplates.map((t) => (t.id === id ? { ...t, ...patch } : t));
    const edited = next.find((t) => t.id === id);
    if (edited && !edited.name.trim()) {
      errors = { ...errors, [`t-${id}`]: 'A template needs a name.' };
      return;
    }
    errors = { ...errors, [`t-${id}`]: undefined };
    saveTemplates(next);
  }

  function addTemplate() {
    const id = `custom-${Date.now().toString(36)}`;
    saveTemplates([
      ...h.followUpTemplates,
      { id, name: 'New template', subject: 'Following up: {title}', body: 'Hi {contactName},\n\n' },
    ]);
    editing = id;
  }

  function removeTemplate(template: FollowUpTemplate) {
    if (!confirm(`Delete the template “${template.name}”?`)) return;
    saveTemplates(h.followUpTemplates.filter((t) => t.id !== template.id));
    if (editing === template.id) editing = undefined;
  }

  function resetTemplates() {
    if (!confirm('Put the follow-up templates back to the three defaults? Your changes are lost.'))
      return;
    saveTemplates(structuredClone(DEFAULT_FOLLOW_UP_TEMPLATES) as FollowUpTemplate[]);
    editing = undefined;
  }

  const off = (key: 'redFlags' | 'followUps') => !h[key];
</script>

<p class="text-ink-muted py-3 text-xs leading-relaxed">
  Options for the Smart helpers. Turn each helper on or off in
  <button type="button" class={link} onclick={onfeatures}>Features</button>.
</p>

<h3 class="pt-4 text-sm font-semibold">Heads up</h3>
{#if off('redFlags')}
  <p class="text-ink-muted pt-1 text-xs">Heads up is off.</p>
{/if}
<Field
  label="Old posting after"
  id="old-posting"
  hint="Job pages posted longer ago than this get a note (extension)."
  error={errors.oldPosting}
>
  <CountInput
    id="old-posting"
    label="Old posting after, in days"
    value={h.oldPostingDays}
    max={365}
    suffix="days"
    onsave={(v) => v !== null && save({ helpers: { oldPostingDays: v } })}
    onerror={setError('oldPosting')}
  />
</Field>
<Field
  label="Applied to the company within"
  id="applied-before"
  hint="Mention an earlier application at the same company from this far back."
  error={errors.appliedBefore}
>
  <CountInput
    id="applied-before"
    label="Applied to the company within, in days"
    value={h.appliedBeforeDays}
    max={3650}
    suffix="days"
    onsave={(v) => v !== null && save({ helpers: { appliedBeforeDays: v } })}
    onerror={setError('appliedBefore')}
  />
</Field>

<h3 class="pt-6 text-sm font-semibold">Follow-ups</h3>
{#if off('followUps')}
  <p class="text-ink-muted pt-1 text-xs">Follow-up templates are off.</p>
{/if}
<Field
  label="Needs follow-up after"
  id="follow-up-after"
  hint="Applications with no reply and no reminder this long are listed in the dashboard."
  error={errors.followUpAfter}
>
  <CountInput
    id="follow-up-after"
    label="Needs follow-up after, in days"
    value={h.followUpAfterDays}
    max={90}
    suffix="days"
    onsave={(v) => v !== null && save({ helpers: { followUpAfterDays: v } })}
    onerror={setError('followUpAfter')}
  />
</Field>
<Field label="Your name" id="my-name" hint="Fills {'{myName}'} in the templates.">
  <input
    id="my-name"
    class="{input} w-56"
    autocomplete="name"
    value={h.myName}
    maxlength="80"
    onchange={(e) => save({ helpers: { myName: e.currentTarget.value } })}
  />
</Field>

<div class="py-4">
  <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
    <div>
      <p class="text-sm font-medium">Templates</p>
      <p class="text-ink-muted mt-0.5 text-xs leading-relaxed">
        Placeholders: {TEMPLATE_PLACEHOLDERS.map((p) => `{${p}}`).join(' ')}. Ones that can't be
        filled stay visible, so you notice.
      </p>
    </div>
    <div class="flex gap-2">
      <button type="button" class="{button} text-xs" onclick={resetTemplates}>
        Reset templates
      </button>
      <button type="button" class="{button} text-xs" onclick={addTemplate}>Add template</button>
    </div>
  </div>
  {#if h.followUpTemplates.length === 0}
    <p class="text-ink-muted text-sm">No templates. Add one, or reset to the defaults.</p>
  {/if}
  <ul class="border-line divide-line divide-y rounded-lg border">
    {#each h.followUpTemplates as template (template.id)}
      <li class="px-3 py-2">
        <div class="flex items-center justify-between gap-2">
          <button
            type="button"
            class="{link} min-w-0 truncate text-left text-sm"
            aria-expanded={editing === template.id}
            onclick={() => (editing = editing === template.id ? undefined : template.id)}
          >
            {template.name}
          </button>
          <button
            type="button"
            class="{danger} px-2 py-0.5 text-xs"
            onclick={() => removeTemplate(template)}
          >
            Delete
          </button>
        </div>
        {#if editing === template.id}
          <div transition:slide={{ duration: 150 }} class="mt-2 space-y-2 pb-1">
            <label class="block text-xs font-medium">
              Name
              <input
                class="{input} mt-1 w-full"
                value={template.name}
                maxlength="60"
                onchange={(e) => updateTemplate(template.id, { name: e.currentTarget.value })}
              />
            </label>
            <label class="block text-xs font-medium">
              Subject
              <input
                class="{input} mt-1 w-full"
                value={template.subject}
                maxlength="200"
                onchange={(e) => updateTemplate(template.id, { subject: e.currentTarget.value })}
              />
            </label>
            <label class="block text-xs font-medium">
              Message
              <textarea
                class="{input} mt-1 w-full resize-y"
                rows="8"
                value={template.body}
                maxlength="5000"
                onchange={(e) => updateTemplate(template.id, { body: e.currentTarget.value })}
              ></textarea>
            </label>
            {#if errors[`t-${template.id}`]}
              <p role="alert" class="text-status-rejected text-xs">{errors[`t-${template.id}`]}</p>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
</div>
