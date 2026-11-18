<script lang="ts">
  import { JOB_STATUSES, type JobStatus, type WeekStartDay } from '@pocket-career/core';
  import { getPrefs } from '../../prefs.svelte';
  import Choice from '../Choice.svelte';
  import CountInput from '../CountInput.svelte';
  import Field from '../Field.svelte';
  import type { SectionProps } from '../types';

  let { settings, save }: SectionProps = $props();

  const prefs = getPrefs();
  const goals = $derived(settings.goals);
  let errors = $state<Record<string, string | undefined>>({});

  const targets = [
    { key: 'daily', label: 'Daily target', suffix: 'per day', max: 100 },
    { key: 'weekly', label: 'Weekly target', suffix: 'per week', max: 500 },
    { key: 'monthly', label: 'Monthly target', suffix: 'per month', max: 2000 },
  ] as const;

  const weekStarts: { value: WeekStartDay; label: string }[] = [
    { value: 'sat', label: 'Saturday' },
    { value: 'sun', label: 'Sunday' },
    { value: 'mon', label: 'Monday' },
  ];

  function toggleStatus(status: JobStatus, on: boolean) {
    const next = on
      ? [...goals.countStatuses, status]
      : goals.countStatuses.filter((s) => s !== status);
    if (next.length === 0) {
      errors.count = 'At least one status has to count.';
      return;
    }
    errors.count = undefined;
    void save({ goals: { countStatuses: JOB_STATUSES.filter((s) => next.includes(s)) } });
  }
</script>

{#each targets as target (target.key)}
  <Field
    label={target.label}
    id="goal-{target.key}"
    hint="Leave empty to turn this goal off."
    error={errors[target.key]}
  >
    <CountInput
      id="goal-{target.key}"
      label={target.label}
      value={goals[target.key]}
      max={target.max}
      suffix={target.suffix}
      allowOff
      onsave={(value) => save({ goals: { [target.key]: value } })}
      onerror={(message) => (errors[target.key] = message)}
    />
  </Field>
{/each}

<Field label="Week starts on" hint="For the weekly goal and the activity heatmap.">
  <Choice
    label="Week starts on"
    value={goals.weekStartsOn}
    options={weekStarts}
    onchange={(weekStartsOn) => save({ goals: { weekStartsOn } })}
  />
</Field>

<Field
  label="Count as an application"
  hint="A job counts toward your goals from the first time it reaches one of these statuses."
  error={errors.count}
>
  <div class="grid grid-cols-2 gap-x-4 gap-y-1.5">
    {#each JOB_STATUSES as status (status)}
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          class="accent-accent size-3.5"
          checked={goals.countStatuses.includes(status)}
          onchange={(e) => toggleStatus(status, e.currentTarget.checked)}
        />
        {prefs.status(status)}
      </label>
    {/each}
  </div>
</Field>
