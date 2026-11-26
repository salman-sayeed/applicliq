// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanForm } from './dom/scan';
import { type FillPlan, type PlanInput, buildPlan, fillableItems } from './plan';
import { TEST_PROFILE } from './test-profile';

/**
 * The adapters and the matcher on saved application pages (see __fixtures__/README.md): which
 * questions are found, and which get filled with what.
 */

const input: PlanInput = { profile: TEST_PROFILE, answers: [], eeo: 'skip' };

function load(file: string, url: string, options: Partial<PlanInput> = {}) {
  const html = readFileSync(join(import.meta.dirname, '__fixtures__', file), 'utf8');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const { result, refs } = scanForm(doc, new URL(url), { layout: false });
  const plan = buildPlan(result.questions, { ...input, ...options });
  return { doc, result, refs, plan };
}

/** `label → value` for what a fill would put in without asking. */
function filled(plan: FillPlan): Record<string, string> {
  return Object.fromEntries(fillableItems(plan).map((i) => [i.label, i.value]));
}

function suggested(plan: FillPlan): Record<string, string> {
  return Object.fromEntries(
    plan.items.filter((i) => i.confidence === 'medium').map((i) => [i.label, i.value]),
  );
}

const reasons = (plan: FillPlan) =>
  Object.fromEntries(plan.unfilled.map((u) => [u.label, u.reason]));

describe('Greenhouse, current boards (job-boards.greenhouse.io)', () => {
  const { result, plan } = load(
    'greenhouse-new.html',
    'https://job-boards.greenhouse.io/gitlab/jobs/8940982002',
  );

  it('finds the questions with their system fields', () => {
    expect(result.platform).toBe('greenhouse');
    expect(result.questions.map((q) => q.hint).filter(Boolean)).toEqual([
      'firstName',
      'lastName',
      'email',
      'phoneCountry',
      'phone',
      'eeo',
      'eeo',
      'eeo',
    ]);
    // react-select dropdowns show their options only when opened.
    expect(result.questions.filter((q) => q.kind === 'dropdown').length).toBeGreaterThan(5);
  });

  it('fills contact details; the phone goes without its code next to the country picker', () => {
    expect(filled(plan)).toMatchObject({
      'First Name': 'Ada',
      'Last Name': 'Lovelace',
      Email: 'ada@example.test',
      Country: 'United Kingdom',
      Phone: '07700 900123',
      'LinkedIn Profile': 'https://linkedin.com/in/ada',
      "What's the name you'd prefer us to use throughout the interview process?": 'Ada',
      'Will you now or in the future require sponsorship for a visa to remain in your current location?':
        'No',
      'What is your current country of residence?': 'United Kingdom',
    });
  });

  it('leaves files, voluntary questions and the unknown to the user', () => {
    expect(reasons(plan)).toMatchObject({
      'Resume/CV': 'file',
      'Cover Letter': 'file',
      Gender: 'eeo',
      'Veteran Status': 'eeo',
      'Have you previously worked at or consulted for GitLab?': 'no-match',
    });
    expect(plan.total).toBe(result.questions.length);
  });

  it('answers voluntary questions with "decline" when asked to', () => {
    const declined = load(
      'greenhouse-new.html',
      'https://job-boards.greenhouse.io/gitlab/jobs/8940982002',
      { eeo: 'decline' },
    ).plan;
    const gender = declined.items.find((i) => i.label === 'Gender');
    expect(gender).toMatchObject({ source: 'eeo', optionKind: 'decline', confidence: 'high' });
  });
});

describe('Greenhouse embed (company career site iframe)', () => {
  const { plan } = load(
    'greenhouse-embed.html',
    'https://job-boards.greenhouse.io/embed/job_app?for=airbnb&token=8365363',
  );

  it('fills the same system fields as the board', () => {
    expect(filled(plan)).toMatchObject({
      'First Name': 'Ada',
      'Preferred First Name': 'Ada',
      'Location (City)': 'London, United Kingdom',
    });
  });

  it('suggests guesses instead of filling them', () => {
    expect(suggested(plan)).toMatchObject({
      'Are you legally authorized to work in the country where the job is located?': 'Yes',
      'How many years of post-graduate work experience do you have?': '8',
    });
  });

  it('never answers acknowledgements or attestations', () => {
    const r = reasons(plan);
    expect(r['Before submitting your application please review the points below']).toBe('consent');
    expect(r['Candidate AI Usage Attestation']).toBe('consent');
  });
});

