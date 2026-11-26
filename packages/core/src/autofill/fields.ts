import { containsAllWords, containsPhrase, normalizeLabel, significantTokens } from './normalize';

/** What a form question asks for, in profile terms. */
export type FieldKey =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'preferredName'
  | 'pronouns'
  | 'email'
  | 'phone'
  /** The country picker next to a phone number (Greenhouse). */
  | 'phoneCountry'
  | 'city'
  | 'country'
  /** "Location": city and country together. */
  | 'location'
  | 'address'
  | 'linkedin'
  | 'github'
  | 'website'
  | 'otherLink'
  | 'currentTitle'
  | 'currentCompany'
  | 'yearsExperience'
  | 'workAuthorized'
  | 'needsSponsorship'
  | 'noticePeriod'
  | 'startDate'
  | 'relocate'
  | 'remotePreference'
  | 'salary'
  | 'school'
  | 'degree'
  | 'fieldOfStudy'
  | 'graduationYear'
  | 'howDidYouHear'
  /** Voluntary self-identification (gender, race/ethnicity, veteran, disability…). */
  | 'eeo';

/** Scores at or above this are filled without asking. */
export const HIGH_CONFIDENCE = 0.75;
/** Scores at or above this (and below high) are offered as "Suggested" in the preview. */
export const MEDIUM_CONFIDENCE = 0.5;

/**
 * A synonym: a normalized phrase and how sure a match makes us (0–1).
 * `anywhere`: the phrase is distinctive enough to count however long the question is
 * ("…require visa sponsorship…"); otherwise a short label scores higher than a long one that
 * merely mentions the phrase.
 */
type Synonym = { p: string; w: number; anywhere?: boolean };

const s = (p: string, w = 0.9, anywhere = false): Synonym => ({ p, w, anywhere });
const any = (p: string, w = 0.9): Synonym => s(p, w, true);

/** Questions about someone else: never filled with the user's name, email or phone. */
const OTHER_PERSON = [
  'reference',
  'referee',
  'emergency',
  'supervisor',
  'manager',
  'referrer',
  'referred',
  'referring',
  'recruiter',
  'parent',
  'guardian',
  'spouse',
  'pi',
  'next of kin',
  'friend',
  'employee who',
];

type FieldDef = { synonyms: Synonym[]; not?: string[] };

/**
 * The synonym table. Phrases are normalized (see `normalizeLabel`). Kept in one place so it's
 * easy to extend; `fields.test.ts` pins the behaviour on real question texts.
 */
