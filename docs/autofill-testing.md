# Autofill: manual test plan

Autofill fills application forms; it never submits them. **Never submit a test application.**
Fill, check, Undo, close the tab. Use a fictional profile (Settings → Autofill profile), e.g.
Ada Lovelace, ada@example.test, +44 7700 900123, London, United Kingdom.

Public application pages used while building it (November 2026; postings close, so pick any
current one from the same board if a link is gone):

| Platform                              | Page                                                                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Greenhouse (current boards)           | https://job-boards.greenhouse.io/gitlab/jobs/8940982002 (any `job-boards.greenhouse.io/<board>/jobs/<id>`)                                                       |
| Greenhouse embedded in a company site | https://careers.airbnb.com/positions/8365363/ (iframe from `job-boards.greenhouse.io/embed/job_app`)                                                             |
| Lever                                 | https://jobs.lever.co/spotify/2a55d6c9-c564-443a-be3e-a3851db5a93b/apply                                                                                         |
| Ashby                                 | https://jobs.ashbyhq.com/openai/8fb1615c-34bf-47c4-a1d1-b7b2f836bbd3/application, https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245/application |
| Google Forms                          | https://docs.google.com/forms/d/e/1FAIpQLSdu5I0gEdDtzjjLmDMZH61WwJYPuXMlntyg9dV_ss8A7TMbxg/viewform (text, dropdown, checkboxes, radios)                         |
| Microsoft Forms                       | https://forms.office.com/r/9dNTnK4Mi2 (redirects to `forms.cloud.microsoft`; text, choice, date)                                                                 |

Find more: Greenhouse `https://boards-api.greenhouse.io/v1/boards/<board>/jobs`, Lever
`https://api.lever.co/v0/postings/<company>`, Ashby
`https://api.ashbyhq.com/posting-api/job-board/<org>`.

## Setup

- [ ] Settings → Features: turn on Autofill. No permission prompt appears.
- [ ] Settings → Autofill profile appears in the nav; fill a few fields, reload: they're kept.
- [ ] Add a saved answer ("Why do you want to work here?").
- [ ] "Sync autofill profile" without encryption shows the Google Drive warning first.

## Every platform

- [ ] Open the page, open the popup (or sidebar): "Autofill this form" shows under the job.
- [ ] Preview: "I can fill X of Y questions"; guesses are marked "Suggested" and unticked; values
      can be edited; "Couldn't fill" lists the resume upload, voluntary questions, consent boxes.
- [ ] Fill: fields highlight briefly; React forms keep the values after clicking elsewhere (no
      "required" errors on filled fields); custom dropdowns show the picked option.
- [ ] The resume upload shows "Attach your resume here"; nothing is uploaded.
- [ ] CAPTCHAs, hidden fields and passwords are untouched; fields that had a value are untouched
      unless "Overwrite existing values" was ticked.
- [ ] Undo restores the previous values (custom dropdowns are listed as "change these back").
- [ ] Type an answer into a question Autofill left empty, leave the field: "Save this answer for
      next time?" appears; Save adds it to Settings → Autofill profile.
- [ ] Job boards: an unsaved job is saved when you click Fill.
- [ ] Forms: "Link to a saved job" adds the form to that job; "Create a new job" puts the form's
      title in the save form.

## Platform specifics

- [ ] Greenhouse: phone goes in without `+44` next to the Country picker (picked: United Kingdom
      +44); yes/no and country questions are react-select dropdowns and get picked.
- [ ] Greenhouse embed (Airbnb): the form is in an iframe. Without site access the popup says so
      and offers "Allow job-boards.greenhouse.io"; after allowing, the form fills.
- [ ] Lever: name, email, phone, location, company, links fill by field name; pronoun checkbox.
- [ ] Ashby: Yes/No buttons are pressed; location typeahead picks "London, …"; the date picker
      gets MM/DD/YYYY.
- [ ] Google Forms: radios, checkboxes and the dropdown; multi-section forms: after "Next",
      the popup offers "Fill this page".
- [ ] Microsoft Forms: date field in M/d/yyyy; "Next" pages offer "Fill this page".

## Options

- [ ] "Skip preview next time": the next "Autofill this form" fills at once.
- [ ] Voluntary EEO = "Decline to self-identify": gender/veteran questions get the decline option.
- [ ] "Show Autofill button on supported sites": the browser asks for the listed sites only; the
      button appears on application forms (also inside the Greenhouse iframe); turning it off
      removes the access.
- [ ] Confirmation (only by reading the page, never by submitting a real application): the
      "Mark as applied?" toast logic is unit-tested against the confirmation URLs and texts in
      `packages/core/src/autofill/dom/confirm.ts`.
