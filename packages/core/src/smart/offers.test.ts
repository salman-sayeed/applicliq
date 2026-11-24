import { describe, expect, it } from 'vitest';
import { allReminders } from '../reminders';
import { DAY, testJob } from '../test-jobs';
import { compareOffers, hasOffer, offerFromJob, offerPay, parseBenefits } from './offers';

const offerJob = (offer: Parameters<typeof offerPay>[0], extra = {}) =>
  testJob([['offer', 1]], { offer, ...extra });

describe('offerPay', () => {
  it('shows pay per month and per year', () => {
    expect(offerPay({ base: 120_000, currency: 'USD', period: 'year' })).toEqual({
      perMonth: 10_000,
      perYear: 120_000,
      currency: 'USD',
    });
    expect(offerPay({ base: 5_000, period: 'month' })).toMatchObject({ perYear: 60_000 });
  });

  it('takes a missing period as yearly and ignores missing or bad pay', () => {
    expect(offerPay({ base: 60_000 })?.perMonth).toBe(5_000);
    expect(offerPay({})).toBeUndefined();
    expect(offerPay(undefined)).toBeUndefined();
    expect(offerPay({ base: -1 })).toBeUndefined();
  });
});

describe('compareOffers', () => {
  it('compares offers in one currency and picks the highest', () => {
    const a = offerJob({ base: 100_000, currency: 'EUR' });
    const b = offerJob({ base: 9_000, currency: 'EUR', period: 'month' });
    const result = compareOffers([a, b]);
    expect(result.currency).toBe('EUR');
    expect(result.highest).toBe(1);
    expect(result.offers[1]!.converted?.perYear).toBe(108_000);
  });

  it('keeps mixed currencies apart without a rate', () => {
    const a = offerJob({ base: 100_000, currency: 'EUR' });
    const b = offerJob({ base: 120_000, currency: 'USD' });
    const result = compareOffers([a, b]);
    expect(result.currencies).toEqual(['EUR', 'USD']);
    expect(result.currency).toBeUndefined();
    expect(result.highest).toBeUndefined();
    expect(result.offers.every((o) => o.converted === undefined)).toBe(true);
  });

  it('converts with a user-entered rate', () => {
    const a = offerJob({ base: 100_000, currency: 'EUR' });
    const b = offerJob({ base: 105_000, currency: 'USD' });
    const result = compareOffers([a, b], { from: 'EUR', to: 'USD', rate: 1.1 });
    expect(result.currency).toBe('USD');
    expect(result.offers[0]!.converted?.perYear).toBeCloseTo(110_000);
    expect(result.highest).toBe(0);
    // A rate for other currencies doesn't apply.
    expect(compareOffers([a, b], { from: 'GBP', to: 'USD', rate: 1.3 }).currency).toBeUndefined();
  });

  it('does not mix an offer without a currency with one that has one', () => {
    const a = offerJob({ base: 1 });
    const b = offerJob({ base: 2, currency: 'USD' });
    expect(compareOffers([a, b]).highest).toBeUndefined();
  });

  it('handles offers without pay, a single offer and none', () => {
    const noPay = offerJob({ bonus: '10%' });
    const paid = offerJob({ base: 1, currency: 'USD' });
    expect(compareOffers([noPay, paid]).highest).toBeUndefined();
    expect(compareOffers([paid]).highest).toBeUndefined();
    expect(compareOffers([])).toEqual({ offers: [], currencies: [], highest: undefined });
  });

  it('reports a tie as no highest', () => {
    const a = offerJob({ base: 5, currency: 'USD' });
    const b = offerJob({ base: 5, currency: 'USD' });
    expect(compareOffers([a, b]).highest).toBeUndefined();
  });
});

describe('offer helpers', () => {
  it('starts an offer from the posted salary', () => {
    const job = testJob([['offer', 1]], {
      salary: { min: 90_000, max: 100_000, currency: 'EUR', period: 'year' },
    });
    expect(offerFromJob(job)).toEqual({ base: 100_000, currency: 'EUR', period: 'year' });
    expect(offerFromJob(testJob([['offer', 1]], { salary: { min: 30, period: 'hour' } }))).toEqual(
      {},
    );
  });

  it('knows which jobs have offers', () => {
    expect(hasOffer(testJob([['offer', 1]]))).toBe(true);
    expect(hasOffer(testJob([['applied', 1]], { offer: { base: 1 } }))).toBe(true);
    expect(hasOffer(testJob([['applied', 1]]))).toBe(false);
  });

  it('parses benefits', () => {
    expect(parseBenefits('Health, 30 days off\nGym; health ,')).toEqual([
      'Health',
      '30 days off',
      'Gym',
    ]);
  });

  it('reminds a day before the deadline, only when asked', () => {
    const job = offerJob({ deadline: 10 * DAY });
    expect(allReminders([job]).filter((r) => r.kind === 'offerDeadline')).toEqual([]);
    const [reminder] = allReminders([job], { offerDeadlines: true });
    expect(reminder).toMatchObject({ kind: 'offerDeadline', at: 9 * DAY });
    const declined = { ...job, status: 'withdrawn' as const };
    expect(allReminders([declined], { offerDeadlines: true })).toEqual([]);
  });
});
