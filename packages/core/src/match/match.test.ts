import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type SkillIndex,
  analyzeJob,
  findSkills,
  lineImportance,
  loadSkillIndex,
  matchResume,
  resumeMatch,
  tokenize,
} from './index';
import { extractKeywords } from './keywords';
import skillsFile from './skills.json';

let index: SkillIndex;
beforeAll(async () => {
  index = await loadSkillIndex();
});

/** Names of the skills found in a text, in order of first appearance. */
const found = (text: string) => [
  ...new Set(findSkills(text, index).map((h) => index.skills[h.skill]!.name)),
];
const byImportance = (text: string) => {
  const { skills } = analyzeJob(text, index);
  return {
    required: skills
      .filter((s) => s.importance === 'required')
      .map((s) => s.name)
      .sort(),
    nice: skills
      .filter((s) => s.importance === 'nice')
      .map((s) => s.name)
      .sort(),
  };
};

describe('skills dictionary', () => {
  it('has roughly 600–1100 terms, each in a category', () => {
    expect(index.skills.length).toBeGreaterThanOrEqual(600);
    expect(index.skills.length).toBeLessThanOrEqual(1100);
    for (const skill of index.skills) expect(skill.category).toBeTruthy();
  });

  it('has no spelling shared by two skills', () => {
    const owner = new Map<string, string>();
    for (const entries of Object.values(skillsFile.categories)) {
      for (const entry of entries) {
        const [name, ...aliases] = (Array.isArray(entry) ? entry : [entry]) as string[];
        for (const spelling of [name!, ...aliases]) {
          const key = spelling.replace(/^!/, '').toLowerCase();
          expect(owner.get(key) ?? name, key).toBe(name);
          owner.set(key, name!);
        }
      }
    }
  });
});

describe('aliases', () => {
  it.each([
    ['js and ECMAScript', 'JavaScript'],
    ['nodejs and node', 'Node.js'],
    ['We run k8s', 'Kubernetes'],
    ['postgres or psql', 'PostgreSQL'],
    ['experience with golang', 'Go'],
    ['RESTful services', 'REST API'],
    ['sklearn models', 'scikit-learn'],
    ['Amazon Web Services', 'AWS'],
    ['GA4 reports', 'Google Analytics'],
  ])('"%s" → %s', (text, skill) => {
    expect(found(text)).toEqual([skill]);
  });

  it('matches across case and plural forms', () => {
    expect(found('DESIGN SYSTEMS and REST APIs')).toEqual(['Design systems', 'REST API']);
  });

  it('prefers the longest spelling', () => {
    expect(found('React Native apps')).toEqual(['React Native']);
    expect(found('Ruby on Rails')).toEqual(['Ruby on Rails']);
  });
});

describe('tricky terms', () => {
  it('keeps symbols that are part of a name', () => {
    expect(found('C++, C# and F#')).toEqual(['C++', 'C#', 'F#']);
    expect(found('Built on .NET and ASP.NET')).toEqual(['.NET', 'ASP.NET']);
    expect(found('We use Node.js.')).toEqual(['Node.js']);
    expect(found('CI/CD, CI-CD, ci cd')).toEqual(['CI/CD']);
  });

  it('tells C, C++ and C# apart', () => {
    expect(found('We write C++ daily')).toEqual(['C++']);
    expect(found('Experience in C and Python')).toEqual(['C', 'Python']);
  });

  it('finds Go only as the language', () => {
    expect(found('Experience with Go is required')).toEqual(['Go']);
    expect(found('Python, Go and Rust')).toEqual(['Python', 'Go', 'Rust']);
    expect(found('Go developer wanted')).toEqual(['Go']);
    expect(found('A good team. Go beyond the brief!')).toEqual([]);
    expect(found('Ready to go the extra mile')).toEqual([]);
    expect(found('Ready To Go Above And Beyond')).toEqual([]);
  });

  it('finds R only as the language', () => {
    expect(found('Analysis in R or Python')).toEqual(['R', 'Python']);
    expect(found('Strong R programming skills')).toEqual(['R']);
    expect(found('Our R&D team, r/programming, Section R.')).toEqual([]);
    expect(found('Letters a, b and r')).toEqual([]);
  });

  it('needs strict words capitalized', () => {
    expect(found('You will excel at this')).toEqual([]);
    expect(found('Advanced Excel and SQL')).toEqual(['Microsoft Excel', 'SQL']);
    expect(found('Take the rest of the day off')).toEqual([]);
    expect(found('make the most of it, later')).toEqual([]);
  });

  it('splits a missing space after a full stop', () => {
    expect(found('Experience with React.Strong communication')).toContain('React');
  });
});

