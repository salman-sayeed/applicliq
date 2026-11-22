import { beforeEach, describe, expect, it } from 'vitest';
import {
  DRAFT_TTL_MS,
  type Draft,
  type DraftStorageArea,
  createDraftStore,
  draftFrom,
  draftKey,
  setDraftField,
} from './draft';

/** In-memory stand-in for `browser.storage.session`. */
function memoryArea(): DraftStorageArea & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    async get(keys) {
      const list = keys === null ? [...data.keys()] : typeof keys === 'string' ? [keys] : keys;
      return Object.fromEntries(list.filter((k) => data.has(k)).map((k) => [k, data.get(k)]));
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) data.set(k, structuredClone(v));
    },
    async remove(keys) {
      for (const k of typeof keys === 'string' ? [keys] : keys) data.delete(k);
    },
  };
}

const PAGE = 'https://jobs.test/posting/42?utm_source=x#apply';
const draft = (extra: Partial<Draft> = {}): Draft => ({
  ...draftFrom({ title: 'Dev', company: 'Acme' }, 'https://jobs.test/posting/42'),
  ...extra,
});

describe('draft store', () => {
  let clock: number;
  let area: ReturnType<typeof memoryArea>;
  const store = () => createDraftStore(area, () => clock);

  beforeEach(() => {
    clock = 1_000_000;
    area = memoryArea();
  });

  it('saves and restores a draft by page URL', async () => {
    await store().save(PAGE, draft({ company: 'Acme Inc' }));
    expect(await store().get(PAGE)).toMatchObject({ title: 'Dev', company: 'Acme Inc' });
  });

  it('keys drafts by the normalized URL (hash and tracking parameters dropped)', async () => {
    await store().save(PAGE, draft());
    expect(draftKey(PAGE)).toBe('draft:https://jobs.test/posting/42');
    expect(await store().get('https://jobs.test/posting/42/')).toBeDefined();
    expect(await store().get('https://jobs.test/posting/43')).toBeUndefined();
  });

  it('removes a draft', async () => {
    await store().save(PAGE, draft());
    await store().remove('https://jobs.test/posting/42');
    expect(await store().get(PAGE)).toBeUndefined();
    expect(area.data.size).toBe(0);
  });

  it('expires drafts after 24 hours', async () => {
    await store().save(PAGE, draft());
    clock += DRAFT_TTL_MS - 1;
    expect(await store().get(PAGE)).toBeDefined();
    clock += 1;
    expect(await store().get(PAGE)).toBeUndefined();
    expect(area.data.size).toBe(0);
  });

  it('a new save restarts the 24 hours', async () => {
    await store().save(PAGE, draft());
    clock += DRAFT_TTL_MS - 10;
    await store().save(PAGE, draft({ notes: 'x' }));
    clock += 100;
    expect(await store().get(PAGE)).toMatchObject({ notes: 'x' });
  });

  it('drops unreadable entries', async () => {
    area.data.set(draftKey(PAGE), { draft: { title: 1 }, savedAt: clock });
    expect(await store().get(PAGE)).toBeUndefined();
    expect(area.data.size).toBe(0);
  });

  it('purges expired and broken drafts, leaving fresh ones and other keys', async () => {
    await store().save('https://a.test/1', draft());
    clock += DRAFT_TTL_MS;
    await store().save('https://b.test/2', draft());
    area.data.set('draft:https://c.test/3', 'garbage');
    area.data.set('somethingElse', 1);
    expect(await store().purgeExpired()).toBe(2);
    expect([...area.data.keys()].sort()).toEqual(['draft:https://b.test/2', 'somethingElse']);
  });
});

describe('setDraftField', () => {
  it('sets one-line fields with whitespace collapsed', () => {
    expect(setDraftField(draft(), 'company', '  Acme\n  Corp  ')?.company).toBe('Acme Corp');
    expect(setDraftField(draft(), 'title', 'Senior   Engineer')?.title).toBe('Senior Engineer');
  });

  it('ignores empty text', () => {
    expect(setDraftField(draft(), 'title', ' \n ')).toBeUndefined();
    expect(setDraftField(draft(), 'notes', '\n\n')).toBeUndefined();
  });

  it('fills the work type from a location when it is still empty', () => {
    expect(setDraftField(draft(), 'location', 'Berlin (Hybrid)')).toMatchObject({
      location: 'Berlin (Hybrid)',
      workType: 'hybrid',
    });
    expect(setDraftField(draft({ workType: 'onsite' }), 'location', 'Remote')?.workType).toBe(
      'onsite',
    );
  });

  it('appends to notes on a new line', () => {
    const once = setDraftField(draft(), 'notes', 'Visa sponsorship');
    expect(once?.notes).toBe('Visa sponsorship');
    const twice = setDraftField(once!, 'notes', '  Team of 6\n\n\n\nReports to CTO ');
    expect(twice?.notes).toBe('Visa sponsorship\nTeam of 6\n\nReports to CTO');
  });

  it('leaves other fields alone', () => {
    const before = draft({ location: 'Paris', notes: 'n' });
    expect(setDraftField(before, 'company', 'Other')).toEqual({ ...before, company: 'Other' });
  });
});

describe('setDraftField: salary parsing', () => {
  it.each([
    [
      'Salary: $120K – $150K per year',
      { salaryMin: '120000', salaryMax: '150000', currency: 'USD', period: 'year' },
    ],
    [
      'USD 90,000 - 110,000 annually',
      { salaryMin: '90000', salaryMax: '110000', currency: 'USD', period: 'year' },
    ],
    ['€55k–65k', { salaryMin: '55000', salaryMax: '65000', currency: 'EUR' }],
    ['£28.50 per hour', { salaryMin: '28.5', salaryMax: '28.5', currency: 'GBP', period: 'hour' }],
    [
      'Tk. 40,000 - 60,000 (Monthly)',
      { salaryMin: '40000', salaryMax: '60000', currency: 'BDT', period: 'month' },
    ],
    ['80 000 – 95 000 SEK', { salaryMin: '80000', salaryMax: '95000', currency: 'SEK' }],
  ])('%s', (text, expected) => {
    expect(setDraftField(draft({ currency: '', period: '' }), 'salary', text)).toMatchObject(
      expected,
    );
  });

  it('keeps the default currency and period when the text has none', () => {
    const result = setDraftField(draft({ currency: 'EUR', period: 'year' }), 'salary', '50-60k');
    expect(result).toMatchObject({
      salaryMin: '50000',
      salaryMax: '60000',
      currency: 'EUR',
      period: 'year',
    });
  });

  it('reads a bare $ from the site', () => {
    const result = setDraftField(draft(), 'salary', '$90,000', 'ca.indeed.com');
    expect(result).toMatchObject({ salaryMin: '90000', salaryMax: '90000', currency: 'CAD' });
  });

  it('returns undefined when the text has no amount', () => {
    expect(setDraftField(draft(), 'salary', 'Competitive, DOE')).toBeUndefined();
  });
});