describe('Greenhouse classic board', () => {
  const { result, plan } = load(
    'greenhouse-classic.html',
    'https://boards.greenhouse.io/example/jobs/123',
  );

  it('skips the honeypot, password, CAPTCHA and submit button', () => {
    const labels = result.questions.map((q) => q.label);
    expect(labels).not.toContain('Website confirm');
    expect(result.questions.some((q) => q.label.toLowerCase().includes('captcha'))).toBe(false);
    expect(result.questions.every((q) => q.kind !== ('password' as string))).toBe(true);
    expect(result.questions).toHaveLength(16);
  });

  it('picks select options: yes/no, ranges', () => {
    expect(filled(plan)).toMatchObject({
      Phone: '+44 7700 900123',
      'Are you legally authorized to work in the United Kingdom?': 'Yes',
      'Will you now or in the future require visa sponsorship?': 'No',
      'How many years of experience do you have?': '6-9 years',
      'What are your salary expectations?': '85,000 GBP per year',
    });
  });

  it('leaves fields that already have a value unless overwriting', () => {
    const website = plan.items.find((i) => i.label === 'Website')!;
    expect(website).toMatchObject({
      hasValue: true,
      currentValue: 'https://already-there.example',
    });
    expect(filled(plan)).not.toHaveProperty('Website');
    expect(
      Object.fromEntries(fillableItems(plan, { overwrite: true }).map((i) => [i.label, i.value])),
    ).toHaveProperty('Website', 'https://ada.example');
  });

  it('declines EEO questions with their own wording', () => {
    const declined = load(
      'greenhouse-classic.html',
      'https://boards.greenhouse.io/example/jobs/123',
      {
        eeo: 'decline',
      },
    ).plan;
    expect(filled(declined)).toMatchObject({
      Gender: 'Decline To Self Identify',
      'Veteran Status': "I don't wish to answer",
    });
  });

  it('never fills the consent checkbox', () => {
    expect(
      reasons(plan)[
        'I consent to Example Co processing my data as described in the privacy notice.'
      ],
    ).toBe('consent');
  });
});

describe('Lever', () => {
  const { result, plan } = load('lever.html', 'https://jobs.lever.co/spotify/2a55d6c9/apply');

  it('maps Lever’s system fields by name', () => {
    expect(filled(plan)).toMatchObject({
      'Full name': 'Ada Lovelace',
      Pronouns: 'She/her',
      Email: 'ada@example.test',
      Phone: '+44 7700 900123',
      'Current location': 'London, United Kingdom',
      'Current company': 'Analytical Engines Ltd',
      'LinkedIn URL': 'https://linkedin.com/in/ada',
      'GitHub URL': 'https://github.com/ada',
      'Portfolio URL': 'https://ada.example',
    });
  });

  it('points at the resume upload and skips the hidden custom-pronoun box', () => {
    expect(reasons(plan)['Resume/CV']).toBe('file');
    expect(result.questions.some((q) => q.label === 'Write here...')).toBe(false);
  });

  it('leaves the demographic survey to the user by default', () => {
    const genders = plan.unfilled.filter((u) => /gender/i.test(u.label));
    expect(genders.length).toBeGreaterThan(0);
    expect(genders.every((u) => u.reason === 'eeo')).toBe(true);
  });
});

describe('Ashby', () => {
  const { result, plan } = load(
    'ashby.html',
    'https://jobs.ashbyhq.com/openai/8fb1615c-34bf-47c4-a1d1-b7b2f836bbd3/application',
  );

  it('reads field entries, yes/no buttons, the location typeahead and the date picker', () => {
    const kinds = Object.fromEntries(result.questions.map((q) => [q.label, q.kind]));
    expect(kinds).toMatchObject({
      'Legal Name': 'text',
      Resume: 'file',
      'Where are you currently located?': 'dropdown',
      'When can you start a new role?': 'date',
      'Are you authorized to work in the country where the job is located?': 'yesno',
    });
    // The yes/no buttons' hidden checkbox and the reCAPTCHA response are not questions.
    expect(result.questions.filter((q) => q.kind === 'checkbox')).toEqual([]);
    expect(result.questions.some((q) => /recaptcha/i.test(q.label))).toBe(false);
  });

  it('fills and suggests', () => {
    expect(filled(plan)).toMatchObject({
      'Legal Name': 'Ada Lovelace',
      'Preferred Name (if applicable)': 'Ada',
      Email: 'ada@example.test',
      Phone: '+44 7700 900123',
      'Where are you currently located?': 'London, United Kingdom',
      'When can you start a new role?': '03/14/2027',
      'Will you now or in the future require sponsorship for employment visa status in this country?':
        'No',
    });
    expect(suggested(plan)).toMatchObject({
      'Are you authorized to work in the country where the job is located?': 'Yes',
      'Do you have a minimum of 7 years of experience building software?': 'Yes',
    });
  });

  it('leaves SMS consent and the anti-bot puzzle alone', () => {
    expect(reasons(plan).SMS).toBe('consent');
    const puzzle = plan.unfilled.find((u) => u.label.startsWith("Here's some text encoded"));
    expect(puzzle?.reason).toBe('no-match');
  });
});

