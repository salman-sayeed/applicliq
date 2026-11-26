// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { detectConfirmation } from './dom/confirm';
import { fillQuestion, setNativeValue } from './dom/fill';
import { isConsentQuestion, neverFill } from './dom/rules';
import { type FormScan, scanForm } from './dom/scan';

function page(
  html: string,
  url = 'https://careers.example.test/apply',
): FormScan & { doc: Document } {
  document.body.innerHTML = html;
  return { doc: document, ...scanForm(document, new URL(url), { layout: false }) };
}

const ref = (scan: FormScan, label: string) => {
  const found = [...scan.refs.values()].find((r) => r.question.label === label);
  if (!found) throw new Error(`No question "${label}"`);
  return found;
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('never fill', () => {
  it('skips hidden, honeypot, password, CAPTCHA and disabled fields', () => {
    const scan = page(`
      <label for="a">Email</label><input id="a" type="email">
      <input type="hidden" name="token" value="x">
      <div style="display:none"><label for="b">Phone</label><input id="b"></div>
      <label for="c">Website</label><input id="c" name="honeypot">
      <label for="d">Leave this blank</label><input id="d" aria-label="Leave this field blank">
      <label for="e">Password</label><input id="e" type="password">
      <div class="g-recaptcha"><textarea id="g-recaptcha-response"></textarea></div>
      <div class="h-captcha"><input name="h-captcha-response"></div>
      <label for="f">City</label><input id="f" disabled>
      <label for="g">Country</label><input id="g" readonly>
      <label hidden for="h">Name</label><input id="h" hidden>
      <span aria-hidden="true"><input id="i" aria-label="Last name"></span>
    `);
    expect(scan.result.questions.map((q) => q.label)).toEqual(['Email']);
  });

  it('reports file inputs (never filled) with their label', () => {
    const scan = page(`<label for="cv">Resume / CV</label><input id="cv" type="file">`);
    expect(scan.result.questions).toMatchObject([{ label: 'Resume / CV', kind: 'file' }]);
  });

  it('checks single elements', () => {
    document.body.innerHTML = `<input id="p" type="password"><input id="ok">`;
    expect(neverFill(document.getElementById('p')!, { layout: false })).toBe('password');
    expect(neverFill(document.getElementById('ok')!, { layout: false })).toBeUndefined();
    expect(isConsentQuestion('I agree to the terms and conditions')).toBe(true);
    expect(isConsentQuestion('Phone', ['Yes - I consent to SMS'])).toBe(true);
    expect(isConsentQuestion('How did you hear about us?')).toBe(false);
  });

  it('notices the value a field already has', () => {
    const scan = page(`<label for="a">Email</label><input id="a" value="old@example.test">`);
    expect(scan.result.questions[0]).toMatchObject({ currentValue: 'old@example.test' });
  });
});

describe('labels', () => {
  it('reads aria-labelledby, wrapping labels, legends, aria-label and placeholders', () => {
    const scan = page(`
      <span id="t">Current company</span><input aria-labelledby="t">
      <label>Phone <input type="tel"></label>
      <fieldset><legend>Do you need sponsorship?</legend>
        <label><input type="radio" name="s" value="y"> Yes</label>
        <label><input type="radio" name="s" value="n"> No</label>
      </fieldset>
      <input aria-label="LinkedIn profile URL">
      <input placeholder="Your GitHub">
      <input aria-label="Single line text" placeholder="Enter your answer">
    `);
    expect(scan.result.questions.map((q) => [q.label, q.kind])).toEqual([
      ['Current company', 'text'],
      ['Phone', 'tel'],
      ['Do you need sponsorship?', 'radio'],
      ['LinkedIn profile URL', 'text'],
      ['Your GitHub', 'text'],
      ['', 'text'],
    ]);
  });
});

describe('filling, the way frameworks notice', () => {
  it('uses the native setter and fires input, change and blur', () => {
    const scan = page(`<label for="a">Email</label><input id="a">`);
    const input = document.getElementById('a') as HTMLInputElement;
    // React keeps its own copy of the value on the element; writing `el.value` directly would
    // update only that copy. The prototype's setter updates the real value.
    let shadow = '';
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => shadow,
      set: (v: string) => (shadow = v),
    });
    const events: string[] = [];
    for (const type of ['input', 'change', 'blur'])
      input.addEventListener(type, () => events.push(type));
    return fillQuestion(ref(scan, 'Email'), { value: 'ada@example.test' }).then((outcome) => {
      expect(outcome.ok).toBe(true);
      expect(shadow).toBe('');
      expect(input.getAttribute('value') ?? '').toBe('');
      delete (input as unknown as Record<string, unknown>).value;
      expect(input.value).toBe('ada@example.test');
      expect(events).toEqual(['input', 'change', 'blur']);
    });
  });

  it('sets textareas and selects', async () => {
    const scan = page(`
      <label for="t">Tell us about yourself</label><textarea id="t"></textarea>
      <label for="s">Years of experience</label>
      <select id="s"><option value="">Select…</option><option value="a">0-2</option><option value="b">3-5</option></select>
    `);
    await fillQuestion(ref(scan, 'Tell us about yourself'), { value: 'Hello' });
    await fillQuestion(ref(scan, 'Years of experience'), { value: '3-5' });
    expect((document.getElementById('t') as HTMLTextAreaElement).value).toBe('Hello');
    expect((document.getElementById('s') as HTMLSelectElement).value).toBe('b');
  });

  it('clicks radios and checkboxes', async () => {
    const scan = page(`
      <fieldset><legend>Willing to relocate?</legend>
        <label><input type="radio" name="r" value="1"> Yes</label>
        <label><input type="radio" name="r" value="0"> No</label>
      </fieldset>
      <fieldset><legend>Pronouns</legend>
        <label><input type="checkbox" name="p" value="She/her"> She/her</label>
        <label><input type="checkbox" name="p" value="They/them"> They/them</label>
      </fieldset>
    `);
    expect(await fillQuestion(ref(scan, 'Willing to relocate?'), { value: 'Yes' })).toMatchObject({
      ok: true,
    });
    await fillQuestion(ref(scan, 'Pronouns'), { value: 'She/her', values: ['She/her'] });
    const checked = [...document.querySelectorAll('input:checked')].map(
      (i) => (i as HTMLInputElement).value,
    );
    expect(checked).toEqual(['1', 'She/her']);
  });

  it('clicks ARIA radios (Google Forms) and Yes/No buttons (Ashby)', async () => {
    const scan = page(
      `
      <div class="ashby-application-form-field-entry">
        <label class="ashby-application-form-question-title" for="x">Need sponsorship?</label>
        <div class="ashby-application-form-input-yesno">
          <button aria-pressed="false">Yes</button><button aria-pressed="false">No</button>
          <input type="checkbox" tabindex="-1" name="x">
        </div>
      </div>
      <div class="ashby-application-form-field-entry">
        <label class="ashby-application-form-question-title">Hours</label>
        <div role="radiogroup">
          <div role="radio" aria-checked="false" data-value="Part time"></div>
          <div role="radio" aria-checked="false" data-value="Full time"></div>
        </div>
      </div>`,
      'https://jobs.ashbyhq.com/acme/1/application',
    );
    const buttons = [...document.querySelectorAll('button')];
    buttons.forEach((b) =>
      b.addEventListener('click', () => b.setAttribute('aria-pressed', 'true')),
    );
    document
      .querySelectorAll('[role="radio"]')
      .forEach((r) => r.addEventListener('click', () => r.setAttribute('aria-checked', 'true')));
    await fillQuestion(ref(scan, 'Need sponsorship?'), { value: 'No' });
    await fillQuestion(ref(scan, 'Hours'), { value: 'Full time' });
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect(document.querySelector('[data-value="Full time"]')!.getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  /** A react-select-like dropdown: typing filters, ArrowDown lists everything, a click picks. */
  function fakeSelect(options: string[]) {
    const scan = page(`
      <div class="field-wrapper"><label id="l" for="c">Gender</label>
        <div class="select__control"><div class="select__single-value"></div>
          <input id="c" role="combobox" aria-labelledby="l" aria-controls="menu">
        </div>
        <div id="menu" role="listbox"></div>
      </div>`);
    const input = document.getElementById('c') as HTMLInputElement;
    const menu = document.getElementById('menu')!;
    const show = (list: string[]) => {
      menu.innerHTML = '';
      for (const text of list) {
        const option = document.createElement('div');
        option.setAttribute('role', 'option');
        option.textContent = text;
        option.addEventListener('click', () => {
          document.querySelector('.select__single-value')!.textContent = text;
          menu.innerHTML = '';
        });
        menu.append(option);
      }
    };
    input.addEventListener('input', () => {
      const q = input.value.toLowerCase();
      show(q ? options.filter((o) => o.toLowerCase().includes(q)) : []);
    });
    input.addEventListener('keydown', (e) => e.key === 'ArrowDown' && show(options));
    return {
      scan,
      picked: () => document.querySelector('.select__single-value')!.textContent,
      input,
    };
  }

  it('searches a custom dropdown and picks the matching option', async () => {
    const { scan, picked } = fakeSelect(['United Kingdom +44', 'United States +1']);
    expect(await fillQuestion(ref(scan, 'Gender'), { value: 'United Kingdom' })).toMatchObject({
      ok: true,
    });
    expect(picked()).toBe('United Kingdom +44');
  });

  it('opens the whole list for ranges and "decline" answers', async () => {
    const { scan, picked } = fakeSelect(['Male', 'Female', 'Decline To Self Identify']);
    await fillQuestion(ref(scan, 'Gender'), { value: 'Decline', optionKind: 'decline' });
    expect(picked()).toBe('Decline To Self Identify');
  });

  it('leaves a dropdown untouched when nothing matches', async () => {
    const { scan, picked, input } = fakeSelect(['Male', 'Female']);
    const outcome = await fillQuestion(
      ref(scan, 'Gender'),
      { value: 'Astronaut' },
      { optionTimeout: 30, step: 5 },
    );
    expect(outcome).toEqual({ ok: false, reason: 'no-option' });
    expect(picked()).toBe('');
    expect(input.value).toBe('');
  });

  it('reports a question that left the page', async () => {
    const scan = page(`<label for="a">Email</label><input id="a">`);
    const r = ref(scan, 'Email');
    document.body.innerHTML = '';
    expect(await fillQuestion(r, { value: 'x' })).toEqual({ ok: false, reason: 'gone' });
  });
});

describe('undo', () => {
  it('puts back text, selections and choices', async () => {
    const scan = page(`
      <label for="a">Email</label><input id="a" value="old@example.test">
      <label for="s">Degree</label><select id="s"><option value="">--</option><option value="1">BSc</option><option value="2">MSc</option></select>
      <fieldset><legend>Relocate?</legend>
        <label><input type="radio" name="r" value="y"> Yes</label>
        <label><input type="radio" name="r" value="n" checked> No</label>
      </fieldset>
      <fieldset><legend>Days</legend>
        <label><input type="checkbox" name="d" value="Mon"> Mon</label>
        <label><input type="checkbox" name="d" value="Tue"> Tue</label>
      </fieldset>
    `);
    const outcomes = await Promise.all([
      fillQuestion(ref(scan, 'Email'), { value: 'ada@example.test' }),
      fillQuestion(ref(scan, 'Degree'), { value: 'MSc' }),
      fillQuestion(ref(scan, 'Relocate?'), { value: 'Yes' }),
      fillQuestion(ref(scan, 'Days'), { value: 'Tue', values: ['Tue'] }),
    ]);
    const input = (id: string) => document.getElementById(id) as HTMLInputElement;
    expect(input('a').value).toBe('ada@example.test');
    for (const outcome of outcomes) {
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(await outcome.undo()).toBe(true);
    }
    expect(input('a').value).toBe('old@example.test');
    expect((document.getElementById('s') as HTMLSelectElement).value).toBe('');
    const checked = [...document.querySelectorAll('input:checked')].map(
      (i) => (i as HTMLInputElement).value,
    );
    expect(checked).toEqual(['n']);
  });

  it('unticks a radio that had no answer before', async () => {
    const scan = page(`
      <fieldset><legend>Relocate?</legend>
        <label><input type="radio" name="r" value="y"> Yes</label>
        <label><input type="radio" name="r" value="n"> No</label>
      </fieldset>`);
    const outcome = await fillQuestion(ref(scan, 'Relocate?'), { value: 'No' });
    expect(document.querySelectorAll('input:checked')).toHaveLength(1);
    if (outcome.ok) expect(await outcome.undo()).toBe(true);
    expect(document.querySelectorAll('input:checked')).toHaveLength(0);
  });

  it('says when a custom dropdown can’t be put back', async () => {
    const scan = page(`
      <label id="l">Pick</label><div role="listbox" aria-labelledby="l">
        <div role="option" data-value="A">A</div><div role="option" data-value="B">B</div>
      </div>`);
    // Like Google Forms: the picked option becomes aria-selected.
    document
      .querySelectorAll('[role="option"]')
      .forEach((o) => o.addEventListener('click', () => o.setAttribute('aria-selected', 'true')));
    const outcome = await fillQuestion(
      ref(scan, 'Pick'),
      { value: 'B' },
      { optionTimeout: 30, step: 5, settle: 5 },
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(await outcome.undo()).toBe(false);
  });

  it('can set a value with the native setter directly', () => {
    document.body.innerHTML = '<input id="x">';
    const el = document.getElementById('x') as HTMLInputElement;
    setNativeValue(el, 'abc');
    expect(el.value).toBe('abc');
  });
});

describe('confirmation pages', () => {
  const doc = (html: string) =>
    new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  it.each([
    ['https://job-boards.greenhouse.io/acme/jobs/1/confirmation', '<h1>Thank you</h1>', true],
    ['https://job-boards.greenhouse.io/embed/job_app/confirmation?for=acme', '', true],
    ['https://job-boards.greenhouse.io/acme/jobs/1', '<form><input></form>', false],
    ['https://jobs.lever.co/acme/123/thanks', '', true],
    ['https://jobs.lever.co/acme/123/apply', '', false],
    [
      'https://jobs.ashbyhq.com/acme/1/application',
      '<div class="ashby-application-form-success-container">Your application was successfully submitted.</div>',
      true,
    ],
    [
      'https://docs.google.com/forms/d/e/x/formResponse',
      '<div>Your response has been recorded.</div>',
      true,
    ],
    [
      'https://docs.google.com/forms/d/e/x/formResponse',
      '<div role="listitem"><div role="heading">Next section question</div></div>',
      false,
    ],
    [
      'https://forms.cloud.microsoft/pages/responsepage.aspx',
      '<div>Your response was submitted.</div>',
      true,
    ],
    ['https://example.test/apply', 'Thank you for applying', false],
  ])('%s', (url, html, expected) => {
    expect(detectConfirmation(doc(html), new URL(url))).toBe(expected);
  });
});
