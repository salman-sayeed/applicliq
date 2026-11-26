import type { FieldKey } from './fields';

/** How a question is answered on the page. */
export type ControlKind =
  | 'text'
  | 'textarea'
  | 'email'
  | 'tel'
  | 'url'
  | 'number'
  /** A date: native `<input type="date">`, or a text field with a date picker. */
  | 'date'
  | 'select'
  /** One choice from native or ARIA radios (Google Forms, Microsoft Forms, Lever…). */
  | 'radio'
  /** One or more choices from checkboxes. */
  | 'checkbox'
  /** Yes / No buttons (Ashby). */
  | 'yesno'
  /** A custom dropdown: react-select (Greenhouse), Google Forms' listbox, Microsoft Forms'. */
  | 'dropdown'
  /** A file upload: never filled, pointed out instead. */
  | 'file';

/** A question found on the page. Plain data: crosses from the page to the popup. */
export type ScannedQuestion = {
  /** Unique within one scan of one frame. */
  id: string;
  /** The question as the page shows it. */
  label: string;
  kind: ControlKind;
  /** Choices, where the page lists them (dropdowns that load options as you type have none). */
  options: string[];
  /** Checkbox groups that take several answers. */
  multiple: boolean;
  required: boolean;
  /** What's in it now ('' when empty; option text for choices). */
  currentValue: string;
  /** For text fields: the input type, placeholder and autocomplete hint. */
  inputType?: string;
  placeholder?: string;
  autocomplete?: string;
  /** A platform adapter's certain mapping. */
  hint?: FieldKey;
  /** For text date fields: the format the picker reads (when the placeholder doesn't say). */
  dateFormat?: string;
  /** The form has a separate phone country-code picker (the phone number goes without it). */
  separateCountryCode?: boolean;
  /** Consent, terms, attestation: never filled. */
  consent?: boolean;
};

export type ScanResult = {
  url: string;
  /** Platform name, when the page is one Autofill knows. */
  platform?: import('./sites').AutofillPlatform;
  /** The form's title (Google/Microsoft Forms), for "Create a new job". */
  title?: string;
  questions: ScannedQuestion[];
  /** Iframes that look like application forms (Greenhouse embeds) this frame contains. */
  formFrames: string[];
  /** Whether this page is an application's confirmation page. */
  confirmation: boolean;
};
