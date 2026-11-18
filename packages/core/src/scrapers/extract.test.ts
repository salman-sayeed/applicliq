// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractJob } from './extract';
import { MAX_DESCRIPTION_BYTES } from './text';

function fixture(name: string, url: string) {
  const html = readFileSync(join(import.meta.dirname, '__fixtures__', name), 'utf8');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return extractJob(doc, new URL(url));
}

describe('extractJob: JSON-LD', () => {
  const result = fixture(
    'json-ld-graph.html',
    'https://careers.stark.test/jobs/42?utm_source=newsletter#apply',
  );

  it('finds the JobPosting inside an array and @graph, skipping a broken block', () => {
    expect(result.job).toMatchObject({
      url: 'https://careers.stark.test/jobs/42',
      source: 'careers.stark.test',
      title: 'Staff Engineer, Payments & Billing',
      company: 'Stark Industries',
      location: 'Germany / Netherlands',
      workType: 'remote',
      salary: { min: 90_000, max: 120_000, currency: 'EUR', period: 'year' },
    });
  });

  it('turns escaped description HTML into plain text, dropping scripts', () => {
    expect(result.job.descriptionSnapshot).toBe(
      'Own our payments platform.\n\n• Design APIs\n• Mentor engineers',
    );
  });

  it('is highly confident', () => {
    expect(result.confidence).toBe(1);
    expect(result.sources).toEqual(['json-ld']);
  });
});

describe('extractJob: site adapters', () => {
  it('LinkedIn public page', () => {
    const { job, confidence, sources } = fixture(
      'linkedin-public.html',
      'https://www.linkedin.com/jobs/view/senior-frontend-engineer-at-initrode-3998877665?trk=public_jobs',
    );
    expect(job).toMatchObject({
      url: 'https://www.linkedin.com/jobs/view/3998877665',
      source: 'linkedin',
      title: 'Senior Frontend Engineer',
      company: 'Initrode',
      location: 'Berlin, Berlin, Germany',
      workType: 'hybrid', // from "This is a hybrid role" in the description
      salary: { min: 70_000, max: 90_000, currency: 'EUR', period: 'year' },
    });
    expect(job.descriptionSnapshot).toBe(
      'About the role\n\nThis is a hybrid role with 3 days a week in our Berlin office.\n\n' +
        '• Build our design system in TypeScript\n• Ship accessible UI',
    );
    expect(sources).toEqual(['linkedin', 'text']);
    expect(confidence).toBeGreaterThan(0.85);
  });

  it('LinkedIn search results side panel (logged in), using currentJobId', () => {
    const { job } = fixture(
      'linkedin-search.html',
      'https://www.linkedin.com/jobs/search/?currentJobId=3912345678&keywords=platform',
    );
    expect(job).toMatchObject({
      url: 'https://www.linkedin.com/jobs/view/3912345678',
      title: 'Platform Engineer',
      company: 'Hooli',
      location: 'Toronto, Ontario, Canada',
      workType: 'remote',
      salary: { min: 140_000, max: 165_000, currency: 'CAD', period: 'year' },
    });
    expect(job.descriptionSnapshot).toContain('You will own our Kubernetes platform.');
  });

  it('Indeed', () => {
    const { job } = fixture(
      'indeed.html',
      'https://ca.indeed.com/viewjob?jk=a1b2c3d4e5f6&from=serp&vjs=3',
    );
    expect(job).toMatchObject({
      url: 'https://ca.indeed.com/viewjob?jk=a1b2c3d4e5f6',
      source: 'indeed',
      title: 'Backend Developer',
      company: 'Vehement Capital Partners',
      location: 'Toronto, ON',
      workType: 'hybrid',
      // A bare "$" on indeed.ca's Canadian site means Canadian dollars.
      salary: { min: 85_000, max: 100_000, currency: 'CAD', period: 'year' },
    });
    expect(job.descriptionSnapshot).toContain('• Write Go services\n• Operate PostgreSQL');
  });

  it('Glassdoor', () => {
    const { job } = fixture(
      'glassdoor.html',
      'https://www.glassdoor.com/job-listing/data-analyst-globex-JV_KO0,12.htm?jl=1009123456789',
    );
    expect(job).toMatchObject({
      source: 'glassdoor',
      title: 'Data Analyst',
      company: 'Globex Corporation', // rating "4.1 ★" stripped
      location: 'Remote',
      workType: 'remote',
      salary: { min: 55_000, max: 70_000, currency: 'EUR' },
    });
  });

  it('Bdjobs', () => {
    const { job } = fixture('bdjobs.html', 'https://jobs.bdjobs.com/jobdetails.asp?id=1234567');
    expect(job).toMatchObject({
      url: 'https://jobs.bdjobs.com/jobdetails.asp?id=1234567',
      source: 'bdjobs',
      title: 'Software Engineer (Laravel)',
      company: 'Shonar Bangla Tech Ltd.',
      location: 'Dhaka (Gulshan)',
      workType: 'onsite', // "Work at office"
      salary: { min: 30_000, max: 45_000, currency: 'BDT', period: 'month' },
    });
    // Every section of the posting is kept, in page order.
    expect(job.descriptionSnapshot).toMatch(
      /^Job Context\n\nWe are expanding[\s\S]*• Develop REST APIs with Laravel[\s\S]*B\.Sc in CSE/,
    );
  });

  it('Wellfound', () => {
    const { job } = fixture(
      'wellfound.html',
      'https://wellfound.com/jobs/2984512-senior-product-designer',
    );
    expect(job).toMatchObject({
      source: 'wellfound',
      title: 'Senior Product Designer',
      company: 'Initech',
      location: 'United States',
      workType: 'remote',
      salary: { min: 130_000, max: 160_000, currency: 'USD' },
    });
  });

  it('Greenhouse', () => {
    const { job, sources } = fixture(
      'greenhouse.html',
      'https://job-boards.greenhouse.io/hooli/jobs/4012345?gh_src=abc',
    );
    expect(job).toMatchObject({
      url: 'https://job-boards.greenhouse.io/hooli/jobs/4012345',
      source: 'greenhouse',
      title: 'Machine Learning Engineer',
      company: 'Hooli', // from the logo's alt text
      location: 'San Francisco, CA (Hybrid)',
      workType: 'hybrid',
      salary: { min: 140_000, max: 180_000, currency: 'USD' },
    });
    expect(job.descriptionSnapshot).toContain('• Train ranking models');
    expect(job.descriptionSnapshot).not.toContain('Apply');
    expect(sources).toEqual(['greenhouse']);
  });

  it('Lever', () => {
    const { job } = fixture(
      'lever.html',
      'https://jobs.lever.co/vandelay/7b1e0c2a-5f3d-4c8e-9a61-2d4f8e9b0c11?lever-source=LinkedIn',
    );
    expect(job).toMatchObject({
      url: 'https://jobs.lever.co/vandelay/7b1e0c2a-5f3d-4c8e-9a61-2d4f8e9b0c11',
      source: 'lever',
      title: 'Data Engineer',
      company: 'Vandelay Industries',
      location: 'London, United Kingdom',
      workType: 'hybrid',
      salary: { min: 60_000, max: 75_000, currency: 'GBP', period: 'year' },
    });
    expect(job.descriptionSnapshot).toBe(
      "Vandelay Industries imports and exports.\n\nWhat you'll do\n\n" +
        '• Build Airflow pipelines\n• Model data in dbt',
    );
  });

  it('Workday: JSON-LD wins over the adapter, which fills the gaps', () => {
    const { job, sources } = fixture(
      'workday.html',
      'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Austin-TX/Software-Engineer-II_R12345',
    );
    expect(job).toMatchObject({
      source: 'workday',
      title: 'Software Engineer II',
      company: 'Acme Corporation', // JSON-LD, not the guessed tenant "Acme"
      location: 'Austin, TX, United States of America',
      workType: 'hybrid', // only the adapter knows this
    });
    // Plain-text JSON-LD description keeps its own line breaks.
    expect(job.descriptionSnapshot).toBe(
      "Join the team that builds Acme's anvils.\nWe value craft.",
    );
    expect(sources).toEqual(['json-ld', 'workday']);
  });
});

