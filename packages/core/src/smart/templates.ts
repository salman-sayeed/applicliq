import { firstAppliedAt } from '../stats';
import type { Job } from '../types';

/** A follow-up message. `{placeholders}` are filled by {@link fillTemplate}. */
export type FollowUpTemplate = { id: string; name: string; subject: string; body: string };

export const TEMPLATE_PLACEHOLDERS = [
  'company',
  'title',
  'appliedDate',
  'daysSinceApplied',
  'contactName',
  'myName',
] as const;

export type TemplatePlaceholder = (typeof TEMPLATE_PLACEHOLDERS)[number];

export const DEFAULT_FOLLOW_UP_TEMPLATES: readonly FollowUpTemplate[] = [
  {
    id: 'checking-in',
    name: 'Checking on my application',
    subject: 'Following up on my application for {title}',
    body: `Hi {contactName},

I applied for the {title} role at {company} on {appliedDate} and wanted to check in on where things stand. I'm still very interested in the position and happy to share anything else that would help.

Thank you for your time,
{myName}`,
  },
  {
    id: 'thank-you',
    name: 'Thank you after interview',
    subject: 'Thank you for the interview',
    body: `Hi {contactName},

Thank you for taking the time to talk with me about the {title} role at {company}. I enjoyed learning more about the team, and the conversation made me even more excited about the opportunity.

Please let me know if I can share anything else.

Best regards,
{myName}`,
  },
  {
    id: 'no-response',
    name: 'Following up after no response',
    subject: 'Checking in: {title} application',
    body: `Hi {contactName},

It has been {daysSinceApplied} days since I applied for the {title} role at {company}, and I wanted to follow up. I remain interested and would welcome the chance to talk.

If the position has been filled, I'd appreciate knowing, and I'd be glad to be considered for future roles.

Thanks,
{myName}`,
  },
];

export type TemplateValues = Partial<Record<TemplatePlaceholder, string>>;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The placeholder values for a job. Values that aren't known (no contact, never applied, no name
 * set) are left out, so their placeholders stay visible in the text and the user notices.
 */
export function templateValues(
  job: Job,
  { myName = '', now = Date.now(), formatDate = defaultDate } = {} as {
    myName?: string;
    now?: number;
    formatDate?: (ms: number) => string;
  },
): TemplateValues {
  const values: TemplateValues = { company: job.company, title: job.title };
  const applied = firstAppliedAt(job);
  if (applied !== undefined) {
    values.appliedDate = formatDate(applied);
    values.daysSinceApplied = String(Math.max(0, Math.floor((now - applied) / DAY_MS)));
  }
  const contact = job.contact?.name?.trim();
  if (contact) values.contactName = contact;
  if (myName.trim()) values.myName = myName.trim();
  return values;
}

const defaultDate = (ms: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(ms);

/**
 * Replaces `{placeholder}`s with their values. Unknown placeholders, and known ones without a
 * value, are left as they are.
 */
export function fillTemplate(text: string, values: TemplateValues): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = (values as Record<string, string | undefined>)[name];
    return value !== undefined && value !== '' ? value : match;
  });
}

/** Placeholders in `text` that `fillTemplate` would leave unfilled. */
export function unfilledPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))];
}

export type FilledTemplate = { subject: string; body: string };

export function fillFollowUp(template: FollowUpTemplate, values: TemplateValues): FilledTemplate {
  return {
    subject: fillTemplate(template.subject, values),
    body: fillTemplate(template.body, values),
  };
}

/** Subject and body as one block of text for the clipboard. */
export function followUpText({ subject, body }: FilledTemplate): string {
  return subject.trim() ? `Subject: ${subject.trim()}\n\n${body}` : body;
}

/** A `mailto:` link, or undefined without a usable address. */
export function mailtoUrl(email: string | undefined, { subject, body }: FilledTemplate) {
  const to = email?.trim();
  if (!to || !/^[^\s@]+@[^\s@]+$/.test(to)) return undefined;
  const params = new URLSearchParams();
  if (subject.trim()) params.set('subject', subject.trim());
  if (body) params.set('body', body);
  // URLSearchParams writes spaces as "+", which mail apps show literally.
  const query = params.toString().replace(/\+/g, '%20');
  return `mailto:${encodeURIComponent(to).replace('%40', '@')}${query ? `?${query}` : ''}`;
}

/**
 * Jobs that need a follow-up: still `applied` for at least `afterDays` days (since they were
 * last moved there) and with no follow-up reminder set in the future. Longest wait first.
 */
export function jobsNeedingFollowUp(
  jobs: readonly Job[],
  afterDays: number,
  now: number = Date.now(),
): { job: Job; days: number }[] {
  const out: { job: Job; days: number }[] = [];
  for (const job of jobs) {
    if (job.status !== 'applied') continue;
    if (job.followUpAt !== undefined && job.followUpAt > now) continue;
    let since: number | undefined;
    for (const h of job.history) if (h.status === 'applied') since = h.at;
    // Imported applications get the full wait from the import, as for ghosting.
    since = Math.max(since ?? job.createdAt, job.importedAt ?? 0);
    const days = Math.floor((now - since) / DAY_MS);
    if (days >= afterDays) out.push({ job, days });
  }
  return out.sort((a, b) => b.days - a.days);
}
