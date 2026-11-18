import { describe, expect, it } from 'vitest';
import { normalizeUrl } from './url';

describe('normalizeUrl', () => {
  it('drops the hash', () => {
    expect(normalizeUrl('https://a.test/job/1#apply')).toBe('https://a.test/job/1');
  });

  it('drops tracking params case-insensitively and keeps the rest', () => {
    expect(
      normalizeUrl(
        'https://a.test/view?UTM_Source=li&utm_medium=x&gclid=1&fbclid=2&trk=3&refId=4&jk=abc',
      ),
    ).toBe('https://a.test/view?jk=abc');
  });

  it('keeps job-id params that look like ids', () => {
    expect(normalizeUrl('https://www.linkedin.com/jobs/view/?currentJobId=42&trackingId=x')).toBe(
      'https://www.linkedin.com/jobs/view?currentJobId=42',
    );
  });

  it('removes an empty query entirely', () => {
    expect(normalizeUrl('https://a.test/job?utm_source=x')).toBe('https://a.test/job');
  });

  it('sorts the remaining params so order does not matter', () => {
    expect(normalizeUrl('https://a.test/?b=2&a=1')).toBe(normalizeUrl('https://a.test/?a=1&b=2'));
  });

  it('normalizes host case, default port and trailing slashes', () => {
    expect(normalizeUrl('HTTPS://A.Test:443/Jobs/1//')).toBe('https://a.test/Jobs/1');
    expect(normalizeUrl('https://a.test')).toBe('https://a.test/');
  });

  it('returns invalid URLs trimmed and otherwise unchanged', () => {
    expect(normalizeUrl('  not a url  ')).toBe('not a url');
  });
});
