import { describe, expect, it } from 'vitest';
import { sanitizeRecord, sanitizeRecords } from './validate';

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
