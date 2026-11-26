import { describe, expect, it } from 'vitest';
import { answerScore, hasSavedAnswer, matchSavedAnswer } from './answers';
import { HIGH_CONFIDENCE, MEDIUM_CONFIDENCE, confidenceOf, matchField, rankFields } from './fields';
import {
  dateOrderFromPlaceholder,
  formatDate,
  formatPhone,
  formatSalary,
  fullNameOf,
} from './format';
import { normalizeLabel, wordSimilarity } from './normalize';
import { findDeclineOption, pickOption, yesNoOf } from './options';
import type { SavedAnswer } from './profile';
import { TEST_PROFILE } from './test-profile';

describe('normalizeLabel', () => {
  it('lowercases, drops accents, punctuation, markers and filler', () => {
    expect(normalizeLabel('First Name *')).toBe('first name');
    expect(normalizeLabel('  E-mail Address (required) ')).toBe('e mail address');
    expect(normalizeLabel('Téléphone portable:')).toBe('telephone portable');
    expect(normalizeLabel('Preferred Name (if applicable)')).toBe('preferred name');
    expect(normalizeLabel("What's the name you'd prefer?")).toBe('whats the name youd prefer');
    expect(normalizeLabel('Phone #')).toBe('phone #');
  });

  it('compares wording by meaningful words', () => {
    expect(wordSimilarity('Tell us about yourself', 'Tell me about yourself')).toBe(1);
    expect(wordSimilarity('Why are you looking for a new role?', 'Favourite colour')).toBe(0);
  });
});

describe('matchField: synonyms and confidence', () => {
  const key = (label: string, ctx = {}) => matchField(label, ctx)?.key;
  const score = (label: string, ctx = {}) => matchField(label, ctx)?.score ?? 0;

  it.each([
    ['First Name', 'firstName'],
    ['Given name', 'firstName'],
    ['Surname', 'lastName'],
    ['Legal Name', 'fullName'],
    ['Name (First and Last)', 'fullName'],
    ['Preferred First Name', 'preferredName'],
    ["What's the name you'd prefer us to use throughout the interview process?", 'preferredName'],
    ['Email address', 'email'],
    ['Mobile number', 'phone'],
    ['Contact telephone number', 'phone'],
    ['WhatsApp', 'phone'],
    ['LinkedIn Profile', 'linkedin'],
    ['GitHub URL', 'github'],
    ['Portfolio URL', 'website'],
    ['Current company', 'currentCompany'],
    ['Current job title', 'currentTitle'],
    ['What is your current country of residence?', 'country'],
    ['Where are you currently located?', 'location'],
    ['Are you legally authorized to work in the United States?', 'workAuthorized'],
    ['Will you now or in the future require visa sponsorship?', 'needsSponsorship'],
    ['What is your notice period?', 'noticePeriod'],
    ['When can you start a new role?', 'startDate'],
    ['Are you willing to relocate?', 'relocate'],
    ['What are your salary expectations?', 'salary'],
    ['How did you hear about us?', 'howDidYouHear'],
    ['Field of study', 'fieldOfStudy'],
    ['Graduation year', 'graduationYear'],
    ['Gender', 'eeo'],
    ['Are you Hispanic/Latino?', 'eeo'],
    ['Veteran Status', 'eeo'],
    ['Disability status', 'eeo'],
  ])('%s → %s', (label, expected) => {
    expect(key(label)).toBe(expected);
    expect(score(label)).toBeGreaterThanOrEqual(HIGH_CONFIDENCE);
  });

  it('never gives the user’s name, email or phone to questions about someone else', () => {
    expect(key('Emergency contact phone')).not.toBe('phone');
    expect(key('PI/Supervisor’s email')).toBeUndefined();
    expect(key('Reference name')).toBeUndefined();
    expect(key('Who referred you? (name)')).not.toBe('fullName');
  });

  it('does not confuse similar wording', () => {
    expect(key('Email address')).not.toBe('address');
    expect(key('Position you are interested in')).not.toBe('currentTitle');
    expect(key('Company name you are applying to')).toBe('currentCompany');
    expect(key('Have you previously worked at or consulted for GitLab?')).toBeUndefined();
    expect(key('Are you currently based in Bangalore?')).toBeUndefined();
  });

  it('scores short exact labels above long questions that mention a word', () => {
    expect(score('City')).toBeGreaterThan(
      score('In which city would you like to work most days of the week?'),
    );
    expect(confidenceOf(score('Title'))).toBe('medium');
  });

  it('lowers two unrelated good fits to "Suggested"', () => {
    const match = matchField('Email and Phone #');
    expect(match && confidenceOf(match.score)).toBe('medium');
  });

  it('uses adapter hints, autocomplete and input types', () => {
    expect(matchField('Anything', { hint: 'github' })).toEqual({ key: 'github', score: 1 });
    expect(key('Your details', { autocomplete: 'given-name' })).toBe('firstName');
    expect(key('Contact', { inputType: 'email' })).toBe('email');
    expect(key('Emergency contact', { inputType: 'tel' })).not.toBe('phone');
  });

  it('ranks fields with a threshold', () => {
    expect(rankFields('Favourite ice cream')).toEqual([]);
    expect(confidenceOf(HIGH_CONFIDENCE)).toBe('high');
    expect(confidenceOf(MEDIUM_CONFIDENCE)).toBe('medium');
    expect(confidenceOf(MEDIUM_CONFIDENCE - 0.01)).toBeUndefined();
  });
});

