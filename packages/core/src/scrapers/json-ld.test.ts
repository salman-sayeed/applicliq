// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseJobPostingJsonLd } from './json-ld';

const parse = (...data: unknown[]) =>
  parseJobPostingJsonLd(
    data.map((d) => (typeof d === 'string' ? d : JSON.stringify(d))),
    document,
  );

const base = { '@type': 'JobPosting', title: 'Dev', hiringOrganization: 'Acme' };

describe('parseJobPostingJsonLd', () => {
  it('accepts a company given as a plain string', () => {
    expect(parse(base)).toMatchObject({ title: 'Dev', company: 'Acme' });
  });

  it('finds postings nested under other objects (e.g. mainEntity)', () => {
    expect(parse({ '@type': 'WebPage', mainEntity: base })?.title).toBe('Dev');
  });

  it('tolerates comment wrappers and raw newlines inside strings', () => {
    expect(parse('<!--\n{"@type":"JobPosting","title":"Line\none"}\n-->')?.title).toBe('Line one');
  });

  it('returns undefined when there is no JobPosting', () => {
    expect(parse({ '@type': 'Article' }, 'not json')).toBeUndefined();
  });

  it('joins multiple locations and skips duplicates', () => {
    const posting = {
      ...base,
      jobLocation: [
        { address: { addressLocality: 'Berlin', addressCountry: { name: 'DE' } } },
        { address: { addressLocality: 'Berlin', addressCountry: { name: 'DE' } } },
        { address: 'Munich, Germany' },
      ],
    };
    expect(parse(posting)?.location).toBe('Berlin, DE / Munich, Germany');
  });

  describe('applicant location requirements', () => {
    const countries = (...codes: string[]) => ({
      ...base,
      jobLocationType: 'TELECOMMUTE',
      applicantLocationRequirements: codes.map((name) => ({ '@type': 'Country', name })),
    });
    // Every ISO 3166 code from AA to ZZ that Intl knows, like WeWorkRemotely's "Anywhere".
    const everyCountry = Array.from({ length: 26 * 26 }, (_, i) =>
      String.fromCharCode(65 + Math.floor(i / 26), 65 + (i % 26)),
    ).filter((code) =>
      new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' }).of(code),
    );

    it('names countries given as ISO codes', () => {
      expect(parse(countries('DE', 'NL'))?.location).toBe('Germany / Netherlands');
    });

    it('keeps names that are not codes', () => {
      expect(parse(countries('EU', 'Canada'))?.location).toBe('European Union / Canada');
    });

    it('shortens a long list to the first few and a count', () => {
      expect(parse(countries('DE', 'FR', 'ES', 'IT', 'PT', 'NL'))?.location).toBe(
        'Germany / France / Spain +3 more',
      );
    });

    it('shows every country as Anywhere', () => {
      expect(everyCountry.length).toBeGreaterThan(200);
      expect(parse(countries(...everyCountry))?.location).toBe('Anywhere');
    });
  });

  describe('salary', () => {
    it('reads a single value with currency on the amount', () => {
      const posting = {
        ...base,
        baseSalary: { currency: 'USD', value: { value: 50, unitText: 'HOUR' } },
      };
      expect(parse(posting)?.salary).toEqual({ min: 50, max: 50, currency: 'USD', period: 'hour' });
    });

    it('reads a plain number value and an array of values', () => {
      expect(parse({ ...base, baseSalary: { currency: 'GBP', value: 40000 } })?.salary).toEqual({
        min: 40_000,
        max: 40_000,
        currency: 'GBP',
      });
      const arr = { ...base, baseSalary: [{ value: [{ minValue: 1, maxValue: 2 }] }] };
      expect(parse(arr)?.salary).toEqual({ min: 1, max: 2 });
    });

    it('falls back to estimatedSalary and ignores amounts without numbers', () => {
      const posting = {
        ...base,
        baseSalary: { currency: 'USD', value: { value: 'Competitive' } },
        estimatedSalary: {
          currency: 'USD',
          value: { minValue: 10, maxValue: 20, unitText: 'MONTH' },
        },
      };
      expect(parse(posting)?.salary).toEqual({
        min: 10,
        max: 20,
        currency: 'USD',
        period: 'month',
      });
    });
  });

  it('maps jobLocationType to a work type', () => {
    expect(parse({ ...base, jobLocationType: ['TELECOMMUTE'] })?.workType).toBe('remote');
    expect(parse(base)?.workType).toBeUndefined();
  });
});
