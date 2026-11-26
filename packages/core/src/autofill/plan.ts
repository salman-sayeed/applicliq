import type { EeoChoice } from '../settings';
import { matchSavedAnswer } from './answers';
import {
  type Confidence,
  type FieldKey,
  HIGH_CONFIDENCE,
  MEDIUM_CONFIDENCE,
  confidenceOf,
  matchField,
} from './fields';
import {
  firstNameOf,
  formatDate,
  formatPhone,
  formatSalary,
  fullNameOf,
  lastNameOf,
  locationOf,
} from './format';
import { normalizeLabel } from './normalize';
import { type OptionKind, findDeclineOption, pickOption, yesNoOf } from './options';

export type { OptionKind };
import type { AutofillProfile, SavedAnswer } from './profile';
import type { ControlKind, ScannedQuestion } from './types';

/**
 * The fill plan: for each question on the page, the value Autofill would put in, how sure it is
 * and where the value comes from, plus the questions it can't fill and why. Pure, so the popup
 * can show it as a preview and the user can change values before anything is written.
 */

export type PlanItem = {
  questionId: string;
  /** The frame the question is in (set by the caller for multi-frame pages). */
  frameId?: number;
  label: string;
  kind: ControlKind;
  /** The value to put in: text, or the option to pick. */
  value: string;
  /** Checkbox groups: every option to tick. */
  values?: string[];
  /** How the filler matches `value` against a dropdown's options (number ranges, yes/no…). */
  optionKind?: OptionKind;
  options: string[];
  confidence: Confidence;
  source: 'profile' | 'answer' | 'eeo';
  field?: FieldKey;
  answerId?: string;
  /** The question already has an answer (filled only with "Overwrite existing values"). */
  hasValue: boolean;
  currentValue: string;
};

export type UnfilledReason =
  /** File upload: the user attaches their resume. */
  | 'file'
  /** Voluntary self-identification, left for the user (Settings → Autofill). */
  | 'eeo'
  /** Consent, terms or an attestation: always the user's to answer. */
  | 'consent'
  /** No profile field or saved answer fits. */
  | 'no-match'
  /** A field fits, but the profile has nothing for it. */
  | 'no-value'
  /** The profile's value isn't one of the choices. */
  | 'no-option';

export type Unfilled = {
  questionId: string;
  frameId?: number;
  label: string;
  kind: ControlKind;
  reason: UnfilledReason;
  field?: FieldKey;
};

export type FillPlan = { items: PlanItem[]; unfilled: Unfilled[]; total: number };

export type PlanInput = {
  profile: AutofillProfile;
  answers: readonly SavedAnswer[];
  eeo: EeoChoice;
};

type Question = ScannedQuestion & { frameId?: number };

const CHOICE_KINDS: readonly ControlKind[] = ['select', 'radio', 'checkbox', 'yesno', 'dropdown'];
const isChoice = (kind: ControlKind) => CHOICE_KINDS.includes(kind);

const OPTION_KIND: Partial<Record<FieldKey, OptionKind>> = {
  country: 'country',
  phoneCountry: 'country',
  location: 'country',
  yearsExperience: 'number',
  workAuthorized: 'yesno',
  needsSponsorship: 'yesno',
  relocate: 'yesno',
};

const YES_NO_TEXT = { yes: 'Yes', no: 'No' } as const;

/** A value, or the reason there's none; `confidence` caps the match's own confidence. */
type Resolved = { value: string; confidence?: Confidence } | { reason: UnfilledReason };

/** Country names the question mentions, compared normalized. */
function mentions(label: string, country: string): boolean {
  const l = ` ${normalizeLabel(label)} `;
  const c = normalizeLabel(country);
  return !!c && l.includes(` ${c} `);
}

function workAuthorizedValue(q: Question, profile: AutofillProfile): Resolved {
  const entries = profile.workAuthorization;
  if (!entries.length) return { reason: 'no-value' };
  const named = entries.find((e) => mentions(q.label, e.country));
  if (named) return { value: named.authorized ? 'yes' : 'no' };
  // "…in the country where the job is located": the user's one country, or the answer they
  // gave for every country, is a good guess, not a certainty.
  const all = new Set(entries.map((e) => e.authorized));
  if (all.size === 1) return { value: entries[0]!.authorized ? 'yes' : 'no', confidence: 'medium' };
  return { reason: 'no-value' };
}