describe('formatting values', () => {
  it('formats a phone number with or without its country code', () => {
    expect(formatPhone(TEST_PROFILE)).toBe('+44 7700 900123');
    expect(formatPhone(TEST_PROFILE, { withCountryCode: false })).toBe('07700 900123');
    expect(formatPhone({ phoneCountryCode: '1', phoneNumber: '+1 415 555 0100' })).toBe(
      '+1 415 555 0100',
    );
    expect(
      formatPhone(
        { phoneCountryCode: '1', phoneNumber: '+1 415 555 0100' },
        { withCountryCode: false },
      ),
    ).toBe('415 555 0100');
    expect(formatPhone({ phoneCountryCode: '', phoneNumber: '555 0100' })).toBe('555 0100');
    expect(formatPhone({ phoneCountryCode: '44', phoneNumber: '' })).toBe('');
  });

  it('formats dates for native inputs and for placeholders', () => {
    expect(formatDate('2027-03-14', { inputType: 'date' })).toBe('2027-03-14');
    expect(formatDate('2027-03-14', { placeholder: 'Please input date (M/d/yyyy)' })).toBe(
      '3/14/2027',
    );
    expect(formatDate('2027-03-04', { placeholder: 'DD/MM/YYYY' })).toBe('04/03/2027');
    expect(formatDate('2027-03-04', { placeholder: 'dd.mm.yyyy' })).toBe('04.03.2027');
    expect(formatDate('2027-03-04', { placeholder: 'MM/dd/yyyy' })).toBe('03/04/2027');
    expect(formatDate('2027-03-04', { placeholder: 'Pick date...' })).toBe('2027-03-04');
    expect(formatDate('not a date')).toBe('');
    expect(dateOrderFromPlaceholder('yyyy-mm-dd')).toMatchObject({ order: 'ymd', sep: '-' });
  });

  it('formats a salary as a number or with currency and period', () => {
    expect(formatSalary(TEST_PROFILE)).toBe('85,000 GBP per year');
    expect(formatSalary(TEST_PROFILE, { numeric: true })).toBe('85000');
    expect(formatSalary({ salaryAmount: '$120k', salaryCurrency: '', salaryPeriod: '' })).toBe(
      '120',
    );
    expect(formatSalary({ salaryAmount: '', salaryCurrency: 'EUR', salaryPeriod: 'year' })).toBe(
      '',
    );
  });

  it('builds a full name from first and last', () => {
    expect(fullNameOf({ fullName: '', firstName: 'Ada', lastName: 'Lovelace' })).toBe(
      'Ada Lovelace',
    );
    expect(fullNameOf({ fullName: 'Augusta Ada King', firstName: 'Ada', lastName: '' })).toBe(
      'Augusta Ada King',
    );
  });
});

