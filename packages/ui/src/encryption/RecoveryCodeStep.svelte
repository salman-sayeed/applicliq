<script lang="ts">
  import { recoveryCodeTail } from '@applicliq/core';
  import { downloadFile } from '../dashboard/format';
  import { button, input } from '../settings/styles';

  let {
    code,
    ready = $bindable(false),
    id,
  }: {
    /** The new recovery code: shown here once, never stored. */
    code: string;
    /** Set when the user typed the code's end back and ticked the box. */
    ready?: boolean;
    id: string;
  } = $props();

  let tail = $state('');
  let understood = $state(false);
  let copied = $state(false);

  $effect(() => {
    ready = understood && tail.trim().toUpperCase() === recoveryCodeTail(code);
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
  }

  function download() {
    const text = [
      'AppliCliq recovery code',
      '',
      code,
      '',
      `Created ${new Date().toLocaleString()}.`,
      '',
      'Use this code to unlock your encrypted AppliCliq data if you forget your passphrase.',
      'Keep it somewhere safe and private, such as a password manager or on paper.',
      'If you lose both this code and your passphrase, your synced data cannot be recovered.',
      '',
    ].join('\n');
    downloadFile('applicliq-recovery-code.txt', text, 'text/plain;charset=utf-8');
  }
</script>

<div class="grid gap-3">
  <p class="text-sm">
    This is your <strong>recovery code</strong>. It unlocks your data if you forget your passphrase.
    It is shown only once: save it now.
  </p>
  <p
    class="bg-surface-muted rounded-md px-3 py-3 text-center font-mono text-base tracking-wider break-all select-all"
    aria-label="Recovery code"
  >
    {code}
  </p>
  <div class="flex flex-wrap gap-2">
    <button type="button" class={button} onclick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
    <button type="button" class={button} onclick={download}>Download as .txt</button>
  </div>
  <div>
    <label for="{id}-tail" class="text-sm font-medium">
      Type the last 4 characters of the code
    </label>
    <input
      id="{id}-tail"
      class="{input} mt-1 w-28 font-mono uppercase"
      maxlength="4"
      autocomplete="off"
      spellcheck="false"
      bind:value={tail}
    />
  </div>
  <label class="flex items-start gap-2 text-sm">
    <input type="checkbox" class="accent-accent mt-0.5" bind:checked={understood} />
    <span>
      I understand that if I lose both my passphrase and recovery code, my synced data cannot be
      recovered.
    </span>
  </label>
</div>
