import {
  autofillPlatform,
  buildPlan,
  fillableItems,
  looksLikeApplicationForm,
} from '@applicliq/core/autofill';
import { getAgent } from '@/lib/autofill-agent';
import { floatingButton, notice } from '@/lib/autofill-page';
import type { AutofillButtonMessage, AutofillButtonReply } from '@/lib/messages';

/**
 * The optional "Autofill with AppliCliq" button (Settings → Features → Autofill → "Show Autofill
 * button on supported sites"). Registered by the background, only once the user has granted
 * access to the supported sites, and only on them; runs in every frame so a Greenhouse form
 * embedded on a company site gets it too. It also notices the "application sent" page.
 */
export default defineContentScript({
  registration: 'runtime',
  main() {
    if (!autofillPlatform(location.href)) return;
    const agent = getAgent();
    let remove: (() => void) | undefined;
    let busy = false;

    async function onClick() {
      if (busy) return;
      busy = true;
      try {
        const message: AutofillButtonMessage = { type: 'applicliq:autofill-button' };
        const reply = (await browser.runtime.sendMessage(message).catch(() => undefined)) as
          AutofillButtonReply | undefined;
        if (!reply) return notice('Couldn’t reach AppliCliq. Reload the page and try again.');
        if (reply.action === 'open-toolbar') {
          return notice('Click AppliCliq in the toolbar to review and fill this form.');
        }
        if (reply.action === 'empty-profile') {
          return notice('Add your details first: AppliCliq → Settings → Autofill profile.');
        }
        if (reply.action !== 'fill') return;
        // "Skip preview" is on: fill what Autofill is sure about, with Undo on the page.
        const scan = agent.scanNow();
        const plan = buildPlan(scan.questions, reply);
        const items = fillableItems(plan).map(({ questionId, value, values, optionKind }) => ({
          questionId,
          value,
          ...(values ? { values } : {}),
          ...(optionKind ? { optionKind } : {}),
        }));
        if (!items.length) return notice('Nothing here matches your profile yet.');
        await agent.run({
          type: 'fill',
          items,
          offerSaveFor: reply.offerToSaveAnswers
            ? plan.unfilled
                .filter(
                  (u) => (u.kind === 'text' || u.kind === 'textarea') && u.reason.startsWith('no-'),
                )
                .map((u) => u.questionId)
            : [],
          savedQuestions: reply.answers.map((a) => a.question),
          showBar: true,
        });
      } finally {
        busy = false;
      }
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const scan = agent.scanNow();
        if (scan.confirmation) {
          remove?.();
          void agent.run({ type: 'check-confirmation' });
        } else if (!remove && looksLikeApplicationForm(scan)) {
          remove = floatingButton(() => void onClick());
        }
      }, 600);
    };
    check();
    // Single-page apps (Ashby, Microsoft Forms) render the form, and the next page, later.
    new MutationObserver(check).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  },
});
