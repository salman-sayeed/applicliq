import {
  type FillOutcome,
  type FormScan,
  type OptionKind,
  type ScanResult,
  detectConfirmation,
  fillQuestion,
  hasSavedAnswer,
  looksLikeApplicationForm,
  scanForm,
} from '@applicliq/core/autofill';
import type { SavedAnswer } from '@applicliq/core';
import { askApplied, filledBar, highlight, notice, offerToSave, uploadNote } from './autofill-page';
import type {
  AutofillConfirmedMessage,
  AutofillConfirmedReply,
  AutofillMarkAppliedMessage,
  AutofillPageMessage,
  AutofillSaveAnswerMessage,
} from './messages';

/**
 * The part of Autofill that runs inside a page (each frame): reads the form, fills it, undoes,
 * and watches for the next page of a multi-page form and for the "application sent" page. The
 * popup drives it with `AgentCommand`s through `scripting.executeScript`; it never submits a
 * form, never touches CAPTCHAs or file uploads.
 */

export type FillItem = {
  questionId: string;
  value: string;
  values?: string[];
  optionKind?: OptionKind;
};

export type AgentCommand =
  | { type: 'scan' }
  | {
      type: 'fill';
      items: FillItem[];
      /** Questions left unfilled that may offer "Save this answer for next time?". */
      offerSaveFor: string[];
      /** Saved answers' questions, so a known question isn't offered again. */
      savedQuestions: string[];
      /** Show the in-page "Filled N fields · Undo" bar (the floating button's fill). */
      showBar?: boolean;
    }
  | { type: 'undo' }
  | { type: 'check-confirmation' };

export type FillReport = {
  filled: string[];
  failed: { questionId: string; label: string; reason: string }[];
};

export type UndoReport = { restored: number; notRestorable: string[] };

export type AgentReply = ScanResult | FillReport | UndoReport | boolean | undefined;

export type Agent = { run(command: AgentCommand): Promise<AgentReply>; scanNow(): ScanResult };

const GLOBAL = '__applicliqAutofill';

/** The frame's agent, created once (injecting the script again reuses it). */
export function getAgent(): Agent {
  const scope = globalThis as unknown as Record<string, Agent | undefined>;
  return (scope[GLOBAL] ??= createAgent());
}

function send(message: unknown): Promise<unknown> {
  return browser.runtime.sendMessage(message).catch(() => undefined);
}

