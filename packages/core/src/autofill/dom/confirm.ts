import { autofillPlatform } from '../sites';

/**
 * The page each platform shows after an application is sent (checked November 2026):
 * - Greenhouse (job-boards): the route `/{board}/jobs/{id}/confirmation`, and
 *   `/embed/job_app/confirmation` inside a company site's iframe. The classic board showed
 *   `#application_confirmation` / "Thank you for applying".
 * - Lever: `/{company}/{posting}/thanks`.
 * - Ashby: `.ashby-application-form-success-container`, "Your application was successfully
 *   submitted."
 * - Google Forms: `/formResponse` with "Your response has been recorded." (the default text;
 *   owners can change it, so a formResponse page with no questions left also counts).
 * - Microsoft Forms: "Your response was submitted." with no questions left on the page.
 */

const GOOGLE_DONE = /your response has been recorded/i;
const MICROSOFT_DONE = /your response was submitted|your answers have been submitted/i;
const ASHBY_DONE = /your application was successfully submitted/i;
const THANKS = /thank you for (applying|your application)|application (submitted|received)/i;

const bodyText = (doc: Document) => (doc.body?.textContent ?? '').replace(/\s+/g, ' ');

export function detectConfirmation(doc: Document, url: URL): boolean {
  const platform = autofillPlatform(url);
  const path = url.pathname.replace(/\/+$/, '');
  switch (platform) {
    case 'greenhouse':
      return (
        /\/confirmation$/.test(path) ||
        !!doc.querySelector('#application_confirmation') ||
        (!doc.querySelector('form input, form textarea') && THANKS.test(bodyText(doc)))
      );
    case 'lever':
      return /\/thanks$/.test(path);
    case 'ashby':
      return (
        !!doc.querySelector('.ashby-application-form-success-container') ||
        ASHBY_DONE.test(bodyText(doc))
      );
    case 'googleForms':
      return (
        GOOGLE_DONE.test(bodyText(doc)) ||
        (/\/formResponse$/.test(path) && !doc.querySelector('[role="listitem"] [role="heading"]'))
      );
    case 'microsoftForms':
      return (
        MICROSOFT_DONE.test(bodyText(doc)) &&
        !doc.querySelector('[data-automation-id="questionItem"]')
      );
    default:
      return false;
  }
}
