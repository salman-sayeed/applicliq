import { describe, expect, it } from 'vitest';
import { parseJobPostingJsonLd } from './json-ld';

const posting = {
  '@context': 'https://schema.org',
  '@type': 'JobPosting',
  title: 'Frontend Engineer',
  hiringOrganization: { '@type': 'Organization', name: 'Acme' },
  jobLocationType: 'TELECOMMUTE',
  jobLocation: { address: { addressLocality: 'Berlin', addressCountry: 'DE' } },
  baseSalary: {
    currency: 'EUR',
    value: { minValue: 60000, maxValue: 80000, unitText: 'YEAR' },
  },
  description: '<p>Build <b>things</b>.</p>',
};

describe('parseJobPostingJsonLd', () => {
  it('extracts the main fields', () => {
    expect(parseJobPostingJsonLd([JSON.stringify(posting)])).toEqual({
      title: 'Frontend Engineer',
      company: 'Acme',
      location: 'Berlin, DE',
      workType: 'remote',
      salary: { currency: 'EUR', min: 60000, max: 80000, period: 'year' },
      descriptionSnapshot: 'Build things .',
    });
  });

  it('finds postings inside @graph and skips invalid blocks', () => {
    const graph = JSON.stringify({ '@graph': [{ '@type': 'WebPage' }, posting] });
    expect(parseJobPostingJsonLd(['not json', graph])?.title).toBe('Frontend Engineer');
  });

  it('returns undefined when there is no JobPosting', () => {
    expect(parseJobPostingJsonLd([JSON.stringify({ '@type': 'Article' })])).toBeUndefined();
  });
});
