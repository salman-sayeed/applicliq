import type { MatchResult } from '@applicliq/core/match';
import type { MatchRequest } from './match.worker';

/**
 * Resume match for the UI. Short texts (nearly always: descriptions are capped at 20 KB) are
 * matched right here, which takes a few milliseconds; long ones go to a web worker so typing and
 * scrolling stay smooth. Both load the matcher and the dictionary lazily.
 */
const WORKER_THRESHOLD = 40_000;

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, (reply: { result?: MatchResult; error?: string }) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./match.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (
      event: MessageEvent<{ id: number; result?: MatchResult; error?: string }>,
    ) => {
      pending.get(event.data.id)?.(event.data);
      pending.delete(event.data.id);
    };
  }
  return worker;
}

function inWorker(request: Omit<MatchRequest, 'id'>): Promise<MatchResult> {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, ({ result, error }) => (result ? resolve(result) : reject(new Error(error))));
    const w = getWorker();
    w.onerror = () => {
      pending.delete(id);
      reject(new Error('worker failed'));
    };
    w.postMessage({ id, ...request });
  });
}

export async function runResumeMatch(
  description: string,
  resume: string,
  ignored: readonly string[],
): Promise<MatchResult> {
  const request = { description, resume, ignored: [...ignored] };
  if (description.length + resume.length > WORKER_THRESHOLD && typeof Worker !== 'undefined') {
    try {
      return await inWorker(request);
    } catch {
      // No worker (blocked, or an old browser): match here instead.
    }
  }
  const { resumeMatch } = await import('@applicliq/core/match');
  return resumeMatch(description, resume, { ignored: request.ignored });
}
