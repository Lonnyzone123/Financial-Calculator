/* R2-005 through the public entry point: S5 block 2r's rebuild-proof guard.
 *
 * findingIds: R2-005
 *
 * Owner eligibility applies before the shared family HSA base is allocated.
 * A married couple has one family base ($8,750) to share. When one spouse has
 * stopped working, that spouse can deposit nothing, so the base must not be
 * spent on their account: the working owner gets the full $8,750. Before the
 * repair, a retired spouse's HSA listed first took the whole base and the
 * working owner was left only the age-55 catch-up of $1,000. Under `redirect`
 * policy the difference was then pushed into taxable savings as excess.
 *
 * The existing guard (tests/audit-r2-contribution-limits.test.js) calls the
 * engine's internal contribution audit and simulation directly, so a rebuild
 * that renamed them would leave the behaviour unguarded. This file reaches it
 * only through runPlan(), and reads row 1 (the first year) of the audit's own
 * household: self 60 and working, spouse 70 and retired, filing jointly, with
 * zero returns and inflation so every balance is pure cash flow.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const REQUEST = 8750;

function account(id, type, owner, priority, contribution) {
  return {
    id, name: id, type, taxClass: type === 'hsa' ? 'hsa' : 'taxable', owner, balance: 0, contribution,
    contributionMode: 'amount', priority, basisPct: type === 'hsa' ? 0 : 100, annualChange: 0,
    annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {},
    matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  };
}
const hsa = (id, owner, priority) => account(id, 'hsa', owner, priority, REQUEST);

function household(accounts, overrides) {
  overrides = overrides || {};
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.accounts = accounts;
  Object.assign(p.profile, { age: 60, spouseAge: 70, spouseOn: true, retireAge: 65, endAge: 61, filing: 'mfj' }, overrides.profile || {});
  Object.assign(p.employment, { salary: 100000, spouseSalary: 0, growth: 0, contributionStop: 65 }, overrides.employment || {});
  p.limitPolicy = overrides.limitPolicy || 'prevent';
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0 });
  Object.assign(p.advanced, {
    rmdOn: false, healthOn: false, ltcOn: false, conversionOn: false, transferOn: false,
    reserveOn: false, bondTentOn: false, assetsOn: false, debts: [], otherAssets: [],
  });
  return p;
}

function firstYear(plan) {
  const result = engine.runPlan(plan);
  assert.equal(result.status, 'ok');
  return result.rows[1];
}

const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 0.01, what + ': expected ' + expected + ', got ' + actual);

test('R2-005 (runPlan): a retired spouse\'s HSA listed first does not take the family base, so the working owner deposits the full $8,750', () => {
  const row = firstYear(household([hsa('spouseHSA', 'spouse', 1), hsa('selfHSA', 'self', 2)]));
  near(row.hsa, REQUEST, 'row 1 HSA balance');
  near(row.contributions, REQUEST, 'row 1 contributions');
});

test('R2-005 (runPlan): under redirect policy no phantom excess lands in taxable savings', () => {
  const row = firstYear(household(
    [hsa('spouseHSA', 'spouse', 1), hsa('selfHSA', 'self', 2), account('brokerage', 'taxable', 'self', 3, 0)],
    { limitPolicy: 'redirect' }));
  near(row.taxable, 0, 'row 1 taxable savings under redirect');
  near(row.hsa, REQUEST, 'row 1 HSA balance under redirect');
});

test('R2-005 (runPlan): an owner who stops contributing partway through the year keeps the prorated half of the base', () => {
  const row = firstYear(household(
    [hsa('spouseHSA', 'spouse', 1), hsa('selfHSA', 'self', 2)],
    { profile: { age: 65, endAge: 66, retireAge: 70 }, employment: { contributionStop: 65.5 } }));
  near(row.hsa, REQUEST * 0.5, 'row 1 HSA balance for half a year of eligibility');
});

test('R2-005 (runPlan): the working owner listed first, and two working owners sharing one base, are unchanged', () => {
  const selfFirst = firstYear(household([hsa('selfHSA', 'self', 1), hsa('spouseHSA', 'spouse', 2)]));
  near(selfFirst.hsa, REQUEST, 'the working owner listed first');
  const bothWorking = firstYear(household(
    [hsa('spouseHSA', 'spouse', 1), hsa('selfHSA', 'self', 2)],
    { profile: { spouseAge: 60 }, employment: { spouseSalary: 100000 } }));
  near(bothWorking.hsa, REQUEST + RULES.retirement.hsa.catchup, 'two working owners share the base and add one catch-up');
});
