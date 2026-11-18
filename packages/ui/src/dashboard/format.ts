import { type DateFormat, type Salary, daysSince } from '@pocket-career/core';

const pad = (n: number) => String(n).padStart(2, '0');

/** Epoch ms → `<input type="datetime-local">` value, in local time. */
export function toDateTimeInput(ms: number | undefined): string {
  if (ms === undefined) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeInput(value: string): number | undefined {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? ms : undefined;
}

/** Epoch ms → `<input type="date">` value, in local time. */
export function toDateInput(ms: number | undefined): string {
  return toDateTimeInput(ms).slice(0, 10);
}

/** A date-only value is stored as 9:00 local time that day. */
export function fromDateInput(value: string): number | undefined {
  return value ? fromDateTimeInput(`${value}T09:00`) : undefined;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

/** A date in the user's chosen format; 'system' follows the browser's locale. */
export function formatDate(ms: number, format: DateFormat = 'system'): string {
  if (format === 'system') return dateFormat.format(ms);
  const d = new Date(ms);
  const [y, m, day] = [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())];
  return format === 'ymd'
    ? `${y}-${m}-${day}`
    : format === 'dmy'
      ? `${day}/${m}/${y}`
      : `${m}/${day}/${y}`;
}

export function formatDateTime(ms: number, format: DateFormat = 'system'): string {
  if (format === 'system') return dateTimeFormat.format(ms);
  return `${formatDate(ms, format)} ${timeFormat.format(ms)}`;
}

/** "today", "yesterday", "5d ago". */
export function formatAgo(ms: number, now: number = Date.now()): string {
  const days = daysSince(ms, now);
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`;
}

const PERIOD_SUFFIX = { hour: '/hr', month: '/mo', year: '/yr' } as const;

function formatAmount(value: number, currency: string | undefined): string {
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value);
    } catch {
      // Unknown currency code: fall through to a plain number plus the code.
    }
  }
  const n = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  return currency ? `${n.format(value)} ${currency}` : n.format(value);
}

/** "$120K–$150K/yr" */
export function formatSalary(salary: Salary | undefined): string {
  if (!salary || (salary.min === undefined && salary.max === undefined)) return '';
  const { min, max, currency, period } = salary;
  const range =
    min !== undefined && max !== undefined && min !== max
      ? `${formatAmount(min, currency)}–${formatAmount(max, currency)}`
      : formatAmount((min ?? max)!, currency);
  return period ? `${range}${PERIOD_SUFFIX[period]}` : range;
}

/** Saves text as a file through a temporary link (no platform APIs needed). */
export function downloadFile(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
