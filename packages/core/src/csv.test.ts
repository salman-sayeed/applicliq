import { describe, expect, it } from 'vitest';
import { jobsToCsv } from './csv';
import type { Job } from './types';

const job: Job = {
  id: '1',
  url: 'https://jobs.test/1',
  title: 'Engineer, "Platform"',
  company: 'Acme',
  status: 'applied',
  history: [],
  tags: ['remote', 'dream'],
  salary: { min: 100, max: 120, currency: 'EUR', period: 'year' },
  notes: 'line one\nline two',
  createdAt: Date.UTC(2026, 0, 2),
  updatedAt: Date.UTC(2026, 0, 3),
};

describe('jobsToCsv', () => {
  it('writes a header and one quoted, escaped row per job', () => {
    const csv = jobsToCsv([job], (s) => s.toUpperCase());
    const [header, row] = csv.split('\r\n');
    expect(header).toMatch(/^Title,Company,Status,URL,/);
    expect(row).toContain('"Engineer, ""Platform""",Acme,APPLIED,https://jobs.test/1');
    expect(row).toContain('remote; dream');
    expect(csv).toContain('"line one\nline two"');
    expect(row).toContain('2026-01-02T00:00:00.000Z');
  });

  it('defuses cells that spreadsheets would run as formulas', () => {
    const csv = jobsToCsv([{ ...job, company: '=HYPERLINK("x")' }]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('writes just the header for no jobs', () => {
    expect(jobsToCsv([]).trim().split('\r\n')).toHaveLength(1);
  });
});
