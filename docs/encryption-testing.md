# Encrypted sync: manual test checklist

The automated tests (`pnpm test`: `packages/core/src/crypto/envelope.test.ts` and
`packages/core/src/sync/encryption.test.ts`) cover the cryptography and the sync logic against an
in-memory Drive. This checklist covers the real thing: Google Drive, two browsers and the website.

## Setup

- **Browser A:** Chrome with the extension built from this branch (`pnpm build:ext`, load
  `apps/extension/.output/chrome-mv3`).
- **Browser B:** Firefox (or a second Chrome profile) with the same build
  (`.output/firefox-mv2` / `chrome-mv3`).
- **Website:** `pnpm dev:web` (http://localhost:5173/app), in a third browser or a private
  window.
- One Google test account. Sign in to sync on all three before you start.
- Save 2–3 jobs on A and 1–2 on B, then **Sync now** everywhere so all three show the same jobs.
- Optional, to look at the Drive files: the
  [Drive API explorer](https://developers.google.com/drive/api/reference/rest/v3/files/list)
  with `spaces=appDataFolder` (the files are not visible in drive.google.com).

Use a throwaway passphrase such as `lantern orbit maple cascade`. Keep the recovery code shown in
step 1 for later steps.

## 1. Turn it on (browser A)

- [ ] Settings → Features → Encrypted sync: the card says it is set up in Sync & data, and the
      switch opens Settings → Sync & data.
- [ ] Settings → Sync & data → Encryption explains what it does and shows "Update AppliCliq on all
      your devices before turning this on."
- [ ] **Turn on encryption…**: a 9-character passphrase can't continue; mismatched passphrases say
      so; the strength hint changes as you type.
- [ ] The recovery code shows as 7 groups of 4. **Copy** puts it on the clipboard; **Download as
      .txt** saves `applicliq-recovery-code.txt` with the code and a short explanation.
- [ ] **Encrypt and upload** stays disabled until the last 4 characters are typed (any case) and
      the "I understand…" box is ticked.
- [ ] After it finishes: "Encrypted · unlocked on this device", Lock now / Change passphrase /
      Reset recovery code / Turn off encryption.
- [ ] Drive (API explorer): `career-pocket.json` is
      `{"schemaVersion":3,"encrypted":true,…,"records":[]}`; `applicliq.enc.json` has
      `format: "applicliq-encrypted"` and no readable job titles anywhere.
- [ ] The passphrase fields are empty after the flow (and when you go back to the form).

## 2. An older version (optional, before releasing)

- [ ] Load the previous release (v1.1.0 zip from GitHub Releases) in another profile, signed in to
      the same account. Its sync shows "…saved by a newer version… Update to keep syncing", and the
      two Drive files are unchanged afterwards.

## 3. Unlock on the other devices

- [ ] Browser B: the toolbar icon shows 🔒; the popup shows "Sync paused · Unlock" (opens Settings
      → Sync & data); the dashboard's sync menu says "Sync paused · Unlock".
- [ ] While locked, saving and editing jobs on B works; nothing reaches Drive (A doesn't get them).
- [ ] A wrong passphrase: "That passphrase does not unlock your data…", the field is cleared.
- [ ] The right passphrase: B unlocks, syncs, and shows A's jobs; its own jobs (including those
      added while locked) appear on A after A syncs.
- [ ] Website: after sign-in the dialog "Your data is encrypted. Enter your passphrase" opens by
      itself; closing it leaves the dashboard usable, and the sync menu's **Unlock** opens it
      again. Unlock with the passphrase: the jobs load.

## 4. Edit everywhere

- [ ] Add, edit and delete a job on each of A, B and the website; after syncing, all three agree.
      A deletion on one removes the job on the others.
- [ ] Change a synced setting (e.g. daily goal) on B; it reaches A and the website.
- [ ] Look at `applicliq.enc.json` again: the `iv` changed after each upload.

## 5. Lock and unlock

- [ ] A: **Lock now** → status shows the unlock form; the toolbar shows 🔒; jobs stay usable.
- [ ] Unlock again with **Remember on this device** off; restart the browser: A asks again.
- [ ] With Remember on, restart the browser: A stays unlocked and syncs in the background.
- [ ] Turning **Remember on this device** off while unlocked locks A (it says so).
- [ ] Website: unlock with Remember off, reload the page: it asks again.

## 6. Change the passphrase

- [ ] A: **Change passphrase…** with a wrong current passphrase fails with a clear message.
- [ ] With the right one: "Passphrase changed". B and the website stay unlocked and keep syncing.
- [ ] Lock B and unlock it: the old passphrase fails, the new one works.

## 7. Recovery code

- [ ] Website (or B, locked): **Use recovery code instead** → a mistyped code says it doesn't look
      like a recovery code; a valid but wrong code says it doesn't unlock.
- [ ] The right code (lower case or without dashes is fine) asks for a new passphrase and won't
      continue without one; afterwards it is unlocked, and the new passphrase works elsewhere.
- [ ] A: **Reset recovery code…** (passphrase, new code, type last 4, tick): the old code no longer
      works, the new one does.

## 8. Turn it off

- [ ] A: **Turn off encryption…** shows the warning; a wrong passphrase fails; the right one with
      the box ticked turns it off.
- [ ] Drive: `career-pocket.json` is plain again (`schemaVersion: 2`, readable records) and
      `applicliq.enc.json` is gone.
- [ ] B and the website sync again without asking; their 🔒 / "Sync paused" disappears and
      Features shows Encrypted sync off.

## 9. Edge cases

- [ ] Settings → Sync & data → **Delete Drive data** on an encrypted account removes both files.
      A device still signed in with encryption on then says "Encrypted sync is on, but your Drive
      has no AppliCliq data…" and does not upload plain data; **Turn off encryption…** there
      (any passphrase) returns it to plain sync.
- [ ] Turn encryption off on A and on again with a new passphrase while B is unlocked: B's next
      sync forgets its old key and asks for the (new) passphrase.
- [ ] Offline: lock/unlock buttons that need Drive fail with "You are offline."; local data is
      untouched.