export const FIELD_SYNONYMS: Record<FieldKey, FieldDef> = {
  firstName: {
    synonyms: [s('first name', 0.95), s('given name', 0.95), s('forename'), s('first')],
    not: [...OTHER_PERSON, 'preferred', 'last', 'legal name of'],
  },
  lastName: {
    synonyms: [s('last name', 0.95), s('surname', 0.95), s('family name', 0.95), s('last')],
    not: [...OTHER_PERSON, 'first'],
  },
  fullName: {
    synonyms: [
      s('full name', 0.95),
      s('legal name', 0.95),
      s('full legal name', 0.95),
      s('your name', 0.9),
      s('name first and last', 0.95),
      s('first and last name', 0.95),
      s('applicant name', 0.9),
      s('candidate name', 0.9),
      s('name', 0.85),
    ],
    not: [...OTHER_PERSON, 'company', 'school', 'university', 'preferred', 'user name', 'username'],
  },
  preferredName: {
    synonyms: [
      s('preferred name', 0.95),
      s('preferred first name', 0.95),
      any('name youd prefer', 0.9),
      any('name you would prefer', 0.9),
      any('prefer us to use', 0.85),
      any('prefer to go by', 0.9),
      any('prefer to be called', 0.9),
      s('nickname', 0.85),
      s('chosen name', 0.85),
    ],
    not: OTHER_PERSON,
  },
  pronouns: { synonyms: [s('pronouns', 0.95), any('your pronouns', 0.9), s('pronoun', 0.9)] },
  email: {
    synonyms: [
      s('email', 0.9),
      s('email address', 0.95),
      s('e mail', 0.9),
      s('e mail address', 0.95),
      s('mail'),
    ],
    not: [...OTHER_PERSON, 'confirm', 'repeat', 're enter'],
  },
  phone: {
    synonyms: [
      s('phone', 0.9),
      s('phone number', 0.95),
      s('telephone', 0.9),
      s('telephone number', 0.95),
      s('mobile', 0.9),
      s('mobile number', 0.95),
      s('mobile phone', 0.95),
      s('cell', 0.85),
      s('cell phone', 0.9),
      s('contact number', 0.9),
      s('contact telephone number', 0.95),
      s('whatsapp', 0.85),
      s('whatsapp number', 0.9),
      s('phone #', 0.9),
    ],
    not: [...OTHER_PERSON, 'consent', 'text message', 'sms', 'country code'],
  },
  phoneCountry: {
    synonyms: [s('country code', 0.9), s('phone country', 0.9), s('dial code', 0.9)],
  },
  city: {
    synonyms: [
      s('city', 0.9),
      s('town', 0.85),
      s('city of residence', 0.95),
      s('current city', 0.95),
      s('location city', 0.95),
      s('what city', 0.9),
    ],
    not: ['birth', 'office', 'sponsorship', 'authorized', 'authorised', 'visa'],
  },
  country: {
    synonyms: [
      s('country', 0.9),
      s('country of residence', 0.95),
      any('current country of residence', 0.95),
      s('country region', 0.9),
      any('country in which you are located', 0.9),
    ],
    not: ['birth', 'citizenship', 'code', 'authorized', 'authorised', 'eligible', 'sponsorship'],
  },
  location: {
    synonyms: [
      s('location', 0.9),
      s('current location', 0.95),
      any('where are you located', 0.9),
      any('where are you currently located', 0.9),
      any('where are you based', 0.9),
      any('where do you live', 0.85),
      s('based in', 0.6),
      s('place of residence', 0.9),
      s('residence', 0.8),
    ],
    not: [
      'office',
      'preferred',
      'interested',
      'relocate',
      'currently based in',
      'sponsorship',
      'authorized',
      'authorised',
      'visa',
    ],
  },
  address: {
    synonyms: [
      s('address', 0.85),
      s('street address', 0.95),
      s('home address', 0.95),
      s('current address', 0.95),
      s('mailing address', 0.95),
      s('postal address', 0.95),
      any('your current address', 0.9),
    ],
    not: ['email', 'e mail', 'ip', 'web', 'website', ...OTHER_PERSON],
  },
  linkedin: { synonyms: [any('linkedin', 0.95), any('linked in', 0.9)] },
  github: { synonyms: [any('github', 0.95), any('git hub', 0.9)] },
  website: {
    synonyms: [
      s('website', 0.9),
      s('personal website', 0.95),
      s('portfolio', 0.9),
      s('portfolio url', 0.95),
      s('portfolio link', 0.95),
      s('personal site', 0.9),
      s('blog', 0.8),
      s('web site', 0.9),
    ],
    not: ['company', 'other', 'linkedin', 'github'],
  },
  otherLink: { synonyms: [s('other website', 0.9), s('other link', 0.9), s('other url', 0.9)] },
  currentTitle: {
    synonyms: [
      s('current title', 0.95),
      s('current job title', 0.95),
      s('job title', 0.9),
      s('current position', 0.9),
      s('current role', 0.9),
      s('title', 0.6),
      s('position', 0.5),
      s('occupation', 0.8),
      s('designation', 0.8),
    ],
    not: ['interested', 'applying', 'apply', 'desired', 'previous', 'referred'],
  },
  currentCompany: {
    synonyms: [
      s('current company', 0.95),
      s('current employer', 0.95),
      s('company', 0.85),
      s('employer', 0.85),
      s('organization', 0.8),
      s('organisation', 0.8),
      s('affiliation', 0.7),
    ],
    not: ['previous', 'past', 'why', 'worked at', 'worked for', 'consulted', 'agreement', 'email'],
  },
  yearsExperience: {
    synonyms: [
      s('years of experience', 0.95),
      s('years experience', 0.95),
      s('years of work experience', 0.95),
      s('years of professional experience', 0.95),
      s('total experience', 0.85),
      s('experience years', 0.9),
    ],
  },
  workAuthorized: {
    synonyms: [
      any('authorized to work', 0.9),
      any('authorised to work', 0.9),
      any('legally authorized', 0.9),
      any('legally authorised', 0.9),
      any('eligible to work', 0.9),
      any('right to work', 0.9),
      any('work authorization', 0.9),
      any('work authorisation', 0.9),
      any('work permit', 0.85),
      any('permission to work', 0.85),
    ],
    not: ['sponsorship'],
  },
  needsSponsorship: {
    synonyms: [
      any('sponsorship', 0.9),
      any('require sponsorship', 0.95),
      any('visa sponsorship', 0.95),
      any('need a visa', 0.85),
      any('require a visa', 0.85),
    ],
  },
  noticePeriod: {
    synonyms: [any('notice period', 0.95), any('how much notice', 0.9), s('notice', 0.7)],
  },
  startDate: {
    synonyms: [
      any('start date', 0.9),
      any('earliest start', 0.9),
      any('when can you start', 0.9),
      any('available to start', 0.9),
      any('availability to start', 0.9),
      any('date available', 0.85),
      any('when could you start', 0.9),
      s('availability', 0.55),
    ],
    not: ['employment', 'dates of'],
  },
  relocate: {
    synonyms: [any('relocate', 0.9), any('relocation', 0.85), any('willing to move', 0.85)],
    not: ['assistance', 'package', 'support'],
  },
  remotePreference: {
    synonyms: [
      any('remote preference', 0.95),
      any('work preference', 0.85),
      any('workplace preference', 0.9),
      any('work arrangement', 0.85),
      any('prefer to work remotely', 0.9),
      any('remote hybrid or on site', 0.9),
      any('remote or on site', 0.85),
    ],
  },
  salary: {
    synonyms: [
      any('expected salary', 0.95),
      any('salary expectation', 0.95),
      any('salary expectations', 0.95),
      any('desired salary', 0.95),
      any('desired compensation', 0.95),
      any('expected compensation', 0.95),
      any('compensation expectations', 0.95),
      any('compensation expectation', 0.95),
      any('salary requirements', 0.9),
      s('salary', 0.85),
      s('compensation', 0.75),
    ],
    not: ['current salary', 'current compensation'],
  },
  school: {
    synonyms: [
      s('school', 0.9),
      s('university', 0.9),
      s('college', 0.85),
      s('institution', 0.85),
      s('school name', 0.95),
      s('university name', 0.95),
      s('education institution', 0.9),
    ],
    not: ['high school diploma', 'year', 'date'],
  },
  degree: {
    synonyms: [
      s('degree', 0.9),
      s('highest degree', 0.95),
      s('qualification', 0.8),
      s('highest level of education', 0.8),
      s('education level', 0.85),
      s('education', 0.6),
    ],
    not: ['field', 'major', 'year', 'date', 'school', 'university'],
  },
  fieldOfStudy: {
    synonyms: [
      s('field of study', 0.95),
      s('major', 0.85),
      s('discipline', 0.85),
      s('area of study', 0.95),
      s('subject', 0.6),
      s('specialization', 0.8),
    ],
  },
  graduationYear: {
    synonyms: [
      s('graduation year', 0.95),
      s('year of graduation', 0.95),
      s('graduation date', 0.9),
      any('when did you graduate', 0.9),
      s('graduated', 0.75),
    ],
  },
  howDidYouHear: {
    synonyms: [
      any('how did you hear', 0.95),
      any('where did you hear', 0.95),
      any('how did you find', 0.9),
      any('how did you learn about', 0.9),
      any('hear about us', 0.95),
      any('hear about this', 0.95),
      s('referral source', 0.9),
      s('source', 0.6),
    ],
    not: ['name of', 'who referred'],
  },
  eeo: {
    synonyms: [
      any('gender', 0.95),
      any('gender identity', 0.95),
      any('sex', 0.8),
      any('race', 0.9),
      any('ethnicity', 0.95),
      any('ethnic', 0.9),
      any('hispanic', 0.95),
      any('latino', 0.95),
      any('veteran', 0.95),
      any('disability', 0.95),
      any('disabled', 0.9),
      any('sexual orientation', 0.95),
      any('transgender', 0.95),
      any('lgbtq', 0.95),
      any('self identification', 0.95),
      any('self identify', 0.95),
      any('demographic', 0.85),
    ],
    not: ['pronoun'],
  },
};

