import { resumeMatch } from '@applicliq/core/match';

/** Runs Resume match off the main thread (long descriptions or resumes). */
export type MatchRequest = {
  id: number;
  description: string;
  resume: string;
  ignored: string[];
};

/** The worker's global scope (the DOM typings only know `Window`). */
const scope = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<MatchRequest>) => void) | null;
};

scope.onmessage = async (event: MessageEvent<MatchRequest>) => {
  const { id, description, resume, ignored } = event.data;
  try {
    const result = await resumeMatch(description, resume, { ignored });
    scope.postMessage({ id, result });
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