describe('Google Forms', () => {
  const { result, plan } = load(
    'google-forms.html',
    'https://docs.google.com/forms/d/e/FORM_ID/viewform',
  );

  it('reads list items, ARIA radios, checkboxes and the dropdown', () => {
    expect(result.platform).toBe('googleForms');
    expect(result.title).toBe('New Employee Application');
    const byLabel = Object.fromEntries(result.questions.map((q) => [q.label, q]));
    expect(byLabel['How many hours are you looking for per work?']).toMatchObject({
      kind: 'radio',
      options: ['Part time 15-30 hours', 'Full time 30-40 hours'],
    });
    expect(byLabel['What location are you interested in working?']).toMatchObject({
      kind: 'checkbox',
      multiple: true,
      options: ['South Asheville', 'North Asheville', 'Either'],
    });
    expect(
      byLabel['Are you at least 16 years of age and have reliable transportation?'],
    ).toMatchObject({ kind: 'dropdown', options: ['Yes', 'No'] });
    expect(result.questions).toHaveLength(10);
  });

  it('fills what it knows and suggests the ambiguous', () => {
    expect(filled(plan)).toEqual({
      'Name (First and Last)': 'Ada Lovelace',
      'Contact telephone number': '+44 7700 900123',
      'Earliest start date': '2027-03-14',
    });
    expect(Object.keys(suggested(plan))).toEqual(['Email and Phone #']);
  });

  it('uses a saved answer for a free-text question', () => {
    const withAnswer = load(
      'google-forms.html',
      'https://docs.google.com/forms/d/e/FORM_ID/viewform',
      {
        answers: [
          {
            id: 'a1',
            question: 'Which three words describe you?',
            answer: 'Curious, careful, kind',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
    ).plan;
    const item = withAnswer.items.find((i) => i.source === 'answer');
    expect(item).toMatchObject({
      label: 'What three words would you use to describe yourself?',
      value: 'Curious, careful, kind',
      answerId: 'a1',
    });
  });
});

describe('Microsoft Forms', () => {
  const { result, plan } = load(
    'microsoft-forms.html',
    'https://forms.cloud.microsoft/pages/responsepage.aspx?id=abc',
  );

  it('reads question items without their numbers or type notes', () => {
    expect(result.platform).toBe('microsoftForms');
    expect(result.title).toBe('Request access to Example Dataset');
    expect(result.questions.map((q) => q.label).slice(0, 3)).toEqual([
      'First Name',
      'Last Name',
      'Email',
    ]);
    // The "Other" answer box is part of its choice question.
    expect(result.questions.find((q) => q.label === 'Requester’s position')?.options).toEqual([
      'Professor',
      'PhD student',
      'Software Engineer',
    ]);
  });

  it('fills the user’s details, never a supervisor’s, and dates as the field asks', () => {
    expect(filled(plan)).toEqual({
      'First Name': 'Ada',
      'Last Name': 'Lovelace',
      Email: 'ada@example.test',
      Company: 'Analytical Engines Ltd',
      'GitHub Handle': 'https://github.com/ada',
      'When can you start?': '3/14/2027',
    });
    expect(suggested(plan)).toEqual({ Title: 'Engineer' });
    expect(reasons(plan)).toMatchObject({
      'PI/Supervisor’s name': 'no-match',
      'PI/Supervisor’s email': 'no-match',
      'Confirmation of Acceptance of the Terms': 'consent',
    });
  });
});

describe('the count the preview shows', () => {
  it('"I can fill X of Y" counts high-confidence answers to empty questions', () => {
    const { plan } = load(
      'microsoft-forms.html',
      'https://forms.office.com/Pages/ResponsePage.aspx?id=abc',
    );
    expect(fillableItems(plan)).toHaveLength(6);
    expect(plan.total).toBe(11);
  });
});