/** The browser's `autocomplete` tokens, the strongest hint a form can give. */
const AUTOCOMPLETE: Record<string, FieldKey> = {
  'given-name': 'firstName',
  'family-name': 'lastName',
  name: 'fullName',
  nickname: 'preferredName',
  email: 'email',
  tel: 'phone',
  'tel-national': 'phone',
  'country-name': 'country',
  country: 'country',
  'address-level2': 'city',
  'street-address': 'address',
  'address-line1': 'address',
  organization: 'currentCompany',
  'organization-title': 'currentTitle',
  url: 'website',
};

export type FieldMatch = { key: FieldKey; score: number };

export type MatchContext = {
  /** `<input type>`, when the control is an input. */
  inputType?: string;
  autocomplete?: string;
  /** A platform adapter's certain mapping (Greenhouse `first_name`, Lever `urls[GitHub]`…). */
  hint?: FieldKey;
};

/** How well one field's synonyms fit a normalized label (0 = not at all). */
function fieldScore(label: string, def: FieldDef): number {
  if (def.not?.some((n) => containsPhrase(label, n))) return 0;
  const labelWords = Math.max(1, significantTokens(label).length);
  let best = 0;
  for (const { p, w, anywhere } of def.synonyms) {
    let score = 0;
    const phraseWords = Math.max(1, significantTokens(p).length);
    const coverage = Math.min(1, phraseWords / labelWords);
    if (label === p) score = Math.min(1, w + 0.05);
    else if (containsPhrase(label, p)) score = anywhere ? w : w * (0.75 + 0.25 * coverage);
    else if (phraseWords > 1 && containsAllWords(label, p)) {
      score = (anywhere ? w : w * (0.75 + 0.25 * coverage)) * 0.85;
    }
    // Longer phrases win ties: "preferred first name" over "first name".
    if (score) score += 0.005 * phraseWords;
    best = Math.max(best, score);
  }
  return Math.min(1, best);
}

