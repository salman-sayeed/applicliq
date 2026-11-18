<script lang="ts">
  import { INTERVIEW_REMINDER_OFFSETS } from '@pocket-career/core';
  import Field from '../Field.svelte';
  import Toggle from '../Toggle.svelte';
  import { input } from '../styles';
  import type { SectionProps } from '../types';

  let { settings, save, disabled = false }: SectionProps & { disabled?: boolean } = $props();

  const n = $derived(settings.notifications);
  let quietError = $state<string>();

  function setQuiet(start: string, end: string) {
    if (!start || !end || start === end) {
      quietError = 'Start and end need to be different times.';
      return;
    }
    quietError = undefined;
    void save({ notifications: { quietHours: { start, end } } });
  }

  const offsetLabel = (minutes: number) =>
    minutes === 0
      ? 'At the time'
      : minutes < 60
        ? `${minutes} minutes before`
        : minutes === 1440
          ? '1 day before'
          : `${minutes / 60} hour${minutes === 60 ? '' : 's'} before`;
</script>

<Field label="Follow-up reminders" hint="A notification on the follow-up date you set on a job.">
  <Toggle
    label="Follow-up reminders"
    checked={n.followUpReminders}
    {disabled}
    onchange={(followUpReminders) => save({ notifications: { followUpReminders } })}
  />
</Field>

<Field label="Interview reminders" id="interview-offset">
  <select
    id="interview-offset"
    class={input}
    {disabled}
    value={n.interviewReminderOffset === null ? 'off' : String(n.interviewReminderOffset)}
    onchange={(e) => {
      const v = e.currentTarget.value;
      void save({ notifications: { interviewReminderOffset: v === 'off' ? null : Number(v) } });
    }}
  >
    <option value="off">Off</option>
    {#each INTERVIEW_REMINDER_OFFSETS as minutes (minutes)}
      <option value={String(minutes)}>{offsetLabel(minutes)}</option>
    {/each}
  </select>
</Field>

<Field
  label="Daily goal reminder"
  id="goal-reminder"
  hint="A nudge at this time if you haven't reached today's goal yet."
>
  <Toggle
    label="Daily goal reminder"
    checked={n.dailyGoalReminder !== null}
    {disabled}
    onchange={(on) => save({ notifications: { dailyGoalReminder: on ? '18:00' : null } })}
  />
  {#if n.dailyGoalReminder !== null}
    <input
      id="goal-reminder"
      type="time"
      class={input}
      {disabled}
      value={n.dailyGoalReminder}
      onchange={(e) =>
        e.currentTarget.value &&
        save({ notifications: { dailyGoalReminder: e.currentTarget.value } })}
    />
  {/if}
</Field>

<Field
  label="Quiet hours"
  hint="Reminders that come due in this window wait until it ends."
  error={quietError}
>
  <Toggle
    label="Quiet hours"
    checked={n.quietHours !== null}
    {disabled}
    onchange={(on) =>
      save({ notifications: { quietHours: on ? { start: '22:00', end: '08:00' } : null } })}
  />
  {#if n.quietHours}
    {@const quiet = n.quietHours}
    <span class="flex items-center gap-1.5 text-sm">
      <input
        type="time"
        class={input}
        aria-label="Quiet hours start"
        {disabled}
        value={quiet.start}
        onchange={(e) => setQuiet(e.currentTarget.value, quiet.end)}
      />
      <span class="text-ink-muted">to</span>
      <input
        type="time"
        class={input}
        aria-label="Quiet hours end"
        {disabled}
        value={quiet.end}
        onchange={(e) => setQuiet(quiet.start, e.currentTarget.value)}
      />
    </span>
  {/if}
</Field>
