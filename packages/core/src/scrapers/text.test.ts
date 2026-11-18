// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  detectCurrency,
  detectWorkType,
  detectWorkTypeInDescription,
  htmlToText,
  parseSalary,
  truncateUtf8,
} from './text';

describe('htmlToText', () => {
  const text = (html: string) => htmlToText(html, document);

  it('keeps paragraphs, line breaks and bullets', () => {
    expect(
      text('<h3>Role</h3><p>One <b>two</b></p>line<br>next<ul><li>a</li><li>b</li></ul>'),
    ).toBe('Role\n\nOne two\n\nline\nnext\n\n• a\n• b');
  });

  it('decodes entities and double-escaped HTML', () => {
    expect(text('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(text('&lt;p&gt;Hi&lt;/p&gt;&lt;p&gt;there&lt;/p&gt;')).toBe('Hi\n\nthere');
  });

  it('drops scripts, styles and hidden elements without running them', () => {
    expect(
      text(
        '<p>ok</p><script>window.ran = true</script><style>p{}</style><span aria-hidden="true">x</span>',
      ),
    ).toBe('ok');
    expect((window as { ran?: boolean }).ran).toBeUndefined();
  });

  it('keeps line breaks of plain text', () => {
    expect(text('line one\n  line two\n\n\n\nline three')).toBe('line one\nline two\n\nline three');
  });
});

describe('truncateUtf8', () => {
  it('leaves short text alone', () => {
    expect(truncateUtf8('abc', 10)).toBe('abc');
  });

  it('cuts on a character boundary', () => {
    expect(truncateUtf8('aé€', 4)).toBe('aé'); // 1 + 2 bytes; € needs 3 more
    expect(truncateUtf8('😀😀', 5)).toBe('😀');
  });
});

describe('detectWorkType (short text)', () => {
  it.each([
    ['Remote', 'remote'],
    ['Remote in United States', 'remote'],
    ['Hybrid work in Berlin', 'hybrid'],
    ['Hybrid remote', 'hybrid'],
    ['On-site', 'onsite'],
    ['Onsite · Full-time', 'onsite'],
    ['Work at office', 'onsite'],
    ['Work from home', 'remote'],
    ['Non-remote', undefined],
    ['Berlin, Germany', undefined],
    [undefined, undefined],
  ])('%s → %s', (input, expected) => {
    expect(detectWorkType(input)).toBe(expected);
  });
});

describe('detectWorkTypeInDescription', () => {
  it.each([
    ['This is a fully remote position.', 'remote'],
    ['We are a remote-first company.', 'remote'],
    ['100% remote within the EU.', 'remote'],
    ['This is a hybrid role, 2 days per week in the office.', 'hybrid'],
    ['Expect 3 days a week in our office.', 'hybrid'],
    ['This is an on-site role in Austin.', 'onsite'],
    ['This is not a remote role. You will use remote tooling.', undefined],
    ['We use remote desktops and hybrid cloud.', undefined],
  ])('%s → %s', (input, expected) => {
    expect(detectWorkTypeInDescription(input)).toBe(expected);
  });
});

describe('detectCurrency', () => {
  it.each([
    ['€55K', 'EUR'],
    ['£60,000', 'GBP'],
    ['CA$140K', 'CAD'],
    ['A$90k', 'AUD'],
    ['US$100', 'USD'],
    ['120000 USD', 'USD'],
    ['Tk. 30000', 'BDT'],
    ['৳ 50,000', 'BDT'],
    ['₹12 LPA', 'INR'],
    ['¥5,000,000', 'JPY'],
    ['CHF 120000', 'CHF'],
    ['Negotiable', undefined],
    ['We use PHP and $variables', undefined],
  ])('%s → %s', (input, expected) => {
    expect(detectCurrency(input)).toBe(expected);
  });

  it('reads a bare $ from the site’s country', () => {
    expect(detectCurrency('$80,000', 'ca.indeed.com')).toBe('CAD');
    expect(detectCurrency('$80,000', 'www.seek.com.au')).toBe('AUD');
    expect(detectCurrency('$80,000', 'www.indeed.com')).toBe('USD');
  });

  it('picks the first currency mentioned', () => {
    expect(detectCurrency('Pay: £50k (about €58k)')).toBe('GBP');
  });
});

describe('parseSalary', () => {
  it.each([
    ['$120,000 - $150,000 a year', { min: 120_000, max: 150_000, currency: 'USD', period: 'year' }],
    [
      '$120,000.00/yr - $150,000.00/yr',
      { min: 120_000, max: 150_000, currency: 'USD', period: 'year' },
    ],
    ['€60k–80k', { min: 60_000, max: 80_000, currency: 'EUR' }],
    ['60-80k EUR', { min: 60_000, max: 80_000, currency: 'EUR' }],
    ['Tk. 30000 - 40000 (Monthly)', { min: 30_000, max: 40_000, currency: 'BDT', period: 'month' }],
    ['$45/hr', { min: 45, max: 45, currency: 'USD', period: 'hour' }],
    ['£55,000 to £65,000 per annum', { min: 55_000, max: 65_000, currency: 'GBP', period: 'year' }],
    ['45.000 € pro Jahr', { min: 45_000, max: 45_000, currency: 'EUR' }],
    ['₹12 lakh', { min: 1_200_000, max: 1_200_000, currency: 'INR' }],
  ])('%s', (input, expected) => {
    expect(parseSalary(input)).toEqual(expected);
  });

  it('returns undefined when there is no amount', () => {
    expect(parseSalary('Negotiable')).toBeUndefined();
    expect(parseSalary(undefined)).toBeUndefined();
  });

  it('does not treat two unrelated numbers as a range', () => {
    expect(parseSalary('$130k – $160k • 0.25% – 0.5%')).toMatchObject({
      min: 130_000,
      max: 160_000,
    });
    expect(parseSalary('$90k, 401k match')).toMatchObject({ min: 90_000, max: 90_000 });
  });
});
