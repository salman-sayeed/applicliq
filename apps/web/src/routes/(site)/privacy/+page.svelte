<script lang="ts">
  import Seo from '#lib/Seo.svelte';
  import { GITHUB_URL } from '#lib/links.ts';

  const EFFECTIVE = 'November 19, 2026';
</script>

<Seo
  title="Privacy policy · AppliCliq"
  description="AppliCliq has no server. Your job data stays in your browser and in a hidden app folder in your own Google Drive."
  path="/privacy"
/>

<main
  class="[&_a]:text-accent mx-auto max-w-3xl px-4 py-14 text-[15px] leading-relaxed [&_a:hover]:underline [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5"
>
  <h1 class="text-3xl font-semibold tracking-tight">Privacy policy</h1>
  <p class="text-ink-muted">Effective {EFFECTIVE}</p>

  <div class="bg-surface-muted mt-6 rounded-xl p-5">
    <p class="mt-0! font-medium">In short</p>
    <ul>
      <li>
        AppliCliq has <strong>no server and no database</strong>. We never receive, store or see
        your data.
      </li>
      <li>
        Your jobs are stored in your browser and, if you turn on sync, in a hidden app folder in
        <strong>your own Google Drive</strong>. Nowhere else.
      </li>
      <li>No accounts, analytics, tracking, ads or cookies. Nothing is sold or shared.</li>
    </ul>
  </div>

  <h2>Who we are</h2>
  <p>
    AppliCliq is a free, open-source job application tracker made up of a browser extension (Chrome,
    Edge, Firefox) and this website. Its full source code is public on
    <a href={GITHUB_URL} rel="external">GitHub</a>, so anyone can check that it does what this
    policy says.
  </p>

  <h2>What data AppliCliq handles</h2>
  <p>Only what you choose to save about your job search:</p>
  <ul>
    <li>
      job postings you save: title, company, location, salary, link, and a text snapshot of the
      description;
    </li>
    <li>
      what you add yourself: status and its history, notes, tags, resume version, contact name and
      email, interview and follow-up dates;
    </li>
    <li>your settings: application goals, when to mark a job ghosted, and theme.</li>
  </ul>
  <p>
    The extension reads a job page only when you save it (or, if you turn on the saved-job badge, to
    check whether the page's address matches a job you already saved). It doesn't track your
    browsing and never sends page contents anywhere.
  </p>

  <h2>Where your data is stored</h2>
  <ul>
    <li>
      <strong>In your browser</strong> (IndexedDB), on each device where you use the extension or this
      website. This copy works offline.
    </li>
    <li>
      <strong>In your Google Drive</strong>, only if you sign in to sync: a single file,
      <code>career-pocket.json</code>, in Drive's hidden application data folder. It doesn't appear
      among your files and counts toward your Drive storage. With encrypted sync on, that file holds
      only a small marker, and your data is in <code>applicliq.enc.json</code>, encrypted (see
      below).
    </li>
  </ul>
  <p>
    Data travels only between your browser and Google, over HTTPS. AppliCliq has no servers it could
    send it to.
  </p>

  <h2>Encrypted sync (optional)</h2>
  <p>
    You can turn on encrypted sync in Settings → Sync &amp; data. Your jobs and settings are then
    locked with a passphrase you choose <strong>before</strong> they leave your browser, so the copy in
    your Google Drive is scrambled data that Google, AppliCliq's developers or anyone else who got hold
    of the file cannot read. Only your own devices, once you type the passphrase on them, can unlock it.
  </p>
  <ul>
    <li>
      It uses the encryption built into your browser (AES-256, with your passphrase strengthened by
      600,000 rounds of PBKDF2). No extra code is downloaded for it.
    </li>
    <li>
      Your passphrase and recovery code are never stored, never sent anywhere and never written to a
      log. Each device keeps only the unlocked key, in a form scripts can use but can't read out,
      until you press "Lock now" (or, if you choose, until the browser closes).
    </li>
    <li>
      You also get a one-time recovery code in case you forget the passphrase. If you lose both,
      nobody, including us, can recover your synced data. The jobs already in your browsers are not
      affected.
    </li>
    <li>
      The copy in your browser itself is not encrypted: it is protected the same way as the rest of
      your browser profile.
    </li>
  </ul>

  <h2>Google user data</h2>
  <p>
    When you sign in with Google, AppliCliq asks for one permission:
    <code>https://www.googleapis.com/auth/drive.appdata</code> ("See, create, and delete its own
    configuration data in your Google Drive"). With it, AppliCliq can only see the files it created
    in its own hidden folder. It <strong>cannot</strong> see, read or change any other file in your Drive,
    and it does not ask for your name, email address, contacts or anything else.
  </p>
  <ul>
    <li>
      <strong>Use:</strong> the permission is used only to read and write the sync file, so your jobs
      are the same on every browser where you sign in.
    </li>
    <li>
      <strong>Storage:</strong> the access token Google issues is kept in your browser only, for the session,
      and is never sent anywhere except to Google's APIs.
    </li>
    <li>
      <strong>Sharing:</strong> your Google data is not transferred to us or to anyone else. It is not
      used for advertising, not sold, not used to train AI or machine-learning models, and no human reads
      it.
    </li>
  </ul>
  <p>
    AppliCliq's use and transfer of information received from Google APIs adheres to the
    <a href="https://developers.google.com/terms/api-services-user-data-policy">
      Google API Services User Data Policy
    </a>, including the Limited Use requirements.
  </p>

  <h2>Third parties</h2>
  <ul>
    <li>
      <strong>Google</strong> provides sign-in (Google Identity Services, loaded from Google on the
      dashboard page only) and stores the sync file in your Drive. Google's own
      <a href="https://policies.google.com/privacy">privacy policy</a> applies to your Google account.
    </li>
    <li>
      <strong>Cloudflare Pages</strong> hosts this website's static files. Like any web host, it processes
      standard request data such as IP addresses to deliver pages and protect against abuse. The website
      sends Cloudflare none of your job data.
    </li>
    <li>
      The browser stores (Chrome Web Store, Firefox Add-ons, Edge Add-ons) distribute the extension
      under their own policies.
    </li>
  </ul>
  <p>There are no analytics, advertising, error-reporting or tracking services of any kind.</p>

  <h2>Your choices and deleting your data</h2>
  <ul>
    <li>
      <strong>Use it without sync:</strong> the extension works fully without signing in; your data then
      stays on that device only.
    </li>
    <li>
      <strong>Sign out</strong> from the sync menu to stop syncing. On this website, signing out also
      removes your jobs from the browser.
    </li>
    <li>
      <strong>Revoke access</strong> at any time in your
      <a href="https://myaccount.google.com/connections">Google Account connections</a>.
    </li>
    <li>
      <strong>Delete the Drive copy:</strong> in Google Drive, open Settings → Manage apps → AppliCliq
      → Options → Delete hidden app data.
    </li>
    <li>
      <strong>Delete the local copy:</strong> delete jobs in the dashboard, uninstall the extension, or
      clear this site's data in your browser settings.
    </li>
  </ul>
  <p>
    Deleted jobs are kept as a minimal marker (an ID and a deletion time, no job details) for up to
    30 days so the deletion reaches your other devices, then removed.
  </p>

  <h2>Children</h2>
  <p>AppliCliq is not directed at children under 13 and doesn't knowingly handle their data.</p>

  <h2>Changes to this policy</h2>
  <p>
    If this policy changes, the new version will be posted on this page with a new effective date.
    Its full history is public in the project's GitHub repository.
  </p>

  <h2>Contact</h2>
  <p>
    Questions or concerns? Open an issue on
    <a href="{GITHUB_URL}/issues" rel="external">GitHub</a>.
  </p>
</main>
