// Writes docs/screenshots/demo-data.json: a Career Pocket export with fictional jobs for
// screenshots and demos. Dates are relative to today, so re-run it before taking new shots:
//   node docs/screenshots/make-demo-data.mjs
// Then import the file in Settings → Data. All companies, people and URLs are made up.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DAY = 86_400_000;
const now = Date.now();
const at = (daysAgo, hour = 10) => {
  const d = new Date(now - daysAgo * DAY);
  d.setHours(hour, (daysAgo * 17) % 60, 0, 0);
  return d.getTime();
};

/** [status, days ago] steps, oldest first. */
const jobs = [
  {
    title: 'Senior Frontend Engineer',
    company: 'Northwind Labs',
    location: 'Berlin, Germany',
    workType: 'hybrid',
    salary: { min: 75000, max: 90000, currency: 'EUR', period: 'year' },
    source: 'LinkedIn',
    tags: ['react', 'priority'],
    steps: [
      ['saved', 24],
      ['applied', 23],
      ['assessment', 18],
      ['interview', 12],
    ],
    interviewIn: 2,
    contact: { name: 'Mira Hoffmann', email: 'mira@northwind.example' },
    resumeVersion: 'Frontend v3',
    notes: 'Final round with the design systems team. Prepare the component library case study.',
  },
  {
    title: 'Product Engineer',
    company: 'Lumen Health',
    location: 'Remote (EU)',
    workType: 'remote',
    salary: { min: 70000, max: 85000, currency: 'EUR', period: 'year' },
    source: 'Company site',
    tags: ['healthtech'],
    steps: [
      ['saved', 30],
      ['applied', 29],
      ['interview', 21],
      ['offer', 3],
    ],
    notes: 'Offer received. Reply by Friday. Ask about the learning budget.',
  },
  {
    title: 'Full Stack Developer',
    company: 'Brightpath',
    location: 'Amsterdam, Netherlands',
    workType: 'hybrid',
    salary: { min: 65000, max: 78000, currency: 'EUR', period: 'year' },
    source: 'Greenhouse',
    tags: ['svelte'],
    steps: [
      ['saved', 15],
      ['applied', 14],
      ['interview', 6],
    ],
    interviewIn: 5,
  },
  {
    title: 'Frontend Developer',
    company: 'Atlas Freight',
    location: 'London, UK',
    workType: 'onsite',
    salary: { min: 60000, max: 70000, currency: 'GBP', period: 'year' },
    source: 'Indeed',
    steps: [
      ['saved', 10],
      ['applied', 9],
      ['assessment', 4],
    ],
    followUpIn: 1,
    notes: 'Take-home due Monday: build a shipment tracker.',
  },
  {
    title: 'UI Engineer',
    company: 'Kestrel Games',
    location: 'Remote',
    workType: 'remote',
    salary: { min: 55, max: 70, currency: 'USD', period: 'hour' },
    source: 'Wellfound',
    tags: ['contract'],
    steps: [
      ['saved', 8],
      ['applied', 7],
    ],
    followUpIn: 0,
  },
  {
    title: 'Software Engineer, Web Platform',
    company: 'Cobalt Analytics',
    location: 'Dublin, Ireland',
    workType: 'hybrid',
    salary: { min: 80000, max: 95000, currency: 'EUR', period: 'year' },
    source: 'Lever',
    tags: ['priority'],
    steps: [
      ['saved', 4],
      ['applied', 3],
    ],
  },
  {
    title: 'Frontend Engineer',
    company: 'Tidepool Finance',
    location: 'Lisbon, Portugal',
    workType: 'remote',
    source: 'LinkedIn',
    steps: [
      ['saved', 3],
      ['applied', 2],
    ],
  },
  {
    title: 'JavaScript Developer',
    company: 'Orchard Retail',
    location: 'Munich, Germany',
    workType: 'onsite',
    salary: { min: 58000, max: 66000, currency: 'EUR', period: 'year' },
    source: 'Workday',
    steps: [
      ['saved', 1],
      ['applied', 1],
    ],
  },
  {
    title: 'Senior React Developer',
    company: 'Quartz Mobility',
    location: 'Remote (Europe)',
    workType: 'remote',
    salary: { min: 85000, max: 100000, currency: 'EUR', period: 'year' },
    source: 'LinkedIn',
    tags: ['react'],
    steps: [
      ['saved', 1],
      ['applied', 0],
    ],
  },
  {
    title: 'Web Developer',
    company: 'Fernwood Studio',
    location: 'Copenhagen, Denmark',
    workType: 'hybrid',
    source: 'Company site',
    steps: [['saved', 0]],
  },
  {
    title: 'Frontend Engineer II',
    company: 'Helix Robotics',
    location: 'Zurich, Switzerland',
    workType: 'onsite',
    salary: { min: 110000, max: 125000, currency: 'CHF', period: 'year' },
    source: 'Greenhouse',
    steps: [
      ['saved', 27],
      ['applied', 26],
      ['interview', 19],
      ['rejected', 13],
    ],
    notes: 'Good feedback on the pairing session; they went with someone with robotics experience.',
  },
  {
    title: 'Frontend Developer',
    company: 'Saffron Media',
    location: 'Remote',
    workType: 'remote',
    source: 'Indeed',
    steps: [
      ['saved', 35],
      ['applied', 34],
      ['ghosted', 13],
    ],
  },
  {
    title: 'Frontend Engineer, Growth',
    company: 'Meridian Books',
    location: 'Remote (UK)',
    workType: 'remote',
    source: 'LinkedIn',
    steps: [
      ['saved', 0],
      ['applied', 0],
    ],
  },
  {
    title: 'Svelte Developer',
    company: 'Ember Energy',
    location: 'Hamburg, Germany',
    workType: 'hybrid',
    salary: { min: 62000, max: 72000, currency: 'EUR', period: 'year' },
    source: 'Company site',
    tags: ['svelte'],
    steps: [
      ['saved', 2],
      ['applied', 1],
    ],
  },
  {
    title: 'Frontend Engineer',
    company: 'Willow Insurance',
    location: 'Paris, France',
    workType: 'hybrid',
    source: 'Indeed',
    steps: [
      ['saved', 3],
      ['applied', 2],
    ],
  },
  {
    title: 'TypeScript Engineer',
    company: 'Beacon Logistics',
    location: 'Remote',
    workType: 'remote',
    source: 'Lever',
    steps: [
      ['saved', 4],
      ['applied', 3],
    ],
  },
  {
    title: 'Design Engineer',
    company: 'Pinecone Travel',
    location: 'Barcelona, Spain',
    workType: 'hybrid',
    salary: { min: 52000, max: 60000, currency: 'EUR', period: 'year' },
    source: 'Wellfound',
    tags: ['design'],
    steps: [
      ['saved', 20],
      ['applied', 19],
    ],
    followUpIn: 3,
  },
  {
    title: 'Frontend Engineer',
    company: 'Granite Security',
    location: 'Vienna, Austria',
    workType: 'onsite',
    source: 'LinkedIn',
    steps: [
      ['saved', 17],
      ['applied', 16],
    ],
  },
];

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const records = jobs.map((job, i) => {
  const { steps, interviewIn, followUpIn, ...fields } = job;
  const history = steps.map(([status, daysAgo], k) => ({ status, at: at(daysAgo, 9 + k) }));
  const last = history.at(-1);
  return {
    id: `demo-${String(i + 1).padStart(2, '0')}-${slug(job.company)}`,
    url: `https://jobs.example.com/${slug(job.company)}/${slug(job.title)}`,
    ...fields,
    status: last.status,
    history,
    ...(interviewIn !== undefined ? { interviewAt: at(-interviewIn, 14) } : {}),
    ...(followUpIn !== undefined ? { followUpAt: at(-followUpIn, 9) } : {}),
    createdAt: history[0].at,
    updatedAt: last.at,
  };
});

const out = new URL('./demo-data.json', import.meta.url);
writeFileSync(out, JSON.stringify({ schemaVersion: 1, updatedAt: now, records }, null, 2) + '\n');
console.log(`Wrote ${records.length} demo jobs to ${fileURLToPath(out)}`);
