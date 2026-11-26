import { isFeatureEnabled } from '../features';
import type { Settings } from '../settings';

/**
 * Autofill (feature `autofill`): the user's profile and saved answers. Kept in this browser's
 * IndexedDB (table `autofill`); synced to the user's own Google Drive only when
 * `settings.autofill.syncProfile` is on. Never sent anywhere else, and only used to fill forms
 * the user chooses to fill.
 *
 * This file is small and loaded everywhere (storage, sync); the form-filling engine lives in
 * `@applicliq/core/autofill` and is loaded on demand.
 */

export type YesNo = '' | 'yes' | 'no';
export type RemotePreference = '' | 'remote' | 'hybrid' | 'onsite' | 'any';

/** A country the user can (or can't) work in. */
export type WorkAuthorization = { country: string; authorized: boolean };
export type ProfileLink = { label: string; url: string };

/** Every field is optional: an empty string means "not given". */
export type AutofillProfile = {
  firstName: string;
  lastName: string;
  /** Used where a form asks for one name field; built from first + last when empty. */
  fullName: string;
  preferredName: string;
  pronouns: string;
  email: string;
  /** Country calling code, digits only (`44`), shown as `+44`. */
  phoneCountryCode: string;
  phoneNumber: string;
  city: string;
  country: string;
  address: string;
  linkedin: string;
  github: string;
  website: string;
  otherLinks: ProfileLink[];
  currentTitle: string;
  currentCompany: string;
  yearsExperience: string;
  workAuthorization: WorkAuthorization[];
  needsSponsorship: YesNo;
  noticePeriod: string;
  /** `YYYY-MM-DD`. */
  earliestStartDate: string;
  willingToRelocate: YesNo;
  remotePreference: RemotePreference;
  salaryAmount: string;
  salaryCurrency: string;
  salaryPeriod: '' | 'hour' | 'month' | 'year';
  school: string;
  degree: string;
  fieldOfStudy: string;
  graduationYear: string;
  howDidYouHear: string;
};

export const EMPTY_PROFILE: AutofillProfile = {
  firstName: '',
  lastName: '',
  fullName: '',
  preferredName: '',
  pronouns: '',
  email: '',
  phoneCountryCode: '',
  phoneNumber: '',
  city: '',
  country: '',
  address: '',
  linkedin: '',
  github: '',
  website: '',
  otherLinks: [],
  currentTitle: '',
  currentCompany: '',
  yearsExperience: '',
  workAuthorization: [],
  needsSponsorship: '',
  noticePeriod: '',
  earliestStartDate: '',
  willingToRelocate: '',
  remotePreference: '',
  salaryAmount: '',
  salaryCurrency: '',
  salaryPeriod: '',
  school: '',
  degree: '',
  fieldOfStudy: '',
  graduationYear: '',
  howDidYouHear: '',
};

/** A question and the user's answer, matched to form questions by similarity. */
export type SavedAnswer = {
  id: string;
  question: string;
  answer: string;
  createdAt: number;
  updatedAt: number;
};

/** The one profile row. */
export const PROFILE_ID = 'profile';

export type ProfileRecord = { id: typeof PROFILE_ID; profile: AutofillProfile; updatedAt: number };
export type AnswerRecord = SavedAnswer & { kind: 'answer' };
export type AutofillTombstone = { id: string; deletedAt: number };
/** A row of the `autofill` table (and of `autofill` in the Drive file when it syncs). */
export type AutofillRecord = ProfileRecord | AnswerRecord | AutofillTombstone;

export const MAX_ANSWER_LENGTH = 10_000;
export const MAX_QUESTION_LENGTH = 500;
const MAX_FIELD = 500;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown, max = MAX_FIELD) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T =>
  list.includes(v as T) ? (v as T) : list[0]!;