describe('extractJob: meta fallback', () => {
  it('splits "Title at Company" and detects the work type from the description', () => {
    const { job, confidence, sources } = fixture(
      'generic-meta.html',
      'https://umbrella.test/careers/platform-engineer',
    );
    expect(job).toMatchObject({
      title: 'Platform Engineer',
      company: 'Umbrella',
      workType: 'remote',
      descriptionSnapshot: 'Help us run a fully remote platform team. Salary: £70,000.',
    });
    expect(sources).toEqual(['meta', 'text']);
    // Same fields as a structured source would give, but trusted much less.
    expect(confidence).toBeGreaterThan(0.3);
    expect(confidence).toBeLessThan(0.6);
  });

  it('returns just the URL and zero confidence for a page with nothing to extract', () => {
    expect(fixture('empty.html', 'https://example.test/page#top')).toEqual({
      job: { url: 'https://example.test/page', source: 'example.test' },
      confidence: 0,
      sources: [],
    });
  });

  it('builds the snapshot from a short meta description when the page has no posting', () => {
    const doc = new DOMParser().parseFromString(
      '<title>Engineer - Acme | Careers</title><meta name="description" content="Join us.">',
      'text/html',
    );
    const { job } = extractJob(doc, new URL('https://acme.test/x'));
    expect(job).toMatchObject({ title: 'Engineer - Acme', descriptionSnapshot: 'Join us.' });
  });
});

describe('extractJob: robustness', () => {
  it('caps the description snapshot at 20KB of UTF-8 without splitting characters', () => {
    const long = 'Ünïcödé “quotes” ৳ '.repeat(3_000);
    const doc = new DOMParser().parseFromString(
      `<script type="application/ld+json">${JSON.stringify({
        '@type': 'JobPosting',
        title: 'T',
        description: long,
      })}</script>`,
      'text/html',
    );
    const snapshot = extractJob(doc, new URL('https://a.test')).job.descriptionSnapshot!;
    const bytes = new TextEncoder().encode(snapshot).length;
    expect(bytes).toBeLessThanOrEqual(MAX_DESCRIPTION_BYTES);
    expect(bytes).toBeGreaterThan(MAX_DESCRIPTION_BYTES - 8);
    expect(snapshot).not.toContain('�');
    expect(long.startsWith(snapshot)).toBe(true);
  });

  it('never throws, even on a page whose DOM access fails', () => {
    const doc = new DOMParser().parseFromString('<h1>x</h1>', 'text/html');
    doc.querySelectorAll = () => {
      throw new Error('boom');
    };
    expect(() => extractJob(doc, new URL('https://www.linkedin.com/jobs/view/1/'))).not.toThrow();
  });
});
