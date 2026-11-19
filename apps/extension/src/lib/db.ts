import { CareerPocketDB, createJobRepository } from '@career-pocket/core';

/** The extension's IndexedDB; the popup and the background page share it (same origin). */
export const repo = createJobRepository(new CareerPocketDB());
