<script lang="ts">
  import type { EncryptionController } from '@applicliq/core';
  import { button, input, link, primary } from '../settings/styles';
  import { encryptionErrorMessage } from './messages';
  import PassphraseFields, { passphrasesReady } from './PassphraseFields.svelte';

  let {
    controls,
    onunlocked,
    id = 'unlock',
  }: {
    controls: Pick<EncryptionController, 'unlock' | 'checkRecoveryCode' | 'changePassphrase'>;
    /** Called once this device holds the key (start a sync). */
    onunlocked: () => void;
    id?: string;
  } = $props();

  /** passphrase → or recovery code → then a new passphrase (forgot passphrase). */
  let mode = $state<'passphrase' | 'recovery' | 'new-passphrase'>('passphrase');
  let passphrase = $state('');
  let recoveryCode = $state('');
  let newPassphrase = $state('');
  let confirm = $state('');
  let remember = $state(true);
  let working = $state(false);
  let error = $state<string>();

  /** Secrets live only in these fields, and only until they are used. */
  function clearSecrets() {
    passphrase = '';
    recoveryCode = '';
    newPassphrase = '';
    confirm = '';
  }

  function switchTo(next: typeof mode) {
    clearSecrets();
    error = undefined;
    mode = next;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (working) return;
    working = true;
    error = undefined;
    try {
      if (mode === 'passphrase') {
        await controls.unlock({ passphrase }, remember);
        clearSecrets();
        onunlocked();
      } else if (mode === 'recovery') {
        // Checked first, so a wrong code is reported before a new passphrase is asked for.
        await controls.checkRecoveryCode(recoveryCode);
        mode = 'new-passphrase';
      } else {
        await controls.changePassphrase({ recoveryCode }, newPassphrase, remember);
        clearSecrets();
        onunlocked();
      }
    } catch (e) {
      error = encryptionErrorMessage(e);
      if (mode === 'passphrase') passphrase = '';
    } finally {
      working = false;
    }
  }

  const canSubmit = $derived(
    mode === 'passphrase'
      ? passphrase.length > 0
      : mode === 'recovery'
        ? recoveryCode.trim().length > 0
        : passphrasesReady(newPassphrase, confirm),
  );
</script>

<form class="grid gap-3" onsubmit={submit}>
  {#if mode === 'passphrase'}
    <div>
      <label for="{id}-passphrase" class="text-sm font-medium">Passphrase</label>
      <input
        id="{id}-passphrase"
        type="password"
        autocomplete="current-password"
        spellcheck="false"
        class="{input} mt-1 w-full"
        bind:value={passphrase}
      />
    </div>
  {:else if mode === 'recovery'}
    <div>
      <label for="{id}-code" class="text-sm font-medium">Recovery code</label>
      <input
        id="{id}-code"
        autocomplete="off"
        spellcheck="false"
        placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
        class="{input} mt-1 w-full font-mono uppercase"
        bind:value={recoveryCode}
      />
    </div>
  {:else}
    <p class="text-sm">Recovery code accepted. Choose a new passphrase to finish unlocking.</p>
    <PassphraseFields
      id="{id}-new"
      label="New passphrase"
      bind:passphrase={newPassphrase}
      bind:confirm
    />
  {/if}

  <label class="flex items-start gap-2 text-sm">
    <input type="checkbox" class="accent-accent mt-0.5" bind:checked={remember} />
    <span>
      Remember on this device
      <span class="text-ink-muted block text-xs">
        Off: you'll be asked again in each browser session.
      </span>
    </span>
  </label>

  {#if error}
    <p
      role="alert"
      class="bg-status-rejected/10 text-status-rejected rounded-md px-2.5 py-2 text-xs"
    >
      {error}
    </p>
  {/if}

  <div class="flex flex-wrap items-center gap-3">
    <button type="submit" class={primary} disabled={!canSubmit || working}>
      {working
        ? mode === 'passphrase'
          ? 'Unlocking…'
          : 'Checking…'
        : mode === 'recovery'
          ? 'Continue'
          : mode === 'new-passphrase'
            ? 'Set passphrase and unlock'
            : 'Unlock'}
    </button>
    {#if mode === 'passphrase'}
      <button type="button" class="{link} text-xs" onclick={() => switchTo('recovery')}>
        Use recovery code instead
      </button>
    {:else}
      <button type="button" class="{button} text-xs" onclick={() => switchTo('passphrase')}>
        Back
      </button>
    {/if}
  </div>
</form>
