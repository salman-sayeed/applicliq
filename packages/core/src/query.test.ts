import { describe, expect, it } from 'vitest';
import { filterJobs, jobFacets, sortJobs } from './query';
import type { Job } from './types';

const job = (id: string, extra: Partial<Job> = {}): Job => ({
  id,
  url: `https://a.test/${id}`,
  title: `Job ${id}`,
  company: 'Acme',
  status: 'saved',
  history: [],
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});

const ids = (jobs: Job[]) => jobs.map((j) => j.id);

describe('filterJobs', () => {
  const jobs = [
    job('a', {
      title: 'Frontend Engineer',
      status: 'applied',
      tags: ['dream'],
      source: 'linkedin',
      workType: 'remote',
    }),
    job('b', {
      title: 'Backend Engineer',
      company: 'Globex',
      notes: 'Referral from Sam',
      source: 'indeed',
    }),
    job('c', {
      title: 'Designer',
      contact: { name: 'Priya Rao' },
      workType: 'onsite',
      tags: ['design'],
    }),
  ];

  it('returns everything for an empty filter', () => {
    expect(ids(filterJobs(jobs, {}))).toEqual(['a', 'b', 'c']);
  });

  it('searches title, company, notes, contact and tags; every word must match', () => {
    expect(ids(filterJobs(jobs, { query: 'engineer' }))).toEqual(['a', 'b']);
    expect(ids(filterJobs(jobs, { query: 'ENGINEER globex' }))).toEqual(['b']);
    expect(ids(filterJobs(jobs, { query: 'referral' }))).toEqual(['b']);
    expect(ids(filterJobs(jobs, { query: 'priya' }))).toEqual(['c']);
    expect(ids(filterJobs(jobs, { query: 'dream' }))).toEqual(['a']);
    expect(ids(filterJobs(jobs, { query: '   ' }))).toEqual(['a', 'b', 'c']);
  });

  it('filters by status, tag, source and work type, combined', () => {
    expect(ids(filterJobs(jobs, { status: 'applied' }))).toEqual(['a']);
    expect(ids(filterJobs(jobs, { tag: 'design' }))).toEqual(['c']);
    expect(ids(filterJobs(jobs, { tag: 'DREAM' }))).toEqual(['a']);
    expect(ids(filterJobs(jobs, { source: 'indeed' }))).toEqual(['b']);
    expect(ids(filterJobs(jobs, { workType: 'onsite' }))).toEqual(['c']);
    expect(ids(filterJobs(jobs, { workType: 'remote', query: 'backend' }))).toEqual([]);
  });
});

describe('sortJobs', () => {
  it('sorts text naturally and case-insensitively', () => {
    const jobs = [
      job('1', { title: 'engineer 10' }),
      job('2', { title: 'Engineer 9' }),
      job('3', { title: 'Analyst' }),
    ];
    expect(ids(sortJobs(jobs, 'title', 'asc'))).toEqual(['3', '2', '1']);
    expect(ids(sortJobs(jobs, 'title', 'desc'))).toEqual(['1', '2', '3']);
  });

  it('sorts statuses in pipeline order, not alphabetically', () => {
    const jobs = [
      job('o', { status: 'offer' }),
      job('s', { status: 'saved' }),
      job('i', { status: 'interview' }),
    ];
    expect(ids(sortJobs(jobs, 'status', 'asc'))).toEqual(['s', 'i', 'o']);
  });

  it('puts missing values last in both directions', () => {
    const jobs = [job('none'), job('late', { interviewAt: 20 }), job('soon', { interviewAt: 10 })];
    expect(ids(sortJobs(jobs, 'interviewAt', 'asc'))).toEqual(['soon', 'late', 'none']);
    expect(ids(sortJobs(jobs, 'interviewAt', 'desc'))).toEqual(['late', 'soon', 'none']);
  });

  it('sorts salary by the upper bound, falling back to the lower', () => {
    const jobs = [job('a', { salary: { min: 50 } }), job('b', { salary: { min: 10, max: 90 } })];
    expect(ids(sortJobs(jobs, 'salary', 'desc'))).toEqual(['b', 'a']);
  });

  it('breaks ties by most recently updated and does not mutate the input', () => {
    const jobs = [job('old', { updatedAt: 1 }), job('new', { updatedAt: 2 })];
    expect(ids(sortJobs(jobs, 'company', 'asc'))).toEqual(['new', 'old']);
    expect(ids(jobs)).toEqual(['old', 'new']);
  });
});

describe('jobFacets', () => {
  it('collects unique (ignoring case), sorted, non-empty values', () => {
    const jobs = [
      job('a', { tags: ['remote-ok', 'Dream'], source: 'linkedin', resumeVersion: 'v2' }),
      job('b', { tags: ['dream', 'Dream'], source: 'indeed', resumeVersion: ' ' }),
      job('c', { source: 'linkedin' }),
    ];
    expect(jobFacets(jobs)).toEqual({
      tags: ['Dream', 'remote-ok'],
      sources: ['indeed', 'linkedin'],
      resumeVersions: ['v2'],
    });
  });
});
