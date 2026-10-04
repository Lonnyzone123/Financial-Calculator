/* S5AA R52 (the coordinator's finding, carried under the owner's R49 decision "hidden engine warnings shown as cards") -- THE TWO ROTH
 * LEDGER DISCLOSURES ARE CARDS. R50 added the engine warnings ROTH_IRA_BASIS_NOT_ENTERED (a Roth IRA paid a distribution that is not
 * qualified and no contribution basis was entered, so every dollar past the plan's own contributions and conversions is earnings) and
 * ROTH_FIVE_YEAR_ASSUMED (a distribution at 59 1/2 or older taken as qualified because the owner held a Roth IRA at the start and no
 * first contribution year was entered). The app's planWarningTitles did not list them, so renderWarnings() showed no card. Each now has a
 * card: shown when the engine raises the code, and not shown for the same plan once the entry the warning asks for is made.
 *
 * Runs the fresh build's own app in jsdom; no browser run is claimed. A missing jsdom reads as a skip. Each title is a literal.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let jsdomAvailable = true;
try { require('jsdom'); } catch (e) { jsdomAvailable = false; }
const uiTest = jsdomAvailable ? {} : { skip: 'jsdom is not installed in this environment; run npm install to execute the DOM cases' };

const SHELL = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');
const STORAGE_KEY = 'investment-calculator-v2c';

function rothIra(extra) {
  return Object.assign({ id: 'r', name: 'Roth IRA', type: 'rothIRA', taxClass: 'roth', owner: 'self', balance: 100000, basisPct: 100, contribution: 0,
    contributionMode: 'dollar', annualChange: 0, annualChangeMode: 'percent', frequency: 12, changeTiming: 'annual', futureChanges: [], allocation: {},
    matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1, contributionPreset: 'none' }, extra || {});
}
// One retired person living on a $100,000 Roth IRA, $20,000 a year, single, for two years.
async function warningsFor(age, edit) {
  const { loadCalculator, waitFor } = require('./lib/harness');
  const plan = JSON.parse(JSON.stringify(defaultPlan));
  plan.setupComplete = true;
  Object.assign(plan.profile, { age, retireAge: age, endAge: age + 2, filing: 'single', spouseOn: false });
  Object.assign(plan.employment, { salary: 0, contributionStop: age });
  plan.retirement.spending = 20000;
  plan.accounts = [rothIra()];
  if (edit) edit(plan);
  const dom = await loadCalculator({ localStorageSeed: { [STORAGE_KEY]: JSON.stringify({ version: 2, edition: '2C', active: 0, page: 'plan', compare: false, scenarios: [plan] }) } });
  const w = dom.window, doc = w.document;
  try {
    doc.querySelector('#investment-calculator-v2c [data-page="results"]').click();
    const perf = doc.getElementById('v2-performance');
    await waitFor(() => /\d\.\d%$/.test(doc.getElementById('v2-stat-success').textContent) && !perf.classList.contains('is-running'), { window: w, timeoutMs: 15000 });
    return doc.getElementById('v2-warnings').textContent;
  } finally { w.close(); }
}

test('R52: the planWarningTitles list holds both Roth ledger disclosures with their titles', () => {
  const titles = eval('(' + SHELL.match(/var planWarningTitles=(\{[^}]*\})/)[1] + ')');
  assert.equal(titles.ROTH_IRA_BASIS_NOT_ENTERED, 'Roth IRA contribution basis');
  assert.equal(titles.ROTH_FIVE_YEAR_ASSUMED, 'Roth IRA five-year period');
});

test('R52: ROTH_IRA_BASIS_NOT_ENTERED shows its card at 50 with no basis entered', uiTest, async () => {
  // At 50 nothing is qualified; with no contribution basis every dollar drawn is earnings, so the engine raises the code.
  assert.match(await warningsFor(50), /Roth IRA contribution basis: A Roth IRA paid a distribution that is not qualified/);
});
test('R52 control: no ROTH_IRA_BASIS_NOT_ENTERED card once the contribution basis is entered', uiTest, async () => {
  // The account's contribution basis entered ($100,000): the draws are basis, no code, no card.
  assert.doesNotMatch(await warningsFor(50, (p) => { p.accounts[0].contributionBasis = 100000; }), /Roth IRA contribution basis/);
});

test('R52: ROTH_FIVE_YEAR_ASSUMED shows its card at 60 with no first contribution year', uiTest, async () => {
  // At 60, holding a Roth IRA at the start with no first contribution year entered: the five years are taken as run (qualified).
  assert.match(await warningsFor(60, (p) => { p.accounts[0].contributionBasis = 100000; }), /Roth IRA five-year period: A Roth IRA distribution at 59 1\/2 or older is treated as qualified/);
});
test('R52 control: no ROTH_FIVE_YEAR_ASSUMED card once the first contribution year is entered', uiTest, async () => {
  // The first Roth contribution year entered (2010, long past): no code, no card.
  assert.doesNotMatch(await warningsFor(60, (p) => { p.accounts[0].contributionBasis = 100000; p.profile.rothFirstContributionYear = 2010; }), /Roth IRA five-year period/);
});