/** A clean profile from untrusted input (storage, Drive, a backup); unknown keys are dropped. */
export function sanitizeProfile(value: unknown): AutofillProfile {
  const v = isObject(value) ? value : {};
  const links = Array.isArray(v.otherLinks) ? v.otherLinks : [];
  const auth = Array.isArray(v.workAuthorization) ? v.workAuthorization : [];
  return {
    ...EMPTY_PROFILE,
    firstName: str(v.firstName, 100),
    lastName: str(v.lastName, 100),
    fullName: str(v.fullName, 200),
    preferredName: str(v.preferredName, 100),
    pronouns: str(v.pronouns, 40),
    email: str(v.email, 254),
    phoneCountryCode: str(v.phoneCountryCode, 6).replace(/\D/g, ''),
    phoneNumber: str(v.phoneNumber, 40),
    city: str(v.city, 120),
    country: str(v.country, 120),
    address: str(v.address),
    linkedin: str(v.linkedin),
    github: str(v.github),
    website: str(v.website),
    otherLinks: links
      .filter(isObject)
      .map((l) => ({ label: str(l.label, 60), url: str(l.url) }))
      .filter((l) => l.url)
      .slice(0, 20),
    currentTitle: str(v.currentTitle, 120),
    currentCompany: str(v.currentCompany, 120),
    yearsExperience: str(v.yearsExperience, 10),
    workAuthorization: auth
      .filter(isObject)
      .map((a) => ({ country: str(a.country, 120), authorized: a.authorized === true }))
      .filter((a) => a.country)
      .slice(0, 50),
    needsSponsorship: oneOf(v.needsSponsorship, ['', 'yes', 'no'] as const),
    noticePeriod: str(v.noticePeriod, 100),
    earliestStartDate: /^\d{4}-\d{2}-\d{2}$/.test(str(v.earliestStartDate))
      ? str(v.earliestStartDate)
      : '',
    willingToRelocate: oneOf(v.willingToRelocate, ['', 'yes', 'no'] as const),
    remotePreference: oneOf(v.remotePreference, ['', 'remote', 'hybrid', 'onsite', 'any'] as const),
    salaryAmount: str(v.salaryAmount, 20),
    salaryCurrency: /^[A-Za-z]{3}$/.test(str(v.salaryCurrency))
      ? str(v.salaryCurrency).toUpperCase()
      : '',
    salaryPeriod: oneOf(v.salaryPeriod, ['', 'hour', 'month', 'year'] as const),
    school: str(v.school, 200),
    degree: str(v.degree, 120),
    fieldOfStudy: str(v.fieldOfStudy, 120),
    graduationYear: /^\d{4}$/.test(str(v.graduationYear)) ? str(v.graduationYear) : '',
    howDidYouHear: str(v.howDidYouHear, 200),
  };
}

/** Whether the profile has anything in it. */
export function isProfileEmpty(profile: AutofillProfile): boolean {
  return Object.entries(profile).every(([, v]) => (Array.isArray(v) ? !v.length : !v));
}

/**
 * Checks one record from outside this device. Tombstones are reduced to `{ id, deletedAt }`;
 * unusable records give undefined.
 */
export function sanitizeAutofillRecord(value: unknown): AutofillRecord | undefined {
  if (!isObject(value) || typeof value.id !== 'string' || !value.id) return undefined;
  if (isTime(value.deletedAt)) return { id: value.id, deletedAt: value.deletedAt };
  if (value.deletedAt !== undefined && value.deletedAt !== null) return undefined;
  if (!isTime(value.updatedAt)) return undefined;
  if (value.id === PROFILE_ID) {
    return { id: PROFILE_ID, profile: sanitizeProfile(value.profile), updatedAt: value.updatedAt };
  }
  if (value.kind !== 'answer' || !isTime(value.createdAt)) return undefined;
  const question = str(value.question, MAX_QUESTION_LENGTH);
  const answer = typeof value.answer === 'string' ? value.answer.slice(0, MAX_ANSWER_LENGTH) : '';
  if (!question) return undefined;
  return {
    id: value.id,
    kind: 'answer',
    question,
    answer,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function sanitizeAutofillRecords(values: unknown): AutofillRecord[] {
  if (!Array.isArray(values)) return [];
  return values.map(sanitizeAutofillRecord).filter((r): r is AutofillRecord => r !== undefined);
}

export function isAnswerRecord(record: AutofillRecord): record is AnswerRecord {
  return 'kind' in record && record.kind === 'answer' && !('deletedAt' in record);
}

export function isProfileRecord(record: AutofillRecord): record is ProfileRecord {
  return record.id === PROFILE_ID && 'profile' in record;
}

/** Whether the profile and saved answers go to Google Drive (the user's explicit choice). */
export function autofillSyncEnabled(settings: Pick<Settings, 'autofill'>): boolean {
  return settings.autofill.syncProfile;
}

/** Whether Autofill is on: the feature switch (device-scoped). */
export function isAutofillEnabled(settings: Pick<Settings, 'features'>): boolean {
  return isFeatureEnabled(settings, 'autofill');
}