describe('whole words only', () => {
  it('never matches inside another word', () => {
    expect(found('good goals, Rustic charm, javanese food, scalar')).toEqual([]);
    expect(found('reactive people, cssx, sqlite3x')).toEqual([]);
  });

  it('does not match across sentences', () => {
    expect(found('Learn about machine. Learning is fun')).toEqual([]);
  });
});

describe('sections: required vs nice-to-have', () => {
  it('reads headings', () => {
    const text = [
      'Requirements',
      '- TypeScript',
      'Nice to have:',
      '- GraphQL',
      'Responsibilities',
      '- Docker',
    ].join('\n');
    expect(byImportance(text)).toEqual({ required: ['Docker', 'TypeScript'], nice: ['GraphQL'] });
  });

  it.each([
    ['Preferred qualifications', 'nice'],
    ['Bonus points:', 'nice'],
    ['**Nice-to-haves**', 'nice'],
    ['It would be great if you have', 'nice'],
    ['Basic Qualifications', 'required'],
    ["What we're looking for:", 'required'],
    ['Must have', 'required'],
    ['### Requirements', 'required'],
  ])('"%s" → %s', (heading, kind) => {
    expect(lineImportance(`Intro\n${heading}\nKotlin`)[2]!.kind).toBe(kind);
  });

  it('reads cues on a single line', () => {
    expect(byImportance('Experience with Rust is a plus.\nPython')).toEqual({
      required: ['Python'],
      nice: ['Rust'],
    });
    expect(byImportance('Kafka preferred')).toEqual({ required: [], nice: ['Apache Kafka'] });
    expect(byImportance('5 years of Java, ideally with Kotlin')).toEqual({
      required: ['Java'],
      nice: ['Kotlin'],
    });
    expect(byImportance('Nice to have: Rust\nGo developer')).toEqual({
      required: ['Go'],
      nice: ['Rust'],
    });
  });

  it('defaults to required when unclear', () => {
    expect(byImportance('We use Python and Docker every day.')).toEqual({
      required: ['Docker', 'Python'],
      nice: [],
    });
  });

  it('counts a skill as required if it is required anywhere', () => {
    const text = 'Requirements\nPython\nNice to have\nPython, Go';
    expect(byImportance(text)).toEqual({ required: ['Python'], nice: ['Go'] });
  });

  it('a short bullet is not a heading', () => {
    const text = 'Nice to have\n- Kubernetes skills\n- Strong experience with Terraform';
    expect(byImportance(text)).toEqual({ required: [], nice: ['Kubernetes', 'Terraform'] });
  });
});

describe('other keywords', () => {
  const none = () => false;

  it('finds repeated 2–3 word phrases', () => {
    const text =
      'You will own the supply chain. Our supply chain is global. Improve supply chain visibility.';
    expect(extractKeywords(text, none).map((k) => k.phrase)).toEqual(['supply chain']);
  });

  it('skips stopwords, generic job words and one-off phrases', () => {
    const text =
      'The team will work with the team. Strong experience required, strong experience preferred. Years of experience. Unique phrase here.';
    expect(extractKeywords(text, none)).toEqual([]);
  });

  it('skips names (always capitalized) and dictionary skills', () => {
    const text = 'Join Acme Robotics. Acme Robotics builds. machine learning, machine learning';
    const isSkill = (p: string) => findSkills(p, index).length > 0;
    expect(extractKeywords(text, isSkill)).toEqual([]);
  });

  it('caps the list at 10', () => {
    const phrases = Array.from({ length: 15 }, (_, i) => `alpha${'x'.repeat(i)} beta`);
    const text = [...phrases, ...phrases].join('. ');
    expect(extractKeywords(text, none)).toHaveLength(10);
  });

  it('matches keywords in the resume, plural-insensitive', () => {
    const job = analyzeJob('Own customer journeys. Map customer journeys. Data.', index);
    const result = matchResume(job, 'I mapped the customer journey end to end', index);
    expect(result.keywords).toEqual({ found: ['customer journeys'], missing: [] });
  });
});

