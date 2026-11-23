import type { Job } from './types';

const CRLF = '\r\n';

/** `YYYYMMDDTHHMMSSZ` in UTC. */
function icsDate(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** RFC 5545 TEXT escaping. */
function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Folds a content line to at most 75 UTF-8 octets per line, never splitting a character. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // Continuation lines start with a space, which counts toward their 75 octets.
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

export type InterviewIcsOptions = {
  /** Event length; defaults to an hour. */
  durationMinutes?: number;
  /** Reminder before the start; 0 for none. Defaults to an hour. */
  reminderMinutes?: number;
  now?: number;
};

/**
 * A calendar file (iCalendar, RFC 5545) for the job's interview, or undefined if no interview
 * date is set. The UID is stable per job, so re-importing updates the same event.
 */
export function interviewIcs(job: Job, options: InterviewIcsOptions = {}): string | undefined {
  if (job.interviewAt === undefined) return undefined;
  const { durationMinutes = 60, reminderMinutes = 60, now = Date.now() } = options;

  const description = [
    job.url,
    job.contact?.name || job.contact?.email
      ? `Contact: ${[job.contact.name, job.contact.email && `<${job.contact.email}>`].filter(Boolean).join(' ')}`
      : undefined,
    job.notes,
  ]
    .filter(Boolean)
    .join('\n\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AppliCliq//Job tracker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // Kept from the Career Pocket days: renaming it would add a duplicate event when a job is exported again.
    `UID:${job.id}-interview@career-pocket`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(job.interviewAt)}`,
    `DTEND:${icsDate(job.interviewAt + durationMinutes * 60_000)}`,
    `SUMMARY:${escapeText(`Interview: ${job.title} at ${job.company}`)}`,
    description && `DESCRIPTION:${escapeText(description)}`,
    /^https?:\/\//.test(job.url) && `URL:${job.url}`,
    ...(reminderMinutes > 0
      ? [
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          `DESCRIPTION:${escapeText(`Interview with ${job.company}`)}`,
          `TRIGGER:-PT${reminderMinutes}M`,
          'END:VALARM',
        ]
      : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((line): line is string => typeof line === 'string' && line !== '');

  return lines.map(fold).join(CRLF) + CRLF;
}

/** "interview-acme-frontend-engineer.ics" */
export function interviewIcsFileName(job: Pick<Job, 'company' | 'title'>): string {
  const slug = `${job.company} ${job.title}`
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return `interview-${slug || 'job'}.ics`;
}
