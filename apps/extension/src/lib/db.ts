import { AppliCliqDB, createJobRepository } from '@applicliq/core';

/** The extension's IndexedDB; the popup and the background page share it (same origin). */
export const repo = createJobRepository(new AppliCliqDB());