/** "Do you have at least 5 years of experience…?" answered from the profile's years. */
function minimumYearsValue(q: Question, profile: AutofillProfile): Resolved {
  const years = Number(profile.yearsExperience.replace(/[^\d.]/g, ''));
  if (!profile.yearsExperience || !Number.isFinite(years)) return { reason: 'no-value' };
  const need = normalizeLabel(q.label).match(/(\d+(?:\.\d+)?)\s*(?:\+|plus)?\s*years?/);
  if (!need) return { reason: 'no-option' };
  return { value: years >= Number(need[1]) ? 'yes' : 'no', confidence: 'medium' };
}

function yesNo(value: string): Resolved {
  return value ? { value } : { reason: 'no-value' };
}

/** The profile's value for a field, formatted for the question's control. */
function profileValue(field: FieldKey, q: Question, profile: AutofillProfile): Resolved {
  const p = profile;
  const text = (value: string): Resolved =>
    value.trim() ? { value: value.trim() } : { reason: 'no-value' };
  const yesNoQuestion = isChoice(q.kind) && q.options.some((o) => yesNoOf(o));
  switch (field) {
    case 'firstName':
      return text(firstNameOf(p));
    case 'lastName':
      return text(lastNameOf(p));
    case 'fullName':
      return text(fullNameOf(p));
    case 'preferredName':
      return text(p.preferredName || firstNameOf(p));
    case 'pronouns':
      return text(p.pronouns);
    case 'email':
      return text(p.email);
    case 'phone':
      return text(formatPhone(p, { withCountryCode: !q.separateCountryCode }));
    case 'phoneCountry':
      return text(p.country || (p.phoneCountryCode ? `+${p.phoneCountryCode}` : ''));
    case 'city':
      return text(p.city);
    case 'country':
      return text(p.country);
    case 'location':
      return text(locationOf(p));
    case 'address':
      return text(p.address);
    case 'linkedin':
      return text(p.linkedin);
    case 'github':
      return text(p.github);
    case 'website':
      return text(p.website);
    case 'otherLink':
      return text(p.otherLinks[0]?.url ?? '');
    case 'currentTitle':
      return text(p.currentTitle);
    case 'currentCompany':
      return text(p.currentCompany);
    case 'yearsExperience':
      return yesNoQuestion ? minimumYearsValue(q, p) : text(p.yearsExperience);
    case 'workAuthorized':
      return workAuthorizedValue(q, p);
    case 'needsSponsorship':
      return yesNo(p.needsSponsorship);
    case 'relocate':
      return yesNo(p.willingToRelocate);
    case 'noticePeriod':
      return text(p.noticePeriod);
    case 'startDate': {
      if (p.earliestStartDate) {
        if (q.kind === 'date' || q.kind === 'text') {
          const kindForDate = q.kind === 'date' ? q.inputType : undefined;
          const placeholder = q.dateFormat ?? q.placeholder;
          return {
            value: formatDate(p.earliestStartDate, { inputType: kindForDate, placeholder }),
          };
        }
        return { value: p.earliestStartDate };
      }
      // A free-text "When can you start?" can take the notice period.
      return q.kind === 'text' || q.kind === 'textarea'
        ? text(p.noticePeriod)
        : { reason: 'no-value' };
    }
    case 'remotePreference': {
      const words = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site', any: 'Open to any' };
      return p.remotePreference ? { value: words[p.remotePreference] } : { reason: 'no-value' };
    }
    case 'salary':
      return text(formatSalary(p, { numeric: q.kind === 'number' || q.inputType === 'number' }));
    case 'school':
      return text(p.school);
    case 'degree':
      return text(p.degree);
    case 'fieldOfStudy':
      return text(p.fieldOfStudy);
    case 'graduationYear':
      return text(p.graduationYear);
    case 'howDidYouHear':
      return text(p.howDidYouHear);
    case 'eeo':
      return { reason: 'eeo' };
  }
}

/** Turns a resolved value into the text or option the control takes. */
function fitToControl(
  q: Question,
  field: FieldKey | undefined,
  value: string,
): { value: string; values?: string[]; optionKind?: OptionKind } | undefined {
  const kind = OPTION_KIND[field ?? 'fullName'] ?? 'text';
  const isYesNoValue = value === 'yes' || value === 'no';
  if (!isChoice(q.kind)) {
    if (isYesNoValue) return { value: YES_NO_TEXT[value] };
    return { value };
  }
  // A dropdown that loads its options as you type: the filler searches for the text.
  if (!q.options.length) {
    if (q.kind !== 'dropdown') return undefined;
    if (isYesNoValue) return { value: YES_NO_TEXT[value], optionKind: 'yesno' };
    return { value, ...(kind !== 'text' ? { optionKind: kind } : {}) };
  }
  if (q.kind === 'checkbox' && q.multiple) {
    const picked = pickOption(value, q.options, isYesNoValue ? 'yesno' : kind);
    return picked ? { value: picked, values: [picked] } : undefined;
  }
  const picked = pickOption(value, q.options, isYesNoValue ? 'yesno' : kind);
  return picked ? { value: picked } : undefined;
}

