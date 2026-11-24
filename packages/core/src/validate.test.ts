import { describe, expect, it } from 'vitest';
import { sanitizeOffer, sanitizeRecord, sanitizeRecords } from './validate';

const job = {
  id: 'a',
  url: 'https://a.test',
  title: 't',
  company: 'c',
  status: 'applied',
  history: [{ status: 'applied', at: 1 }],
  createdAt: 1,
  updatedAt: 2,
  notes: 'kept',
};

describe('sanitizeRecord', () => {
  it('accepts a valid job and keeps optional fields', () => {
    expect(sanitizeRecord(job)).toEqual(job);
  });

  it('reduces tombstones to { id, deletedAt }', () => {
    expect(sanitizeRecord({ ...job, deletedAt: 5 })).toEqual({ id: 'a', deletedAt: 5 });
  });

  it('treats deletedAt: null as a live job', () => {
    expect(sanitizeRecord({ ...job, deletedAt: null })).toEqual(job);
  });

  it('drops invalid history entries', () => {
    const dirty = { ...job, history: [{ status: 'nope', at: 1 }, { status: 'saved' }, 3] };
    expect(sanitizeRecord(dirty)).toEqual({ ...job, history: [] });
  });

  it.each([
    ['not an object', 'x'],
    ['no id', { ...job, id: '' }],
    ['unknown status', { ...job, status: 'hired' }],
    ['missing title', { ...job, title: undefined }],
    ['non-numeric updatedAt', { ...job, updatedAt: '2' }],
    ['history not an array', { ...job, history: {} }],
    ['bad deletedAt', { id: 'a', deletedAt: 'yesterday' }],
    ['NaN deletedAt', { id: 'a', deletedAt: Number.NaN }],
  ])('rejects %s', (_, value) => {
    expect(sanitizeRecord(value)).toBeUndefined();
  });
});

describe('sanitizeRecords', () => {
  it('counts what it skipped', () => {
    expect(sanitizeRecords([job, null, { id: 'b', deletedAt: 1 }])).toEqual({
      records: [job, { id: 'b', deletedAt: 1 }],
      skipped: 1,
    });
  });
});

describe('alternate URLs and offers', () => {
  it('keeps clean values', () => {
    const offer = {
      base: 100_000,
      currency: 'eur',
      period: 'year',
      bonus: '10%',
      benefits: ['Gym', ' ', 3],
      deadline: 5,
      pros: ' Team ',
    };
    const record = sanitizeRecord({
      ...job,
      alternateUrls: ['https://a.test', 'https://a.test', 7, ''],
      offer,
    });
    expect(record).toMatchObject({
      alternateUrls: ['https://a.test'],
      offer: {
        base: 100_000,
        currency: 'EUR',
        period: 'year',
        bonus: '10%',
        benefits: ['Gym'],
        deadline: 5,
        pros: 'Team',
      },
    });
  });

  it('drops unusable values', () => {
    const record = sanitizeRecord({
      ...job,
      alternateUrls: 'https://a.test',
      offer: { base: -5, currency: 'euros', period: 'week' },
    });
    expect(record).not.toHaveProperty('alternateUrls');
    expect(record).not.toHaveProperty('offer');
    expect(sanitizeOffer('offer')).toBeUndefined();
  });
});
