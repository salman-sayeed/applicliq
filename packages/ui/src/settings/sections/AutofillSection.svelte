<script lang="ts">
  import {
    type AutofillProfile,
    EMPTY_PROFILE,
    type SavedAnswer,
    isFeatureEnabled,
  } from '@applicliq/core';
  import type { DashboardAdapter } from '../../dashboard/adapter';
  import { slide } from '../../motion';
  import Choice from '../Choice.svelte';
  import Field from '../Field.svelte';
  import Toggle from '../Toggle.svelte';
  import { button, danger, input, link } from '../styles';
  import type { SectionProps } from '../types';

  /**
   * Settings → Autofill profile (feature `autofill`): what Autofill puts in application forms,
   * the saved answers it reuses, and how it behaves. Every field is optional. The profile stays
   * in this browser unless "Sync autofill profile" is on.
   */
  let {
    settings,
    save,
    adapter,
    notify,
    ondata,
  }: SectionProps & {
    adapter: DashboardAdapter;
    notify: (message: string, tone?: 'info' | 'error') => void;
    /** Opens Sync & data (encryption). */
    ondata: () => void;
  } = $props();

  let profile = $state<AutofillProfile>(structuredClone(EMPTY_PROFILE));
  let answers = $state.raw<SavedAnswer[]>([]);
  let loaded = $state(false);
  /** What was last saved, so a change from elsewhere doesn't overwrite typing. */
  let savedJson = '';

  $effect(() => {
    const store = adapter.autofill;
    if (!store) return;
    return store.watch(
      (next) => {
        const json = JSON.stringify(next.profile);
        if (json !== savedJson) {
          profile = structuredClone(next.profile);
          savedJson = json;
        }
        answers = next.answers;
        loaded = true;
      },
      (error) => notify(`Could not load your profile: ${String(error)}`, 'error'),
    );
  });

  /** Saves the profile when a field changes (on change/blur, not every keystroke). */
  async function saveProfile() {
    const json = JSON.stringify(profile);
    if (json === savedJson || !adapter.autofill) return;
    try {
      const clean = await adapter.autofill.saveProfile($state.snapshot(profile));
      savedJson = JSON.stringify(clean);
      notify('Saved');
    } catch (error) {
      notify(`Could not save: ${String(error)}`, 'error');
    }
  }

  const encrypted = $derived(isFeatureEnabled(settings, 'encryptedSync'));

  type TextKey = {
    [K in keyof AutofillProfile]: AutofillProfile[K] extends string ? K : never;
  }[keyof AutofillProfile];

  type FieldSpec = {
    key: TextKey;
    label: string;
    type?: string;
    placeholder?: string;
    autocomplete?: AutoFill;
    wide?: boolean;
  };

  const GROUPS: { title: string; fields: FieldSpec[] }[] = [
    {
      title: 'Name',
      fields: [
        { key: 'firstName', label: 'First name', autocomplete: 'given-name' },
        { key: 'lastName', label: 'Last name', autocomplete: 'family-name' },
        { key: 'fullName', label: 'Full name', placeholder: 'If not first + last' },
        { key: 'preferredName', label: 'Preferred name' },
        { key: 'pronouns', label: 'Pronouns', placeholder: 'e.g. she/her' },
      ],
    },
    {
      title: 'Contact',
      fields: [
        { key: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
        { key: 'phoneCountryCode', label: 'Country code', placeholder: '44', type: 'tel' },
        { key: 'phoneNumber', label: 'Phone number', type: 'tel', autocomplete: 'tel-national' },
        { key: 'city', label: 'City', autocomplete: 'address-level2' },
        { key: 'country', label: 'Country', autocomplete: 'country-name' },
        { key: 'address', label: 'Full address', autocomplete: 'street-address', wide: true },
      ],
    },
    {
      title: 'Links',
      fields: [
        {
          key: 'linkedin',
          label: 'LinkedIn',
          type: 'url',
          placeholder: 'https://linkedin.com/in/…',
        },
        { key: 'github', label: 'GitHub', type: 'url', placeholder: 'https://github.com/…' },
        { key: 'website', label: 'Portfolio or website', type: 'url', wide: true },
      ],
    },
    {
      title: 'Work',
      fields: [
        { key: 'currentTitle', label: 'Current title' },
        { key: 'currentCompany', label: 'Current company' },
        { key: 'yearsExperience', label: 'Years of experience', type: 'number' },
      ],
    },
    {
      title: 'Availability',
      fields: [
        { key: 'noticePeriod', label: 'Notice period', placeholder: 'e.g. 1 month' },
        { key: 'earliestStartDate', label: 'Earliest start date', type: 'date' },
      ],
    },
    {
      title: 'Education',
      fields: [
        { key: 'school', label: 'School', wide: true },
        { key: 'degree', label: 'Degree', placeholder: 'e.g. BSc' },
        { key: 'fieldOfStudy', label: 'Field of study' },
        { key: 'graduationYear', label: 'Graduation year', type: 'number', placeholder: '2020' },
      ],
    },
  ];

  const YES_NO = [
    { value: '', label: 'Not set' },
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
  ] as const;

  // --- Lists in the profile ---------------------------------------------------------------------

  function addLink() {
    profile.otherLinks.push({ label: '', url: '' });
  }
  function removeLink(index: number) {
    profile.otherLinks.splice(index, 1);
    void saveProfile();
  }
  function addAuthorization() {
    profile.workAuthorization.push({ country: '', authorized: true });
  }
  function removeAuthorization(index: number) {
    profile.workAuthorization.splice(index, 1);
    void saveProfile();
  }

  // --- Saved answers ----------------------------------------------------------------------------

  let newQuestion = $state('');
  let newAnswer = $state('');

  async function addAnswer(event: SubmitEvent) {
    event.preventDefault();
    if (!newQuestion.trim() || !adapter.autofill) return;
    try {
      await adapter.autofill.addAnswer({ question: newQuestion, answer: newAnswer });
      newQuestion = '';
      newAnswer = '';
      notify('Answer saved');
    } catch (error) {
      notify(`Could not save the answer: ${String(error)}`, 'error');
    }
  }

  async function editAnswer(
    answer: SavedAnswer,
    patch: Partial<Pick<SavedAnswer, 'question' | 'answer'>>,
  ) {
    if (patch.question === answer.question && patch.answer === undefined) return;
    if (patch.answer === answer.answer && patch.question === undefined) return;
    try {
      await adapter.autofill?.updateAnswer(answer.id, patch);
      notify('Saved');
    } catch (error) {
      notify(`Could not save: ${String(error)}`, 'error');
    }
  }

  async function deleteAnswer(answer: SavedAnswer) {
    if (!confirm(`Delete the saved answer to “${answer.question}”?`)) return;
    try {
      await adapter.autofill?.deleteAnswer(answer.id);
      notify('Answer deleted');
    } catch (error) {
      notify(`Could not delete: ${String(error)}`, 'error');
    }
  }

  // --- Sync ---------------------------------------------------------------------------------------

  /** Turning sync on without encryption: say what that means before it happens. */
  let confirmSync = $state(false);

  function setSync(on: boolean) {
    if (on && !encrypted) {
      confirmSync = true;
      return;
    }
    confirmSync = false;
    void save({ autofill: { syncProfile: on } });
  }
</script>

<p class="text-ink-muted py-3 text-xs leading-relaxed">
  What Autofill puts in application forms. Every field is optional. It’s used only on forms you
  choose to fill, after you check the preview, and AppliCliq never submits a form for you.
  {settings.autofill.syncProfile
    ? 'Synced to your Google Drive (see below).'
    : 'Stored in this browser only.'}
</p>

{#if !adapter.autofill}
  <p class="bg-surface-muted my-3 rounded-md px-3 py-2 text-sm">
    Autofill works in the AppliCliq browser extension.
  </p>
{:else if !loaded}
  <div class="bg-surface-muted my-4 h-40 animate-pulse rounded-md"></div>
{:else}
  {#snippet textField(spec: FieldSpec)}
    <label class="flex flex-col gap-1 text-xs {spec.wide ? 'sm:col-span-2' : ''}">
      <span class="text-ink-muted font-medium">{spec.label}</span>
      <input
        class={input}
        type={spec.type ?? 'text'}
        placeholder={spec.placeholder}
        autocomplete={spec.autocomplete ?? 'off'}
        bind:value={profile[spec.key]}
        onchange={saveProfile}
      />
    </label>
  {/snippet}

  {#each GROUPS.slice(0, 3) as group (group.title)}
    <section class="border-line border-b py-4">
      <h3 class="mb-3 text-sm font-medium">{group.title}</h3>
      <div class="grid gap-3 sm:grid-cols-2">
        {#each group.fields as spec (spec.key)}{@render textField(spec)}{/each}
      </div>
      {#if group.title === 'Links'}
        <div class="mt-3 flex flex-col gap-2">
          {#each profile.otherLinks as link, index (index)}
            <div class="flex flex-wrap items-center gap-2" transition:slide={{ duration: 150 }}>
              <input
                class="{input} w-32"
                placeholder="Label"
                aria-label="Link label"
                bind:value={link.label}
                onchange={saveProfile}
              />
              <input
                class="{input} min-w-0 flex-1"
                type="url"
                placeholder="https://…"
                aria-label="Link URL"
                bind:value={link.url}
                onchange={saveProfile}
              />
              <button type="button" class={button} onclick={() => removeLink(index)}>Remove</button>
            </div>
          {/each}
          <button type="button" class="{link} self-start text-xs" onclick={addLink}>
            + Add another link
          </button>
        </div>
      {/if}
    </section>
  {/each}

  <section class="border-line border-b py-4">
    <h3 class="mb-3 text-sm font-medium">Work</h3>
    <div class="grid gap-3 sm:grid-cols-2">
      {#each GROUPS[3]!.fields as spec (spec.key)}{@render textField(spec)}{/each}
    </div>
  </section>

  <section class="border-line border-b py-4">
    <h3 class="text-sm font-medium">Eligibility</h3>
    <p class="text-ink-muted mt-0.5 mb-3 text-xs">
      Questions that name a country use its row; “the country where the job is located” is only
      suggested, for you to check.
    </p>
    <div class="flex flex-col gap-2">
      {#each profile.workAuthorization as entry, index (index)}
        <div class="flex flex-wrap items-center gap-2" transition:slide={{ duration: 150 }}>
          <input
            class="{input} min-w-0 flex-1"
            placeholder="Country"
            aria-label="Country"
            bind:value={entry.country}
            onchange={saveProfile}
          />
          <select
            class={input}
            aria-label="Authorized to work in {entry.country || 'this country'}"
            bind:value={entry.authorized}
            onchange={saveProfile}
          >
            <option value={true}>Authorized to work</option>
            <option value={false}>Not authorized</option>
          </select>
          <button type="button" class={button} onclick={() => removeAuthorization(index)}>
            Remove
          </button>
        </div>
      {/each}
      <button type="button" class="{link} self-start text-xs" onclick={addAuthorization}>
        + Add a country
      </button>
    </div>
    <div class="mt-4 grid gap-3 sm:grid-cols-2">
      <label class="flex flex-col gap-1 text-xs">
        <span class="text-ink-muted font-medium">Needs visa sponsorship</span>
        <select class={input} bind:value={profile.needsSponsorship} onchange={saveProfile}>
          {#each YES_NO as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
        </select>
      </label>
      <label class="flex flex-col gap-1 text-xs">
        <span class="text-ink-muted font-medium">Willing to relocate</span>
        <select class={input} bind:value={profile.willingToRelocate} onchange={saveProfile}>
          {#each YES_NO as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
        </select>
      </label>
      <label class="flex flex-col gap-1 text-xs">
        <span class="text-ink-muted font-medium">Remote preference</span>
        <select class={input} bind:value={profile.remotePreference} onchange={saveProfile}>
          <option value="">Not set</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">On-site</option>
          <option value="any">Open to any</option>
        </select>
      </label>
      {#each GROUPS[4]!.fields as spec (spec.key)}{@render textField(spec)}{/each}
    </div>
  </section>

  <section class="border-line border-b py-4">
    <h3 class="mb-3 text-sm font-medium">Expected salary</h3>
    <div class="grid gap-3 sm:grid-cols-3">
      <label class="flex flex-col gap-1 text-xs">
        <span class="text-ink-muted font-medium">Amount</span>
        <input
          class={input}
          inputmode="decimal"
          bind:value={profile.salaryAmount}
          onchange={saveProfile}
        />
      </label>
      <label class="flex flex-col gap-1 text-xs">
        <span class="text-ink-muted font-medium">Currency</span>
        <input
          class={input}
          maxlength="3"
          placeholder="EUR"
          bind:value={profile.salaryCurrency}
          onchange={saveProfile}
        />
      </label>
      <label class="flex flex-col gap-1 text-xs">
        <span class="text-ink-muted font-medium">Per</span>
        <select class={input} bind:value={profile.salaryPeriod} onchange={saveProfile}>
          <option value="">Not set</option>
          <option value="year">Year</option>
          <option value="month">Month</option>
          <option value="hour">Hour</option>
        </select>
      </label>
    </div>
  </section>

  <section class="border-line border-b py-4">
    <h3 class="mb-3 text-sm font-medium">Education</h3>
    <div class="grid gap-3 sm:grid-cols-2">
      {#each GROUPS[5]!.fields as spec (spec.key)}{@render textField(spec)}{/each}
    </div>
  </section>

  <section class="border-line border-b py-4">
    <h3 class="mb-3 text-sm font-medium">Defaults</h3>
    <div class="grid gap-3 sm:grid-cols-2">
      {@render textField({
        key: 'howDidYouHear',
        label: '“How did you hear about us?”',
        placeholder: 'e.g. LinkedIn',
        wide: true,
      })}
    </div>
  </section>

  <div class="divide-line divide-y">
    <Field
      label="Voluntary EEO questions"
      hint="Gender, race or ethnicity, veteran and disability questions. AppliCliq never stores your answers to them: it leaves them empty, or picks the form’s “Decline to self-identify” option."
    >
      <Choice
        label="Voluntary EEO questions"
        value={settings.autofill.eeo}
        options={[
          { value: 'skip', label: 'Don’t fill these' },
          { value: 'decline', label: 'Decline to self-identify' },
        ]}
        onchange={(eeo) => save({ autofill: { eeo } })}
      />
    </Field>
  </div>

  <section class="border-line border-b py-4">
    <h3 class="text-sm font-medium">Saved answers</h3>
    <p class="text-ink-muted mt-0.5 mb-3 text-xs">
      Reused when a form asks the same question in similar words. Close matches are filled; looser
      ones are suggested in the preview.
    </p>
    {#if answers.length}
      <ul class="flex flex-col gap-3">
        {#each answers as answer (answer.id)}
          <li
            class="border-line flex flex-col gap-2 rounded-md border p-3"
            transition:slide={{ duration: 150 }}
          >
            <input
              class="{input} font-medium"
              aria-label="Question"
              value={answer.question}
              onchange={(e) => editAnswer(answer, { question: e.currentTarget.value })}
            />
            <textarea
              class="{input} min-h-20"
              aria-label="Answer to {answer.question}"
              value={answer.answer}
              onchange={(e) => editAnswer(answer, { answer: e.currentTarget.value })}></textarea>
            <button
              type="button"
              class="{danger} self-end px-2 py-0.5 text-xs"
              onclick={() => deleteAnswer(answer)}
            >
              Delete
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="text-ink-muted text-xs">
        None yet. Add one here, or save an answer you type into a form when AppliCliq offers.
      </p>
    {/if}
    <form class="mt-3 flex flex-col gap-2" onsubmit={addAnswer}>
      <input
        class={input}
        placeholder="Question, e.g. Why are you looking for a new role?"
        aria-label="New question"
        bind:value={newQuestion}
      />
      <textarea
        class="{input} min-h-20"
        placeholder="Your answer"
        aria-label="New answer"
        bind:value={newAnswer}></textarea>
      <button type="submit" class="{button} self-start" disabled={!newQuestion.trim()}>
        Add answer
      </button>
    </form>
  </section>

  <div class="divide-line divide-y">
    <Field
      label="Offer to save new answers"
      hint="When you type an answer to a question Autofill couldn’t fill, ask “Save this answer for next time?”."
    >
      <Toggle
        label="Offer to save new answers"
        checked={settings.autofill.offerToSaveAnswers}
        onchange={(on) => save({ autofill: { offerToSaveAnswers: on } })}
      />
    </Field>
    <Field
      label="Skip the preview"
      hint="Fill straight away with the answers Autofill is sure about."
    >
      <Toggle
        label="Skip the preview"
        checked={settings.autofill.skipPreview}
        onchange={(on) => save({ autofill: { skipPreview: on } })}
      />
    </Field>
    <Field
      label="Mark as applied automatically"
      hint="When the form’s “application sent” page shows, mark the job applied without asking."
    >
      <Toggle
        label="Mark as applied automatically"
        checked={settings.autofill.markAppliedAutomatically}
        onchange={(on) => save({ autofill: { markAppliedAutomatically: on } })}
      />
    </Field>
    <Field
      label="Mark as applied when I click Fill"
      hint="For sites where AppliCliq can’t see the page after you submit (without the on-page button)."
    >
      <Toggle
        label="Mark as applied when I click Fill"
        checked={settings.autofill.markAppliedOnFill}
        onchange={(on) => save({ autofill: { markAppliedOnFill: on } })}
      />
    </Field>
    <Field
      label="Sync autofill profile"
      hint={encrypted
        ? 'Your profile and saved answers go to your Google Drive with your other data, encrypted.'
        : 'Off: your profile and saved answers stay in this browser.'}
    >
      <Toggle
        label="Sync autofill profile"
        checked={settings.autofill.syncProfile}
        onchange={setSync}
      />
    </Field>
  </div>
  {#if confirmSync || (settings.autofill.syncProfile && !encrypted)}
    <div
      role="alert"
      class="bg-surface-muted mt-1 mb-3 rounded-md px-3 py-2 text-xs leading-relaxed"
      transition:slide={{ duration: 150 }}
    >
      <p>
        Your profile (phone, address, etc.) will be stored in your Google Drive. Turn on encryption
        to protect it.
      </p>
      <div class="mt-2 flex flex-wrap gap-3">
        <button type="button" class={link} onclick={ondata}>Set up encryption</button>
        {#if confirmSync}
          <button
            type="button"
            class={link}
            onclick={() => {
              confirmSync = false;
              void save({ autofill: { syncProfile: true } });
            }}
          >
            Sync it anyway
          </button>
          <button
            type="button"
            class="text-ink-muted hover:underline"
            onclick={() => (confirmSync = false)}
          >
            Cancel
          </button>
        {/if}
      </div>
    </div>
  {/if}
{/if}
