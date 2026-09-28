'use strict';

/*
 * S5 exit gate E5: S4 task 7.4a's decision carried into tasks 8, 10 and 11's page text, inside the gate. Routes 2 and 3
 * compare runPlan()-equivalent output, so a disclosure the Rules page renders was checked, at most, as source text. This
 * file boots the fresh build of this tree in jsdom (tests/lib/harness.js, route 2's main thread) and reads the Rules page
 * the app itself rendered: the Arizona return of task 8 (R6), the QCD limit of task 10 as repaired in R4, and the Roth
 * catch-up rule of task 11. Every figure is written here from the decision that set it, not read back through the app's
 * own formatting; the record values are then checked to be those figures, so a changed record fails here too.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
const RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const record = (group, id, filing) => group.records.find((r) => r.provision_id === id && (filing === undefined || r.filing_status === filing));

let rendered = null;
async function rulesPage() {
  if (rendered) return rendered;
  const { loadCalculator } = require('./lib/harness.js');
  const dom = await loadCalculator();
  const host = dom.window.document.getElementById('v2-rule-sections');
  assert.ok(host, 'the Rules page has its sections host');
  const sections = {};
  host.querySelectorAll('details').forEach((d) => {
    const title = d.querySelector('summary').textContent;
    sections[title] = Array.from(d.querySelectorAll('p')).map((p) => p.textContent).join('\n');
  });
  dom.window.close();
  rendered = sections;
  return sections;
}

test('control: the rule records carry the figures the decisions set', () => {
  assert.equal(record(RULES.arizona, 'az_basic_standard_deduction', 'single').value, 16100);
  assert.equal(record(RULES.arizona, 'az_basic_standard_deduction', 'hoh').value, 24150);
  assert.equal(record(RULES.arizona, 'az_basic_standard_deduction', 'mfj').value, 32200);
  assert.equal(record(RULES.arizona, 'az_age65_exemption').value, 2100);
  assert.equal(record(RULES.retirement.qcd, 'qcd_annual_cap').value, 111000);
  assert.equal(record(RULES.retirement.workplace.rothCatchup, 'prior_year_fica_wage_threshold').value, 150000);
});

test('E5, task 8: the rendered Arizona section states the deduction, the age-65 exemption and each authority status', async () => {
  const text = (await rulesPage())['Arizona estimate'];
  assert.ok(text, 'the Arizona section is rendered');
  assert.match(text, /less federally taxable Social Security \(ENACTED\)/);
  assert.match(text, /\$16,100 single or married filing separately, \$24,150 head of household and \$32,200 married filing jointly \(INFERRED until the final Form 140\)/);
  assert.match(text, /less \$2,100 for each person 65 or older \(ENACTED\)/);
  assert.match(text, /head-of-household charitable cap is FORM_PENDING and blocks release/);
  assert.doesNotMatch(text, /proxy/, 'the retired proxy wording is gone');
});

test('E5, task 10 as repaired in R4: the rendered RMD section states the per-person, own-IRA QCD cap', async () => {
  const text = (await rulesPage())['Required minimum distributions and QCDs'];
  assert.ok(text, 'the RMD section is rendered');
  assert.match(text, /share follows their own traditional IRA balance and is capped at \$111,000 a year/);
});

test('E5, task 11: the rendered retirement-accounts section states the Roth catch-up rule and its threshold', async () => {
  const text = (await rulesPage())['Retirement accounts and contribution limits'];
  assert.ok(text, 'the retirement-accounts section is rendered');
  assert.match(text, /high-earner Roth catch-up rule is in the statute and in effect for 2026 \(ENACTED\)/);
  assert.match(text, /prior-year FICA wages from the employer sponsoring that plan exceed \$150,000 \(OFFICIAL_2026\)/);
});

/* ---------------------------------------------------------------------------
 * S5AA task 7.6 -- every disclosure this sprint CHANGED, read RENDERED.
 *
 * A disclosure that is only checked as source text is a claim about a string, not about what the
 * household is shown. These read the built page the way the sections above do.
 * ------------------------------------------------------------------------- */

test('S5AA 7.6: the rendered Social Security section says the earnings test IS applied, and how', async () => {
  /* N3: the page used to list the earnings test among the rules it uses AND say it did not apply it.
     Task 4.6 applies it, so the page must say ONE thing, and that thing must be true. */
  const text = (await rulesPage())['Social Security'];
  assert.ok(text, 'the Social Security section is rendered');
  assert.ok(!/does not apply the earnings test/.test(text),
    'the contradiction must be gone from the RENDERED page, not only from the source');
  assert.ok(!/nothing withheld/.test(text), 'and so must the promise that nothing is withheld');
  assert.match(text, /reduced by \$1 for every \$2/, 'the under-full-retirement-age ratio is stated');
  assert.match(text, /\$1 for every \$3/, 'and the ratio for the year it is reached');
  assert.match(text, /permanently increased/,
    'and that withheld benefits are not lost but raise the benefit at full retirement age');
  assert.match(text, /scaled to the length of the row/,
    'the partial-year treatment is a stated scope default, so it is stated');
});

test('S5AA 7.6: the rendered Dividends section defines dividendStart and keeps the imputed charge visible', async () => {
  const text = (await rulesPage()).Dividends;
  assert.ok(text, 'task 5.2 added a Dividends section, and it must actually render');
  assert.match(text, /1\.5%/, 'the imputed charge stays visible as the stated assumption it is');
  assert.match(text, /paid out to spend/i, 'dividendStart is defined, not merely named');
  assert.match(text, /floored at retirement age/i, 'including the floor that makes the two branches differ');
  /* S5AA R23: this asserted the sentence "with the dividend feature on, no dividend is taxed before retirement
     age". That limit was repaired at 823666b (the entered yield is taxed every year, reinvested before it is paid
     out), which left the page contradicting its own paragraph above it. The true statement is asserted instead,
     and the retired one is swept for in the 7.6 test below. */
  assert.match(text, /still taxed each year/i,
    'the reinvested dividend is taxed every year with the feature on, before retirement included (823666b)');
});

test('S5AA 7.6: the rendered page carries no claim this sprint made false', async () => {
  /* A single sweep for the sentences S5AA retired. Cheaper than remembering each one, and it fails
     loudly if a retired claim is reintroduced anywhere on the page. */
  const all = Object.values(await rulesPage()).join('\n');
  const retired = [
    [/does not apply the earnings test/, 'the earnings test is applied as of task 4.6'],
    [/nothing withheld/, 'benefits ARE withheld as of task 4.6'],
    [/no dividend is taxed before retirement/i, 'with the feature on, dividends are taxed every year as of 823666b'],
  ];
  const found = retired.filter(([re]) => re.test(all)).map(([, why]) => why);
  assert.deepEqual(found, [], 'the rendered page still claims: ' + found.join('; '));
});