function createAgent(): Agent {
  let scan: FormScan | undefined;
  let undos: { label: string; undo: () => Promise<boolean> }[] = [];
  let cleanups: (() => void)[] = [];
  let signature = '';
  let confirmed = false;
  let observer: MutationObserver | undefined;
  let watchTimer: ReturnType<typeof setTimeout> | undefined;

  const read = (): FormScan => (scan = scanForm(document, new URL(location.href)));
  const signatureOf = (result: ScanResult) =>
    result.questions.map((q) => `${q.kind}:${q.label}`).join('|');

  /** Debounced: a new set of questions (next page) or the confirmation page. */
  function onMutation() {
    clearTimeout(watchTimer);
    watchTimer = setTimeout(() => {
      const next = scanForm(document, new URL(location.href)).result;
      if (next.confirmation) return void reportConfirmation();
      const sig = signatureOf(next);
      if (sig !== signature && looksLikeApplicationForm(next)) {
        signature = sig;
        const message: AutofillPageMessage = {
          type: 'applicliq:autofill-page',
          url: location.href,
        };
        void send(message);
      }
    }, 400);
  }

  function watch() {
    if (observer) return;
    observer = new MutationObserver(onMutation);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  async function reportConfirmation() {
    if (confirmed) return;
    confirmed = true;
    const message: AutofillConfirmedMessage = { type: 'applicliq:autofill-confirmed' };
    const reply = (await send(message)) as AutofillConfirmedReply | undefined;
    if (reply?.action === 'done') notice(`Marked “${reply.jobName}” as applied ✓`);
    else if (reply?.action === 'ask') {
      askApplied(reply.jobName, () => {
        const yes: AutofillMarkAppliedMessage = { type: 'applicliq:autofill-mark-applied' };
        void send(yes).then(() => notice('Marked as applied ✓'));
      });
    }
  }

  function clearNotes() {
    cleanups.forEach((c) => c());
    cleanups = [];
  }

  /** Offers to save what the user types into questions Autofill couldn't fill. */
  function watchAnswers(ids: string[], savedQuestions: string[]) {
    const known: SavedAnswer[] = savedQuestions.map((question, i) => ({
      id: String(i),
      question,
      answer: 'x',
      createdAt: 0,
      updatedAt: 0,
    }));
    for (const id of ids) {
      const ref = scan?.refs.get(id);
      if (
        !ref ||
        !(ref.element instanceof HTMLTextAreaElement || ref.element instanceof HTMLInputElement)
      )
        continue;
      if (hasSavedAnswer(ref.question.label, known)) continue;
      const el = ref.element;
      const onChange = () => {
        const answer = el.value.trim();
        if (answer.length < 2 || !ref.question.label) return;
        offerToSave(ref.container, () => {
          const message: AutofillSaveAnswerMessage = {
            type: 'applicliq:autofill-save-answer',
            question: ref.question.label,
            answer,
          };
          void send(message);
        });
      };
      el.addEventListener('change', onChange);
      cleanups.push(() => el.removeEventListener('change', onChange));
    }
  }

  async function fill(command: Extract<AgentCommand, { type: 'fill' }>): Promise<FillReport> {
    if (!scan) read();
    clearNotes();
    undos = [];
    const report: FillReport = { filled: [], failed: [] };
    const touched: HTMLElement[] = [];
    for (const item of command.items) {
      const ref = scan!.refs.get(item.questionId);
      if (!ref) {
        report.failed.push({ questionId: item.questionId, label: '', reason: 'gone' });
        continue;
      }
      let outcome: FillOutcome;
      try {
        outcome = await fillQuestion(ref, item);
      } catch {
        outcome = { ok: false, reason: 'not-applied' };
      }
      if (outcome.ok) {
        report.filled.push(item.questionId);
        undos.push({ label: ref.question.label, undo: outcome.undo });
        touched.push(ref.element.isConnected ? ref.element : ref.container);
      } else {
        report.failed.push({
          questionId: item.questionId,
          label: ref.question.label,
          reason: outcome.reason,
        });
      }
    }
    // File uploads: pointed at, never filled.
    for (const ref of scan!.refs.values()) {
      if (ref.question.kind === 'file' && /resume|cv|curriculum/i.test(ref.question.label)) {
        cleanups.push(uploadNote(ref.container));
      }
    }
    highlight(touched);
    watchAnswers(command.offerSaveFor, command.savedQuestions);
    signature = signatureOf(scan!.result);
    watch();
    if (command.showBar) {
      filledBar(
        report.filled.length,
        report.filled.length ? () => void undo() : undefined,
        report.failed.length,
      );
    }
    return report;
  }

  async function undo(): Promise<UndoReport> {
    const report: UndoReport = { restored: 0, notRestorable: [] };
    for (const { label, undo: put } of undos.reverse()) {
      if (await put().catch(() => false)) report.restored++;
      else report.notRestorable.push(label);
    }
    undos = [];
    clearNotes();
    return report;
  }

  return {
    scanNow: () => read().result,
    async run(command) {
      switch (command.type) {
        case 'scan': {
          const result = read().result;
          signature = signatureOf(result);
          watch();
          if (result.confirmation) void reportConfirmation();
          return result;
        }
        case 'fill':
          return fill(command);
        case 'undo':
          return undo();
        case 'check-confirmation': {
          const done = detectConfirmation(document, new URL(location.href));
          if (done) void reportConfirmation();
          else watch();
          return done;
        }
      }
    },
  };
}
