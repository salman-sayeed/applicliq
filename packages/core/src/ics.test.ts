import { describe, expect, it } from 'vitest';
import { interviewIcs, interviewIcsFileName } from './ics';
import type { Job } from './types';

const job: Job = {
  id: 'job-1',
  url: 'https://jobs.test/42',
  title: 'Frontend Engineer, Payments',
  company: 'Acme; Inc',
  status: 'interview',
  history: [],
  createdAt: 0,
  updatedAt: 0,
  interviewAt: Date.UTC(2026, 11, 3, 14, 30),
  contact: { name: 'Priya Rao', email: 'priya@acme.test' },
  notes: 'Bring portfolio\nAsk about team size',
};

const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('interviewIcs', () => {
  const ics = interviewIcs(job, { now: Date.UTC(2026, 10, 18, 9, 0) })!;

  it('produces a CRLF-terminated VCALENDAR with one event', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\r\n').every((l) => !l.includes('\n'))).toBe(true);
  });

  it('uses UTC times, a one-hour default length and a stable UID', () => {
    const text = unfold(ics);
    expect(text).toContain('DTSTART:20261203T143000Z\r\n');
    expect(text).toContain('DTEND:20261203T153000Z\r\n');
    expect(text).toContain('DTSTAMP:20261118T090000Z\r\n');
    expect(text).toContain('UID:job-1-interview@pocket-career\r\n');
  });

  it('escapes text values', () => {
    const text = unfold(ics);
    expect(text).toContain('SUMMARY:Interview: Frontend Engineer\\, Payments at Acme\\; Inc\r\n');
    expect(text).toContain(
      'Contact: Priya Rao <priya@acme.test>\\n\\nBring portfolio\\nAsk about team size',
    );
  });

  it('includes a reminder unless disabled', () => {
    expect(ics).toContain('TRIGGER:-PT60M');
    expect(interviewIcs(job, { reminderMinutes: 0 })).not.toContain('VALARM');
  });

  it('folds long lines at 75 octets without splitting characters', () => {
    const long = interviewIcs({ ...job, notes: 'é'.repeat(200) })!;
    for (const line of long.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(unfold(long)).toContain('é'.repeat(200));
  });

  it('returns undefined without an interview date', () => {
    expect(interviewIcs({ ...job, interviewAt: undefined })).toBeUndefined();
  });
});

describe('interviewIcsFileName', () => {
  it('slugifies company and title', () => {
    expect(interviewIcsFileName(job)).toBe('interview-acme-inc-frontend-engineer-payments.ics');
    expect(interviewIcsFileName({ company: '!!!', title: '' })).toBe('interview-job.ics');
  });
});