describe('matchResume', () => {
  const job =
    'Requirements\nTypeScript, React, GraphQL, communication skills\nNice to have\nRust, Go';

  it('splits matched and missing, required and nice-to-have', async () => {
    const result = await resumeMatch(job, 'Skills: typescript, React.js, golang');
    expect(result.required.matched.map((s) => s.name)).toEqual(['React', 'TypeScript']);
    expect(result.required.missing.map((s) => s.name)).toEqual(['Communication', 'GraphQL']);
    expect(result.niceToHave.matched.map((s) => s.name)).toEqual(['Go']);
    expect(result.niceToHave.missing.map((s) => s.name)).toEqual(['Rust']);
    expect(result.summary).toBe('Matches 2 of 4 required skills and 1 of 2 nice-to-have');
  });

  it('leaves out skills on the ignore list (any case, any alias)', async () => {
    const result = await resumeMatch(job, 'TypeScript', { ignored: ['COMMUNICATION', 'golang'] });
    const names = [...result.required.missing, ...result.niceToHave.missing].map((s) => s.name);
    expect(names).not.toContain('Communication');
    expect(names).not.toContain('Go');
    expect(result.ignored.sort()).toEqual(['Communication', 'Go']);
    expect(result.summary).toBe('Matches 1 of 3 required skills and 0 of 1 nice-to-have');
  });

  it('handles an empty resume or description', async () => {
    const empty = await resumeMatch(job, '');
    expect(empty.required.matched).toEqual([]);
    expect(empty.required.missing).toHaveLength(4);
    const nothing = await resumeMatch('', 'TypeScript');
    expect(nothing.summary).toBe('No skills from the dictionary found in this description');
    expect(nothing.keywords).toEqual({ found: [], missing: [] });
    expect((await resumeMatch('Great culture and snacks', 'x')).required.missing).toEqual([]);
  });

  it('says "1 of 1 required skill" in the singular', async () => {
    expect((await resumeMatch('Python', 'Python')).summary).toBe('Matches 1 of 1 required skill');
  });

  it('is fast on very long texts', () => {
    const paragraph =
      'We build distributed systems in Go and Python on Kubernetes, with PostgreSQL, Kafka and React.\nNice to have: Rust.\n';
    const long = paragraph.repeat(2500); // ~290 KB
    const started = performance.now();
    const result = matchResume(analyzeJob(long, index), long, index);
    const elapsed = performance.now() - started;
    expect(result.required.matched.length).toBeGreaterThan(5);
    expect(elapsed).toBeLessThan(2000);
  });

  it('tokenizes a megabyte without trouble', () => {
    expect(tokenize('word '.repeat(200_000)).length).toBe(200_000);
  });
});

/**
 * Five job descriptions from different fields (written for these tests in the style of real
 * postings; the companies are made up), with what the matcher should find.
 */
