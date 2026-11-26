/**
 * Autofill's engine, imported as `@applicliq/core/autofill` so it loads only where it's used
 * (the injected form script, the popup's preview). The profile types and storage records are in
 * the main entry (`autofill/profile.ts`, `autofill/sites.ts`).
 */
export * from './answers';
export * from './fields';
export * from './format';
export * from './normalize';
export * from './options';
export * from './plan';
export * from './sites';
export * from './types';
export * from './dom/confirm';
export * from './dom/fill';
export * from './dom/label';
export * from './dom/rules';
export * from './dom/scan';