const minConfidence = (a: Confidence, b: Confidence | undefined): Confidence =>
  a === 'medium' || b === 'medium' ? 'medium' : 'high';

/** Builds the plan for a page's questions (from one or several frames). */
export function buildPlan(questions: readonly Question[], input: PlanInput): FillPlan {
  const items: PlanItem[] = [];
  const unfilled: Unfilled[] = [];
  const base = (q: Question) => ({
    questionId: q.id,
    ...(q.frameId !== undefined ? { frameId: q.frameId } : {}),
    label: q.label,
    kind: q.kind,
  });

  for (const q of questions) {
    if (q.kind === 'file') {
      unfilled.push({ ...base(q), reason: 'file' });
      continue;
    }
    if (q.consent) {
      unfilled.push({ ...base(q), reason: 'consent' });
      continue;
    }
    const hasValue = q.currentValue.trim() !== '';
    const match = matchField(q.label, {
      inputType: q.inputType,
      autocomplete: q.autocomplete,
      hint: q.hint,
    });
    const matchConfidence = match ? confidenceOf(match.score) : undefined;

    // Voluntary self-identification: the user's answers are never stored. "Decline" picks the
    // decline option when the question has one; otherwise it's left for the user.
    if (match?.key === 'eeo' && match.score >= HIGH_CONFIDENCE) {
      // A dropdown that shows its options only when opened: the filler looks for one there.
      const unknownOptions = q.kind === 'dropdown' && !q.options.length;
      const decline =
        input.eeo !== 'decline' || !isChoice(q.kind)
          ? undefined
          : unknownOptions
            ? 'Decline to self-identify'
            : findDeclineOption(q.options);
      if (decline) {
        items.push({
          ...base(q),
          value: decline,
          ...(unknownOptions ? { optionKind: 'decline' as const } : {}),
          ...(q.kind === 'checkbox' ? { values: [decline] } : {}),
          options: q.options,
          confidence: 'high',
          source: 'eeo',
          field: 'eeo',
          hasValue,
          currentValue: q.currentValue,
        });
      } else {
        unfilled.push({ ...base(q), reason: 'eeo', field: 'eeo' });
      }
      continue;
    }

    let reason: UnfilledReason = 'no-match';
    let fromProfile: PlanItem | undefined;
    if (match && matchConfidence && match.key !== 'eeo') {
      const resolved = profileValue(match.key, q, input.profile);
      if ('reason' in resolved) reason = resolved.reason;
      else {
        const fitted = fitToControl(q, match.key, resolved.value);
        if (!fitted) reason = 'no-option';
        else {
          fromProfile = {
            ...base(q),
            ...fitted,
            options: q.options,
            confidence: minConfidence(matchConfidence, resolved.confidence),
            source: 'profile',
            field: match.key,
            hasValue,
            currentValue: q.currentValue,
          };
        }
      }
    }

    // A saved answer, when no profile field fits as well.
    let fromAnswer: PlanItem | undefined;
    const saved = matchSavedAnswer(q.label, input.answers, MEDIUM_CONFIDENCE);
    if (
      saved &&
      (!fromProfile || (fromProfile.confidence === 'medium' && saved.score >= HIGH_CONFIDENCE))
    ) {
      const fitted = fitToControl(q, undefined, saved.answer.answer);
      const confidence = confidenceOf(saved.score);
      if (fitted && confidence) {
        fromAnswer = {
          ...base(q),
          ...fitted,
          options: q.options,
          confidence,
          source: 'answer',
          answerId: saved.answer.id,
          hasValue,
          currentValue: q.currentValue,
        };
      }
    }

    const item = fromAnswer ?? fromProfile;
    if (item) items.push(item);
    else unfilled.push({ ...base(q), reason, ...(match ? { field: match.key } : {}) });
  }
  return { items, unfilled, total: questions.length };
}

/** How many questions a fill would answer: high-confidence items (plus empty-only unless overwriting). */
export function fillableItems(plan: FillPlan, { overwrite = false } = {}): PlanItem[] {
  return plan.items.filter((i) => i.confidence === 'high' && (overwrite || !i.hasValue));
}

/** Words for why a question was left, as the preview shows them. */
export const UNFILLED_REASONS: Record<UnfilledReason, string> = {
  file: 'Attach your resume here yourself',
  eeo: 'Voluntary question, left for you',
  consent: 'Consent or terms: yours to answer',
  'no-match': 'Nothing in your profile fits',
  'no-value': 'Not in your profile yet',
  'no-option': 'Your answer isn’t one of the choices',
};
