<script lang="ts">
  import { type EncryptionController, generateRecoveryCode } from '@applicliq/core';
  import type { SyncMenuStatus } from '../dashboard/types';
  import Toggle from '../settings/Toggle.svelte';
  import { button, danger, input, primary } from '../settings/styles';
  import { encryptionErrorMessage } from './messages';
  import PassphraseFields, { passphrasesReady } from './PassphraseFields.svelte';
  import RecoveryCodeStep from './RecoveryCodeStep.svelte';
  import UnlockForm from './UnlockForm.svelte';

  let {
    controls,
    status,
    onchanged,
    notify,
  }: {
    controls: EncryptionController;
    status: SyncMenuStatus;
    /** After a change here: sync now and refresh the status. */
    onchanged: () => void;
    notify: (message: string, tone?: 'info' | 'error') => void;
  } = $props();

  type View = 'idle' | 'enable' | 'change' | 'reset' | 'disable';

  let view = $state<View>('idle');
  /** Whether Drive holds encrypted data; undefined until known. */
  let driveOn = $state<boolean>();
  let unlocked = $state(false);
  let remembered = $state(true);
  let working = $state(false);
  let error = $state<string>();

  // Form fields. Secrets are cleared as soon as they were used, or the form closes.
  let step = $state<'passphrase' | 'code'>('passphrase');
  let current = $state('');
  let passphrase = $state('');
  let confirm = $state('');
  let recoveryCode = $state('');
  let codeReady = $state(false);
  let remember = $state(true);
  let understood = $state(false);

  function clearForm() {
    current = passphrase = confirm = recoveryCode = '';
    codeReady = understood = false;
    step = 'passphrase';
    error = undefined;
  }

  function open(next: View) {
    clearForm();
    view = next;
  }

  async function refresh() {
    try {
      [unlocked, remembered] = await Promise.all([controls.isUnlocked(), controls.isRemembered()]);
    } catch {
      unlocked = false;
    }
  }

  // Drive's state comes from the last sync; before the first one, ask Drive.
  $effect(() => {
    const locked = status.error?.kind === 'locked';
    const known = status.encrypted;
    void status.lastSyncedAt;
    if (locked) driveOn = true;
    else if (known !== undefined) driveOn = known;
    else {
      controls.driveState().then(
        (state) => (driveOn = state === 'on'),
        () => {},
      );
    }
    void refresh();
  });

  async function run(task: () => Promise<void>, done: string) {
    if (working) return;
    working = true;
    error = undefined;
    try {
      await task();
      clearForm();
      view = 'idle';
      notify(done);
      onchanged();
      await refresh();
    } catch (e) {
      error = encryptionErrorMessage(e);
    } finally {
      working = false;
    }
  }

  function toCode() {
    recoveryCode = generateRecoveryCode();
    step = 'code';
  }

  const enable = () =>
    run(async () => {
      await controls.enable(passphrase, recoveryCode, remember);
      driveOn = true;
    }, 'Encrypted sync is on');

  const changePassphrase = () =>
    run(
      () => controls.changePassphrase({ passphrase: current }, passphrase, remembered),
      'Passphrase changed',
    );

  const resetCode = () =>
    run(() => controls.resetRecoveryCode(current, recoveryCode), 'New recovery code saved');

  const disable = () =>
    run(async () => {
      await controls.disable(current);
      driveOn = false;
    }, 'Encrypted sync is off');

  async function lock() {
    await controls.lock();
    await refresh();
    notify('Locked on this device');
    onchanged();
  }

  async function setRemembered(on: boolean) {
    const stillUnlocked = await controls.setRemembered(on);
    await refresh();
    if (!stillUnlocked) {
      notify('Forgotten on this device. Unlock again to keep syncing.');
      onchanged();
    }
  }

  function onUnlocked() {
    notify('Unlocked');
    onchanged();
    void refresh();
  }
</script>