describe('fixtures', () => {
  const read = (name: string) =>
    readFileSync(new URL(`./__fixtures__/${name}.txt`, import.meta.url), 'utf8');

  const expected: Record<string, { required: string[]; nice: string[]; keywords: string[] }> = {
    frontend: {
      required: [
        'Accessibility',
        'CI/CD',
        'CSS',
        'Design systems',
        'Figma',
        'Git',
        'GraphQL',
        'HTML',
        'JavaScript',
        'Jest',
        'Playwright',
        'React',
        'Redux',
        'Responsive design',
        'REST API',
        'TypeScript',
        'Unit testing',
        'Web performance',
        'Zustand',
      ],
      nice: [
        'D3.js',
        'Data visualization',
        'Next.js',
        'Node.js',
        'Server-side rendering',
        'Storybook',
      ],
      keywords: [],
    },
    backend: {
      required: [
        'Apache Kafka',
        'AWS',
        'Backend development',
        'C++',
        'Distributed systems',
        'Docker',
        'Event-driven architecture',
        'Go',
        'gRPC',
        'Incident management',
        'Java',
        'Kubernetes',
        'Microservices',
        'PostgreSQL',
        'Query optimization',
        'REST API',
        'SQL',
        'Terraform',
      ],
      nice: ['Grafana', 'Observability', 'Prometheus', 'Redis', 'Rust'],
      keywords: [],
    },
    data: {
      required: [
        'A/B testing',
        'Apache Airflow',
        'Dashboards',
        'Data pipelines',
        'Data science',
        'dbt',
        'Experimentation',
        'Hypothesis testing',
        'Machine learning',
        'NumPy',
        'Pandas',
        'Python',
        'Regression analysis',
        'scikit-learn',
        'Snowflake',
        'SQL',
        'Statistics',
        'Tableau',
      ],
      nice: ['Apache Spark', 'Causal inference', 'Databricks', 'R'],
      keywords: [],
    },
    marketing: {
      required: [
        'A/B testing',
        'Communication',
        'Content marketing',
        'Conversion rate optimization',
        'Copywriting',
        'Digital marketing',
        'Email marketing',
        'Google Ads',
        'Google Analytics',
        'Influencer marketing',
        'Klaviyo',
        'Landing pages',
        'Looker Studio',
        'Meta Ads',
        'Paid media',
        'Paid social',
        'Project management',
        'ROI analysis',
        'SEO',
        'Shopify',
        'Storytelling',
        'TikTok Ads',
      ],
      nice: ['Adobe Photoshop', 'Canva', 'E-commerce', 'HubSpot'],
      keywords: ['customer journey'],
    },
    sales: {
      required: [
        'Account executive',
        'B2B',
        'Customer retention',
        'Customer success',
        'Gong',
        'MEDDIC',
        'Negotiation',
        'Outbound sales',
        'Presentation skills',
        'Product demos',
        'Prospecting',
        'Quota attainment',
        'Salesforce',
        'SaaS sales',
      ],
      nice: ['French', 'German'],
      keywords: ['sales cycle'],
    },
  };

  it.each(Object.keys(expected))('%s', (name) => {
    const analysis = analyzeJob(read(name), index);
    const sorted = (list: string[]) => [...list].sort((a, b) => a.localeCompare(b));
    expect(
      sorted(analysis.skills.filter((s) => s.importance === 'required').map((s) => s.name)),
    ).toEqual(sorted(expected[name]!.required));
    expect(
      sorted(analysis.skills.filter((s) => s.importance === 'nice').map((s) => s.name)),
    ).toEqual(sorted(expected[name]!.nice));
    expect(analysis.keywords.map((k) => k.phrase)).toEqual(expected[name]!.keywords);
  });

  it('matches a frontend resume against the frontend posting', () => {
    const resume = `Jane Doe — Frontend Developer
Skills: JavaScript (ES6), TypeScript, React, Redux, HTML5, CSS3, Sass, Jest, Cypress, Git, Figma
Built a component library (design system) used by 4 teams; improved Core Web Vitals.
Next.js side projects. Node.js APIs.`;
    const result = matchResume(analyzeJob(read('frontend'), index), resume, index);
    expect(result.required.matched.map((s) => s.name).sort()).toEqual(
      [
        'CSS',
        'Design systems',
        'Figma',
        'Git',
        'HTML',
        'JavaScript',
        'Jest',
        'React',
        'Redux',
        'TypeScript',
        'Web performance',
      ].sort(),
    );
    expect(result.niceToHave.matched.map((s) => s.name).sort()).toEqual(['Next.js', 'Node.js']);
    expect(result.summary).toBe('Matches 11 of 19 required skills and 2 of 6 nice-to-have');
  });
});
