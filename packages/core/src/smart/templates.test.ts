import { describe, expect, it } from 'vitest';
import { DAY, testJob } from '../test-jobs';
import {
  DEFAULT_FOLLOW_UP_TEMPLATES,
  fillFollowUp,
  fillTemplate,
  followUpText,
  jobsNeedingFollowUp,
  mailtoUrl,
  templateValues,
  unfilledPlaceholders,
} from './templates';

const now = 100 * DAY;
const formatDate = (ms: number) => `day ${Math.round(ms / DAY)}`;

describe('fillTemplate', () => {
  it('fills known placeholders', () => {
    const job = testJob(
      [
        ['saved', 80 * DAY],
        ['applied', 86 * DAY],
      ],
      { title: 'Designer', company: 'Acme', contact: { name: ' Kim ' } },
    );
    const values = templateValues(job, { myName: 'Sam', now, formatDate });
    expect(values).toEqual({
      company: 'Acme',
      title: 'Designer',
      appliedDate: 'day 86',
      daysSinceApplied: '14',
      contactName: 'Kim',
      myName: 'Sam',
    });
    expect(fillTemplate('{title} at {company}, {daysSinceApplied} days', values)).toBe(
      'Designer at Acme, 14 days',
    );
  });

  it('leaves unknown and empty placeholders visible', () => {
    const job = testJob([['saved', 1]], { title: 'Dev', company: 'Acme' });
    const values = templateValues(job, { now, formatDate });
    const text = fillTemplate(
      'Hi {contactName}, {title} on {appliedDate}. {salary} {myName}',
      values,
    );
    expect(text).toBe('Hi {contactName}, Dev on {appliedDate}. {salary} {myName}');
    expect(unfilledPlaceholders(text)).toEqual(['contactName', 'appliedDate', 'salary', 'myName']);
  });

  it('fills every default template with no placeholders left when all is known', () => {
    const job = testJob([['applied', 90 * DAY]], { contact: { name: 'Kim' } });
    const values = templateValues(job, { myName: 'Sam', now, formatDate });
    for (const template of DEFAULT_FOLLOW_UP_TEMPLATES) {
      const filled = fillFollowUp(template, values);
      expect(unfilledPlaceholders(filled.subject + filled.body), template.id).toEqual([]);
    }
  });
});

describe('copy and mailto', () => {
  const filled = { subject: 'Hello there', body: 'Line one\nLine & two' };

  it('puts the subject first when copying', () => {
    expect(followUpText(filled)).toBe('Subject: Hello there\n\nLine one\nLine & two');
    expect(followUpText({ subject: '', body: 'x' })).toBe('x');
  });

  it('builds a mailto link with encoded text', () => {
    expect(mailtoUrl('kim@acme.test', filled)).toBe(
      'mailto:kim@acme.test?subject=Hello%20there&body=Line%20one%0ALine%20%26%20two',
    );
  });

  it('needs a usable address', () => {
    expect(mailtoUrl(undefined, filled)).toBeUndefined();
    expect(mailtoUrl('not an email', filled)).toBeUndefined();
  });
});

describe('jobsNeedingFollowUp', () => {
  it('lists applied jobs past the wait with no future reminder, longest wait first', () => {
    const due = testJob([['applied', now - 10 * DAY]], { id: 'due' });
    const longer = testJob([['applied', now - 20 * DAY]], { id: 'longer' });
    const fresh = testJob([['applied', now - 2 * DAY]], { id: 'fresh' });
    const reminded = testJob([['applied', now - 10 * DAY]], { followUpAt: now + DAY });
    const pastReminder = testJob([['applied', now - 10 * DAY]], {
      id: 'past',
      followUpAt: now - DAY,
    });
    const interview = testJob([
      ['applied', now - 30 * DAY],
      ['interview', now - 20 * DAY],
    ]);
    const result = jobsNeedingFollowUp(
      [due, longer, fresh, reminded, pastReminder, interview],
      7,
      now,
    );
    expect(result.map((r) => [r.job.id, r.days])).toEqual([
      ['longer', 20],
      ['due', 10],
      ['past', 10],
    ]);
  });

  it('counts imported applications from the import', () => {
    const imported = testJob([['applied', now - 90 * DAY]], { importedAt: now - 3 * DAY });
    expect(jobsNeedingFollowUp([imported], 7, now)).toEqual([]);
  });

  it('handles no jobs', () => {
    expect(jobsNeedingFollowUp([], 7, now)).toEqual([]);
  });
});
