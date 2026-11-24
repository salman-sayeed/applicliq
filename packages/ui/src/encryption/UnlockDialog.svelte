<script lang="ts">
  import type { EncryptionController } from '@applicliq/core';
  import Modal from '../dashboard/Modal.svelte';
  import UnlockForm from './UnlockForm.svelte';

  /**
   * "Your data is encrypted. Enter your passphrase": shown on a device that finds encrypted
   * data in Drive and has no key. Nothing is merged or uploaded until it is unlocked.
   */
  let {
    controls,
    onunlocked,
    onclose,
  }: {
    controls: Pick<EncryptionController, 'unlock' | 'checkRecoveryCode' | 'changePassphrase'>;
    onunlocked: () => void;
    onclose: () => void;
  } = $props();
</script>

<Modal
  title="Your data is encrypted. Enter your passphrase"
  description="Sync is paused until this device is unlocked. Your jobs here stay usable, and changes made meanwhile are merged once it's unlocked."
  {onclose}
>
  <UnlockForm
    {controls}
    id="unlock-dialog"
    onunlocked={() => {
      onunlocked();
      onclose();
    }}
  />
</Modal>