describe('pickOption', () => {
  it('reads yes / no answers', () => {
    expect(yesNoOf('Yes, I am authorized')).toBe('yes');
    expect(yesNoOf("No, I don't need sponsorship")).toBe('no');
    expect(yesNoOf('Not applicable')).toBe('no');
    expect(pickOption('yes', ['--', 'No', 'Yes'], 'yesno')).toBe('Yes');
    expect(pickOption('no', ['Yes, I will need sponsorship', 'No, I will not'], 'yesno')).toBe(
      'No, I will not',
    );
  });

  it('places a number in a range', () => {
    const ranges = ['Less than 1 year', '1-2 years', '3-5 years', '6-9 years', '10+ years'];
    expect(pickOption('8', ranges, 'number')).toBe('6-9 years');
    expect(pickOption('12', ranges, 'number')).toBe('10+ years');
    expect(pickOption('0', ranges, 'number')).toBe('Less than 1 year');
  });

  it('knows other spellings of countries, also in phone-code pickers', () => {
    expect(pickOption('United States', ['Canada', 'USA', 'Mexico'], 'country')).toBe('USA');
    expect(pickOption('United Kingdom', ['Germany +49', 'United Kingdom +44'], 'country')).toBe(
      'United Kingdom +44',
    );
    expect(pickOption('UK', ['United Kingdom', 'Ukraine'], 'country')).toBe('United Kingdom');
  });

  it('matches exact, contained and close wording', () => {
    expect(pickOption('LinkedIn', ['Indeed', 'LinkedIn', 'Referral'])).toBe('LinkedIn');
    expect(pickOption('LinkedIn', ['Job board', 'LinkedIn (job post)'])).toBe(
      'LinkedIn (job post)',
    );
    expect(pickOption('Software Engineer', ['Software Engineering', 'Design'])).toBe(
      'Software Engineering',
    );
    expect(pickOption('Astronaut', ['Engineer', 'Designer'])).toBeUndefined();
    expect(
      pickOption('London, United Kingdom', [
        'London, Greater London, England, United Kingdom',
        'United Kingdom',
        'London, Ontario, Canada',
      ]),
    ).toBe('London, Greater London, England, United Kingdom');
    expect(pickOption('', ['A'])).toBeUndefined();
  });

  it('finds the option that declines to answer', () => {
    expect(findDeclineOption(['Male', 'Female', 'Decline To Self Identify'])).toBe(
      'Decline To Self Identify',
    );
    expect(findDeclineOption(['Yes', 'No', "I don't wish to answer"])).toBe(
      "I don't wish to answer",
    );
    expect(findDeclineOption(['Woman', 'Man', 'Prefer not to say'])).toBe('Prefer not to say');
    expect(findDeclineOption(['Yes', 'No'])).toBeUndefined();
    expect(pickOption('', ['Male', 'Choose not to disclose'], 'decline')).toBe(
      'Choose not to disclose',
    );
  });
});

describe('saved answers', () => {
  const saved = (question: string, answer = 'An answer'): SavedAnswer => ({
    id: question,
    question,
    answer,
    createdAt: 1,
    updatedAt: 1,
  });
  const answers = [
    saved('Tell us about yourself', 'I build things.'),
    saved('Why are you looking for a new role?', 'To grow.'),
    saved('Empty one', ''),
  ];

  it('matches the same question in other words', () => {
    expect(matchSavedAnswer('Tell us about yourself.', answers)?.answer.answer).toBe(
      'I build things.',
    );
    expect(matchSavedAnswer('Tell me a bit about yourself', answers)?.score).toBeGreaterThanOrEqual(
      0.5,
    );
    expect(
      matchSavedAnswer('Why are you looking for a new role right now?', answers)?.answer.answer,
    ).toBe('To grow.');
  });

  it('ignores unrelated questions and empty answers', () => {
    expect(matchSavedAnswer('What is your favourite food?', answers)).toBeUndefined();
    expect(matchSavedAnswer('Empty one', answers)).toBeUndefined();
  });

  it('scores exact and contained wording', () => {
    expect(answerScore('Why AppliCliq?', 'why applicliq')).toBe(1);
    expect(answerScore('Why AppliCliq?', 'Why AppliCliq? Tell us more')).toBeGreaterThanOrEqual(
      0.8,
    );
    expect(hasSavedAnswer('Tell us about yourself', answers)).toBe(true);
    expect(hasSavedAnswer('Tell us about your hobbies', answers)).toBe(false);
  });
});
