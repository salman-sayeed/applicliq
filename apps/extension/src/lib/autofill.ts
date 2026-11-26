import { AUTOFILL_ORIGINS, isSubToggleOn } from '@applicliq/core';
import type { ScanResult, ScannedQuestion } from '@applicliq/core/autofill';
import type { AgentCommand, AgentReply, FillItem, FillReport, UndoReport } from './autofill-agent';
import { repo } from './db';

/**
 * Autofill from the popup or sidebar: injects the agent into every frame of the active tab
 * (`activeTab` covers the tab's own frames; iframes from other sites need their access, asked
 * for with a click), scans, fills and undoes. Also registers the optional on-page button.
 */

export type FrameQuestion = ScannedQuestion & { frameId: number };

export type TabScan = {
  questions: FrameQuestion[];
  /** The top frame's (or the form frame's) platform and title. */
  platform?: ScanResult['platform'];
  title?: string;
  url: string;
  confirmation: boolean;
  /** Form iframes AppliCliq couldn't read (another site): their origins, to ask access for. */
  blockedOrigins: string[];
};

type Injection = { frameId: number; result: AgentReply };

async function inject(tabId: number): Promise<void> {
  try {
    await browser.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['/content-scripts/autofill.js'],
    });
  } catch {
    // Some browsers refuse the whole call when one frame can't be scripted: the top frame alone.
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/autofill.js'],
    });
  }
}

/** Runs one command in the agent of each frame (or the given frames). */
async function run(
  tabId: number,
  command: AgentCommand,
  frameIds?: number[],
): Promise<Injection[]> {
  const target = frameIds ? { tabId, frameIds } : { tabId, allFrames: true };
  const results = await browser.scripting.executeScript({
    target,
    args: [command],
    // Runs in the page's isolated world, where the injected agent left itself.
    func: (cmd: unknown) => {
      const agent = (
        globalThis as unknown as Record<string, { run(c: unknown): Promise<unknown> } | undefined>
      ).__applicliqAutofill;
      return agent ? agent.run(cmd) : undefined;
    },
  });
  return results.map((r) => ({ frameId: r.frameId ?? 0, result: r.result as AgentReply }));
}

const originOf = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
};

/** Reads the form in every frame of the tab. Throws when the page can't be scripted. */
export async function scanTab(tabId: number): Promise<TabScan> {
  await inject(tabId);
  const results = await run(tabId, { type: 'scan' });
  const scans = results.filter((r): r is { frameId: number; result: ScanResult } => {
    const value = r.result as ScanResult | undefined;
    return !!value && Array.isArray(value.questions);
  });
  const top = scans.find((s) => s.frameId === 0)?.result;
  // The frame with the most questions names the platform (a Greenhouse embed in a career site).
  const main = [...scans].sort((a, b) => b.result.questions.length - a.result.questions.length)[0]
    ?.result;
  const read = new Set(scans.map((s) => originOf(s.result.url)));
  const blockedOrigins = [
    ...new Set(
      scans.flatMap((s) => s.result.formFrames.map(originOf)).filter((o) => o && !read.has(o)),
    ),
  ];
  return {
    questions: scans.flatMap((s) => s.result.questions.map((q) => ({ ...q, frameId: s.frameId }))),
    platform: main?.platform ?? top?.platform,
    title: main?.title ?? top?.title,
    url: top?.url ?? main?.url ?? '',
    confirmation: scans.some((s) => s.result.confirmation),
    blockedOrigins,
  };
}

/** Fills the items, frame by frame. */
export async function fillTab(
  tabId: number,
  items: (FillItem & { frameId: number })[],
  extra: { offerSaveFor: FrameQuestion[]; savedQuestions: string[] },
): Promise<FillReport> {
  const frames = [
    ...new Set([...items.map((i) => i.frameId), ...extra.offerSaveFor.map((q) => q.frameId)]),
  ];
  const report: FillReport = { filled: [], failed: [] };
  for (const frameId of frames) {
    const [result] = await run(
      tabId,
      {
        type: 'fill',
        items: items
          .filter((i) => i.frameId === frameId)
          .map(({ frameId: _frame, ...item }) => item),
        offerSaveFor: extra.offerSaveFor.filter((q) => q.frameId === frameId).map((q) => q.id),
        savedQuestions: extra.savedQuestions,
      },
      [frameId],
    );
    const r = result?.result as FillReport | undefined;
    if (!r) continue;
    report.filled.push(...r.filled.map((id) => `${frameId}:${id}`));
    report.failed.push(
      ...r.failed.map((f) => ({ ...f, questionId: `${frameId}:${f.questionId}` })),
    );
  }
  return report;
}

export async function undoTab(tabId: number, frameIds: number[]): Promise<UndoReport> {
  const out: UndoReport = { restored: 0, notRestorable: [] };
  for (const r of await run(tabId, { type: 'undo' }, frameIds)) {
    const report = r.result as UndoReport | undefined;
    if (!report) continue;
    out.restored += report.restored;
    out.notRestorable.push(...report.notRestorable);
  }
  return out;
}

/** Asks for access to a form iframe's site. Call from a click. */
export function requestFrameAccess(origin: string): Promise<boolean> {
  return browser.permissions.request({ origins: [`${origin}/*`] });
}

/** Whether AppliCliq can see this page after the user submits (for "Mark as applied?"). */
export async function canWatchConfirmation(url: string): Promise<boolean> {
  const origin = originOf(url);
  if (!origin) return false;
  return browser.permissions.contains({ origins: [`${origin}/*`] }).catch(() => false);
}

// --- The on-page button -------------------------------------------------------------------------

const BUTTON_SCRIPT_ID = 'applicliq-autofill-button';

/** Where the button runs: the supported sites (only Google's form pages on docs.google.com). */
const BUTTON_MATCHES = AUTOFILL_ORIGINS.map((o) =>
  o === 'https://docs.google.com/*' ? 'https://docs.google.com/forms/*' : o,
);

/**
 * Registers the button's content script when Autofill and "Show Autofill button" are on and the
 * sites' access is granted; unregisters it otherwise. Safe to call any time.
 */
export async function syncAutofillButton(): Promise<void> {
  const scripting = browser.scripting;
  if (!scripting?.registerContentScripts) return;
  const settings = await repo.getSettings();
  const wanted =
    isSubToggleOn(settings, 'autofill', { section: 'autofill', key: 'showButton' }) &&
    (await browser.permissions.contains({ origins: [...AUTOFILL_ORIGINS] }).catch(() => false));
  const registered = await scripting
    .getRegisteredContentScripts({ ids: [BUTTON_SCRIPT_ID] })
    .catch(() => []);
  if (wanted && !registered.length) {
    await scripting
      .registerContentScripts([
        {
          id: BUTTON_SCRIPT_ID,
          matches: BUTTON_MATCHES,
          js: ['content-scripts/autofill-button.js'],
          allFrames: true,
          runAt: 'document_idle',
        },
      ])
      .catch(() => {});
  } else if (!wanted && registered.length) {
    await scripting.unregisterContentScripts({ ids: [BUTTON_SCRIPT_ID] }).catch(() => {});
  }
}
