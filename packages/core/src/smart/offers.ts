import type { Job, Offer } from '../types';

/**
 * Offer comparison. No exchange rates are fetched (the app works offline and sends nothing
 * anywhere): offers in different currencies are shown each in its own currency, unless the user
 * types a conversion rate.
 */

export type OfferPay = {
  perMonth: number;
  perYear: number;
  currency?: string;
};

/** Base pay per month and per year. A missing period is taken as yearly. */
export function offerPay(offer: Offer | undefined): OfferPay | undefined {
  if (offer?.base === undefined || !Number.isFinite(offer.base) || offer.base < 0) return undefined;
  const perYear = offer.period === 'month' ? offer.base * 12 : offer.base;
  return { perMonth: perYear / 12, perYear, currency: offer.currency };
}

/** The offer to start from for a job: its own, or its posted salary as a hint. */
export function offerFromJob(job: Job): Offer {
  if (job.offer) return job.offer;
  const salary = job.salary;
  const amount = salary?.max ?? salary?.min;
  if (amount === undefined || salary?.period === 'hour') return {};
  return {
    base: amount,
    ...(salary?.currency ? { currency: salary.currency } : {}),
    period: salary?.period === 'month' ? 'month' : 'year',
  };
}

/** Whether a job belongs in the comparison: it has an offer, or its status is `offer`. */
export function hasOffer(job: Job): boolean {
  return job.status === 'offer' || job.offer !== undefined;
}

/** `A → B` rates the user typed: how many units of `to` one unit of `from` is worth. */
export type ConversionRate = { from: string; to: string; rate: number };

export type ComparedOffer = {
  job: Job;
  pay?: OfferPay;
  /** Pay converted to the comparison currency, when a rate (or the same currency) allows. */
  converted?: OfferPay;
};

export type OfferComparison = {
  offers: ComparedOffer[];
  /** Distinct currencies among the offers with pay. */
  currencies: string[];
  /** The currency `converted` is in, when every offer could be expressed in it. */
  currency?: string;
  /** Index of the highest base pay, when the offers can be compared. */
  highest?: number;
};

/**
 * Lines up 2–3 offers. Pay is compared only when it's all in one currency, or when `rate`
 * converts the others into `rate.to`. Without that, each stays in its own currency and no
 * "highest" is picked.
 */
export function compareOffers(jobs: readonly Job[], rate?: ConversionRate): OfferComparison {
  const offers: ComparedOffer[] = jobs.map((job) => ({ job, pay: offerPay(job.offer) }));
  const withPay = offers.filter((o) => o.pay);
  const currencies = [...new Set(withPay.map((o) => o.pay!.currency ?? ''))].filter(Boolean);
  const unknown = withPay.some((o) => !o.pay!.currency);

  let target: string | undefined;
  if (currencies.length <= 1 && !(unknown && currencies.length === 1)) target = currencies[0] ?? '';
  else if (rate && rate.rate > 0 && !unknown) {
    const others = currencies.filter((c) => c !== rate.to);
    if (others.length === 1 && others[0] === rate.from) target = rate.to;
  }

  if (target !== undefined) {
    for (const offer of withPay) {
      const pay = offer.pay!;
      const factor = (pay.currency ?? '') === target ? 1 : rate!.rate;
      offer.converted = {
        perMonth: pay.perMonth * factor,
        perYear: pay.perYear * factor,
        ...(target ? { currency: target } : {}),
      };
    }
  }

  let highest: number | undefined;
  if (target !== undefined && withPay.length >= 2) {
    let best = -1;
    offers.forEach((o, i) => {
      if (o.converted && o.converted.perYear > best) {
        best = o.converted.perYear;
        highest = i;
      }
    });
    const top = offers.filter((o) => o.converted?.perYear === best).length;
    if (top > 1) highest = undefined;
  }
  return { offers, currencies, currency: target || undefined, highest };
}

/** Benefits from a comma- or line-separated text field, trimmed, without duplicates. */
export function parseBenefits(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,\n;]/)) {
    const value = part.trim();
    if (value && !seen.has(value.toLowerCase())) {
      seen.add(value.toLowerCase());
      out.push(value);
    }
  }
  return out;
}

/** Offer deadline reminders come this long before the deadline. */
export const OFFER_DEADLINE_NOTICE_MS = 24 * 60 * 60 * 1000;
