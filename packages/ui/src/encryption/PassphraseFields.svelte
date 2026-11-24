<script lang="ts" module>
  import { MIN_PASSPHRASE_LENGTH } from '@applicliq/core';

  /** Whether two typed passphrases can be used: long enough and the same. */
  export function passphrasesReady(passphrase: string, confirm: string): boolean {
    return [...passphrase].length >= MIN_PASSPHRASE_LENGTH && passphrase === confirm;
  }
</script>

<script lang="ts">
  import { passphraseStrength } from '@applicliq/core';
  import { input } from '../settings/styles';

  let {
    passphrase = $bindable(''),
    confirm = $bindable(''),
    id,
    label = 'Passphrase',
  }: {
    passphrase?: string;
    confirm?: string;
    /** Prefix for the inputs' ids (several forms may be on one page). */
    id: string;
    label?: string;
  } = $props();

  const strength = $derived(passphraseStrength(passphrase));
  const mismatch = $derived(confirm.length > 0 && confirm !== passphrase);
  const BAR = [
    '',
    'bg-status-rejected',
    'bg-status-interview',
    'bg-status-applied',
    'bg-status-offer',
  ];
</script>

<div class="grid gap-3">
  <div>
    <label for="{id}-new" class="text-sm font-medium">{label}</label>
    <input
      id="{id}-new"
      type="password"
      autocomplete="new-password"
      spellcheck="false"
      class="{input} mt-1 w-full"
      aria-describedby="{id}-strength"
      bind:value={passphrase}
    />
    <div id="{id}-strength" class="mt-1.5 flex items-center gap-2" aria-live="polite">
      <div class="flex flex-1 gap-1" aria-hidden="true">
        {#each [1, 2, 3, 4] as step (step)}
          <span
            class="h-1 flex-1 rounded-full {passphrase && strength.score >= step
              ? BAR[strength.score]
              : 'bg-line'}"
          ></span>
        {/each}
      </div>
      <span class="text-ink-muted shrink-0 text-right text-xs whitespace-nowrap">
        {passphrase ? strength.label : `${MIN_PASSPHRASE_LENGTH}+ characters`}
      </span>
    </div>
    <p class="text-ink-muted mt-1 text-xs">
      A few unrelated words make a passphrase that is long and easy to remember.
    </p>
  </div>
  <div>
    <label for="{id}-confirm" class="text-sm font-medium">Type it again</label>
    <input
      id="{id}-confirm"
      type="password"
      autocomplete="new-password"
      spellcheck="false"
      class="{input} mt-1 w-full"
      aria-invalid={mismatch}
      bind:value={confirm}
    />
    {#if mismatch}
      <p role="alert" class="text-status-rejected mt-1 text-xs">The passphrases don't match.</p>
    {/if}
  </div>
</div>