{#snippet errorBox()}
  {#if error}
    <p
      role="alert"
      class="bg-status-rejected/10 text-status-rejected rounded-md px-2.5 py-2 text-xs"
    >
      {error}
    </p>
  {/if}
{/snippet}

{#snippet currentPassphrase(label: string)}
  <div>
    <label for="enc-current" class="text-sm font-medium">{label}</label>
    <input
      id="enc-current"
      type="password"
      autocomplete="current-password"
      spellcheck="false"
      class="{input} mt-1 w-full"
      bind:value={current}
    />
  </div>
{/snippet}

{#snippet cancel()}
  <button type="button" class={button} disabled={working} onclick={() => open('idle')}>
    Cancel
  </button>
{/snippet}

<div class="max-w-lg py-2 text-sm">
  {#if driveOn === undefined}
    <p class="text-ink-muted text-xs">Checking your Drive…</p>
  {:else if !driveOn}
    {#if view !== 'enable'}
      <p class="text-ink-muted text-xs leading-relaxed">
        Encrypts your jobs and settings on this device before they go to Google Drive, with a
        passphrase only you know. Google (and anyone else) sees only scrambled data. Every device
        and the website then need the passphrase once to sync. AppliCliq never sees or stores it.
      </p>
      <p class="bg-surface-muted mt-3 rounded-md px-3 py-2 text-xs">
        Update AppliCliq on all your devices before turning this on. Older versions stop syncing
        until they're updated.
      </p>
      <button type="button" class="{primary} mt-3" onclick={() => open('enable')}>
        Turn on encryption…
      </button>
    {:else}
      <form
        class="grid gap-4"
        onsubmit={(e) => {
          e.preventDefault();
          if (step === 'passphrase') toCode();
          else void enable();
        }}
      >
        {#if step === 'passphrase'}
          <p class="text-ink-muted text-xs leading-relaxed">
            Choose a passphrase. You'll type it once on each of your other devices and on the
            website. Nobody can reset it for you, so a recovery code comes next.
          </p>
          <PassphraseFields id="enc-enable" bind:passphrase bind:confirm />
          <label class="flex items-start gap-2 text-sm">
            <input type="checkbox" class="accent-accent mt-0.5" bind:checked={remember} />
            <span>Remember on this device</span>
          </label>
          <div class="flex gap-2">
            <button type="submit" class={primary} disabled={!passphrasesReady(passphrase, confirm)}>
              Next
            </button>
            {@render cancel()}
          </div>
        {:else}
          <RecoveryCodeStep id="enc-enable" code={recoveryCode} bind:ready={codeReady} />
          {@render errorBox()}
          <div class="flex gap-2">
            <button type="submit" class={primary} disabled={!codeReady || working}>
              {working ? 'Encrypting and uploading…' : 'Encrypt and upload'}
            </button>
            {@render cancel()}
          </div>
        {/if}
      </form>
    {/if}
  {:else if view === 'disable'}
    <form
      class="grid gap-4"
      onsubmit={(e) => {
        e.preventDefault();
        void disable();
      }}
    >
      <p
        class="border-status-rejected/30 text-status-rejected rounded-md border px-3 py-2 text-xs leading-relaxed"
      >
        Your data will be decrypted and stored in your Google Drive as plain, readable data again,
        and the encrypted copy will be deleted. Your passphrase and recovery code stop working.
      </p>
      {@render currentPassphrase('Passphrase')}
      <label class="flex items-start gap-2 text-sm">
        <input type="checkbox" class="accent-accent mt-0.5" bind:checked={understood} />
        <span>I understand my Drive data will no longer be encrypted.</span>
      </label>
      {@render errorBox()}
      <div class="flex gap-2">
        <button type="submit" class={danger} disabled={!current || !understood || working}>
          {working ? 'Turning off…' : 'Turn off encryption'}
        </button>
        {@render cancel()}
      </div>
    </form>
  {:else if !unlocked}
    <p class="mb-3 font-medium">Your data is encrypted. Enter your passphrase</p>
    <p class="text-ink-muted mb-3 text-xs">
      Sync is paused on this device until it's unlocked. Your jobs here stay usable, and changes
      made meanwhile are merged once it's unlocked.
    </p>
    <UnlockForm {controls} id="enc-unlock" onunlocked={onUnlocked} />
    <button type="button" class="{danger} mt-4 text-xs" onclick={() => open('disable')}>
      Turn off encryption…
    </button>
  {:else if view === 'change'}
    <form
      class="grid gap-4"
      onsubmit={(e) => {
        e.preventDefault();
        void changePassphrase();
      }}
    >
      {@render currentPassphrase('Current passphrase')}
      <PassphraseFields id="enc-change" label="New passphrase" bind:passphrase bind:confirm />
      <p class="text-ink-muted text-xs">
        Only the key that locks your data changes, so this is quick. Other devices stay unlocked;
        new devices use the new passphrase.
      </p>
      {@render errorBox()}
      <div class="flex gap-2">
        <button
          type="submit"
          class={primary}
          disabled={!current || !passphrasesReady(passphrase, confirm) || working}
        >
          {working ? 'Saving…' : 'Change passphrase'}
        </button>
        {@render cancel()}
      </div>
    </form>
  {:else if view === 'reset'}
    <form
      class="grid gap-4"
      onsubmit={(e) => {
        e.preventDefault();
        if (step === 'passphrase') toCode();
        else void resetCode();
      }}
    >
      {#if step === 'passphrase'}
        <p class="text-ink-muted text-xs">
          A new recovery code replaces the old one, which stops working.
        </p>
        {@render currentPassphrase('Passphrase')}
        <div class="flex gap-2">
          <button type="submit" class={primary} disabled={!current}>Next</button>
          {@render cancel()}
        </div>
      {:else}
        <RecoveryCodeStep id="enc-reset" code={recoveryCode} bind:ready={codeReady} />
        {@render errorBox()}
        <div class="flex gap-2">
          <button type="submit" class={primary} disabled={!codeReady || working}>
            {working ? 'Saving…' : 'Save new recovery code'}
          </button>
          {@render cancel()}
        </div>
      {/if}
    </form>
  {:else}
    <p class="flex items-center gap-2 font-medium">
      <span aria-hidden="true">🔒</span> Encrypted · unlocked on this device
    </p>
    <p class="text-ink-muted mt-1 text-xs">
      Your Drive holds only encrypted data. This device syncs with a key it keeps
      {remembered ? 'until you lock it' : 'until the browser closes'}.
    </p>
    <div class="mt-3 flex items-center justify-between gap-4">
      <div>
        <p class="text-sm">Remember on this device</p>
        <p class="text-ink-muted text-xs">
          Off: asked again in each browser session. Turning it off locks this device now.
        </p>
      </div>
      <Toggle label="Remember on this device" checked={remembered} onchange={setRemembered} />
    </div>
    <div class="mt-4 flex flex-wrap gap-2">
      <button type="button" class={button} onclick={lock}>Lock now</button>
      <button type="button" class={button} onclick={() => open('change')}>
        Change passphrase…
      </button>
      <button type="button" class={button} onclick={() => open('reset')}>
        Reset recovery code…
      </button>
      <button type="button" class={danger} onclick={() => open('disable')}>
        Turn off encryption…
      </button>
    </div>
  {/if}
</div>
