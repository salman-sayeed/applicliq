# Store listings

Copy-ready text for the Chrome Web Store (also used for Microsoft Edge Add-ons) and
addons.mozilla.org (AMO). Upload the zips that the release workflow attaches to each GitHub
Release (see [Releasing](../CONTRIBUTING.md#releasing)).

Links used below:

- Website: https://applicliq.pages.dev
- Privacy policy: https://applicliq.pages.dev/privacy
- Source code / support: https://github.com/salman-sayeed/careerpocket (issues for support)

---

## Shared text

**Name:** AppliCliq

**Short description** (Chrome: max 132 characters; this is 115):

> Save job postings from any site in one click and track every application. Private, free,
> and synced to your own Drive.

**Category:** Chrome: **Productivity** (Workflow & Planning). Firefox: **Productivity**.

**Full description:**

```text
AppliCliq is a free, open-source job application tracker that lives in your browser.

SAVE JOBS FROM ANY SITE
Open a job posting and click the AppliCliq icon (or press Alt+Shift+S). The title, company,
location, salary and work type are filled in from the page, with special support for LinkedIn,
Indeed, Glassdoor, Greenhouse, Lever, Workday, Wellfound and BDJobs. Already saved it? Career
Pocket tells you, so you never apply twice.

TRACK EVERY APPLICATION
• Move jobs from Saved to Applied, Assessment, Interview and Offer in a list or on a board
• Notes, tags, contacts, résumé version and a copy of the job description
• Interview and follow-up dates with reminders (and calendar files to add them to your calendar)
• Jobs with no reply are marked "ghosted" automatically after a few weeks (you choose when)
• Daily and weekly goals, streaks and a funnel of where your applications end up

PRIVATE BY DESIGN
• No account, no server, no ads, no tracking or analytics
• Your jobs are stored in your browser
• Optional: sign in with Google to back up and sync through a hidden folder in your own Google
  Drive. AppliCliq can only see that folder, never your other files.
• Use the same data on any computer at https://applicliq.pages.dev

YOURS TO KEEP
Export everything as JSON (a full backup you can import again) or CSV for spreadsheets.

Free and open source (MIT): https://github.com/salman-sayeed/careerpocket
```

**Screenshots** (Chrome: 1280×800, up to 5; Firefox: any size; Edge: 1280×800, up to 10). Ready-made
1280×800 PNGs of the dashboard are in [screenshots/store](screenshots/store) (fictional demo data,
made with [screenshots/capture.mjs](screenshots/capture.mjs)). Suggested order:

1. `popup.png`: the popup on a job posting with the fields filled in (a frame of the demo recording).
2. `dashboard-list.png`: the list with the detail panel open.
3. `dashboard-board.png`: the board.
4. `dashboard-stats.png`: goals, streak and funnel.
5. `settings-data.png`: sync, export and import.

**Store icon:** `apps/extension/public/icon/128.png`.

**Small promo tile** (Chrome, required; Edge too): `screenshots/store/promo-tile-440x280.png`,
440×280, no transparency. Made from [screenshots/promo/tile.html](screenshots/promo/tile.html)
(the render command is at the top of that file).

---

## Chrome Web Store

### Privacy practices tab

**Single purpose:**

> Save job postings from web pages and track the status of your job applications.

**Permission justifications:**

| Permission                            | Justification                                                                                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`                           | Reads the job posting on the current tab only when the user opens the popup, presses the save shortcut or uses the right-click menu.                                         |
| `scripting`                           | Injects the job-details extractor, the "pick from page" helper and a short confirmation into that tab (granted through `activeTab`), and the optional "already saved" badge. |
| `contextMenus`                        | Adds "Save job to AppliCliq" to links, and "Set as Title / Company / …" to selected text to fix a detail the page didn't give correctly.                                     |
| `storage`                             | Keeps the sign-in state, sync status, which reminders were already shown, and unsaved form drafts (in session storage, deleted after 24 hours).                              |
| `sidePanel`                           | Shows the same save-job form in the browser's side panel when the user chooses it, so it stays open beside the posting.                                                      |
| `alarms`                              | Runs the periodic ghosted-job check, reminders and background sync.                                                                                                          |
| `notifications`                       | Shows interview and follow-up reminders and goal nudges the user turned on.                                                                                                  |
| `identity`                            | Signs in to Google so the user can sync their data to their own Google Drive (`drive.appdata` scope only).                                                                   |
| Optional host permission `<all_urls>` | Only requested when the user turns on the "saved job" badge or lets the side panel follow their tabs; used to read the job page they switch to. Never requested otherwise.   |
| Remote code                           | No. All code is in the package.                                                                                                                                              |

**Data usage** (check these boxes):

- Personally identifiable information: **No**
- Health, financial, authentication, personal communications, location, web history, user
  activity: **No**
- **Website content: Yes.** Job posting text (title, company, description) from pages the user
  chooses to save. It is stored locally and, only if the user signs in, in their own Google Drive.

Certify all three disclosures (not sold, not used for unrelated purposes, not used for
creditworthiness).

**Privacy policy URL:** https://applicliq.pages.dev/privacy

### Before the first upload

- Build with the production OAuth client: the release workflow uses the
  `WXT_GOOGLE_CLIENT_ID_WEB` repository secret. The store assigns a new extension ID, so add
  `https://<store-extension-id>.chromiumapp.org/` to the Web client's **Authorized redirect URIs**
  (see [google-setup.md](google-setup.md)) once the item exists.
- The uploaded zip must not contain a `key` field. Store builds leave it out
  (`WXT_STORE_BUILD=true`); the release's `-edge-store.zip` is built that way. The plain
  `-chrome.zip` and `-edge.zip` keep the key, for loading unpacked.

### Microsoft Edge Add-ons

Same text and answers. Upload the `-edge-store.zip`. After the first upload, add its
`https://<edge-extension-id>.chromiumapp.org/` redirect URI as well.

---

## Firefox Add-ons (AMO)

**Summary** (max 250 characters):

> Save job postings from any site in one click and track every application from saved to offer.
> Reminders, goals and stats. Private and free: no account, no tracking; optional sync to your
> own Google Drive.

**Description:** the full description above (AMO accepts the same text; bullets can stay).

**Categories:** Productivity. **Tags:** jobs, job search, productivity, tracker, career.

**License:** MIT License.

**Privacy policy:** paste the text of https://applicliq.pages.dev/privacy (AMO wants the text,
not a link).

**Data collection:** the manifest declares `data_collection_permissions: { required: ["none"] }`:
nothing is sent to the developers or any third party. Optional sync writes only to the user's own
Google Drive after they sign in.

### Source code for reviewers

AMO asks for source code because the add-on is bundled. Upload the `applicliq-<version>-sources.zip`
from the release and paste these notes:

```text
Build environment: Node.js 22 (see .node-version), pnpm 10.28.2 (corepack or
`npm i -g pnpm@10.28.2`), macOS or Linux.

Build steps, from the root of the sources zip:
  pnpm install --frozen-lockfile
  WXT_GOOGLE_CLIENT_ID_WEB=<client id> pnpm --filter @applicliq/extension build:firefox

The add-on is in apps/extension/.output/firefox-mv2. WXT_GOOGLE_CLIENT_ID_WEB is our public
Google OAuth client ID (it appears in the built background.js); with it set to the same value
the output matches the submitted package byte for byte. Without it the build is identical except
that Google Drive sync is turned off.

The code is open source: https://github.com/salman-sayeed/careerpocket
```

After the first upload, check the redirect URL: it is
`https://7dfefee70c143dcba27a0e03d052a74559f6ba72.extensions.allizom.org/` for the add-on ID
`career-pocket@career-pocket` and must be in the Web client's **Authorized redirect URIs**.
