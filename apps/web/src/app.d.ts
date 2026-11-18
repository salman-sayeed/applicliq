// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  interface ImportMetaEnv {
    /** "Web application" OAuth client ID for Drive sync (see docs/google-setup.md). */
    readonly VITE_GOOGLE_CLIENT_ID?: string;
  }
}

export {};