/**
 * Ranks the profile fields a question could be asking for, best first. Only fields scoring at
 * least `MEDIUM_CONFIDENCE` are returned.
 */
export function rankFields(labelText: string, context: MatchContext = {}): FieldMatch[] {
  if (context.hint) return [{ key: context.hint, score: 1 }];
  const fromAutocomplete = context.autocomplete
    ? AUTOCOMPLETE[context.autocomplete.trim().toLowerCase().split(/\s+/).pop() ?? '']
    : undefined;
  const label = normalizeLabel(labelText);
  const out: FieldMatch[] = [];
  for (const [key, def] of Object.entries(FIELD_SYNONYMS) as [FieldKey, FieldDef][]) {
    let score = label ? fieldScore(label, def) : 0;
    if (key === fromAutocomplete) score = Math.max(score, 0.95);
    if (context.inputType === 'email' && key === 'email') score = Math.max(score, 0.8);
    if (
      context.inputType === 'tel' &&
      key === 'phone' &&
      !def.not?.some((n) => containsPhrase(label, n))
    ) {
      score = Math.max(score, 0.8);
    }
    if (score >= MEDIUM_CONFIDENCE) out.push({ key, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * The field a question asks for, with its confidence. When two unrelated fields both fit well
 * ("Email and phone"), the best one drops to medium: the user decides in the preview.
 */
export function matchField(labelText: string, context: MatchContext = {}): FieldMatch | undefined {
  const [best, second] = rankFields(labelText, context);
  if (!best) return undefined;
  if (
    second &&
    best.score >= HIGH_CONFIDENCE &&
    second.score >= HIGH_CONFIDENCE - 0.05 &&
    !RELATED.some((pair) => pair.includes(best.key) && pair.includes(second.key))
  ) {
    return { key: best.key, score: Math.min(best.score, HIGH_CONFIDENCE - 0.01) };
  }
  return best;
}

/** Fields that often fit the same question together without it being ambiguous. */
const RELATED: FieldKey[][] = [
  ['fullName', 'firstName', 'lastName', 'preferredName'],
  ['city', 'location', 'country'],
  ['website', 'otherLink'],
  ['currentTitle', 'currentCompany'],
];

export type Confidence = 'high' | 'medium';

export function confidenceOf(score: number): Confidence | undefined {
  if (score >= HIGH_CONFIDENCE) return 'high';
  if (score >= MEDIUM_CONFIDENCE) return 'medium';
  return undefined;
}
