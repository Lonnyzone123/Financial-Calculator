/* R2-004 through the public entry point: S5 block 2r's rebuild-proof guard.
 *
 * findingIds: R2-004
 *
 * A person's annual Social Security benefit is set once per year, on that
 * person's own clock. A year is split wherever either spouse claims or dies,
 * to decide who is paid and for how long, but the split must not also decide
 * how large a benefit is. Benefit growth is counted in whole years since the
 * claim, so before the repair a split caused by the OTHER person could tick
 * this person's growth over early. The audit's case: both aged 68, the self
 * claiming at 67.5 with a $1,000-a-month benefit, a full retirement age of 67
 * and 10% growth, and a spouse with no benefit. Moving only the spouse's claim
 * from 69.5 to 68.5, inside the year, raised the self's benefit from $12,480
 * to $13,104.
 *
 * The existing guard (tests/audit-r2-survivor.test.js) calls the engine's
 * internal household benefit helper directly, so a rebuild that renamed it
 * would leave the behaviour unguarded. This file reaches it only through
 * runPlan(). The benefit paid in a year is that row's income less the same
 * plan's income with no benefits, in a retired household with no wages, no
 * other income and no investment return.
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

function plan(profile, retirement) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.profile, { retireAge: profile.age, endAge: profile.age + 3 }, profile);
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: profile.age });
  p.accounts = [{
    id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 2000000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  p.retirement.otherIncomes = [];
  p.retirement.pension = 0;
  Object.assign(p.retirement, retirement);
  return p;
}

/* The benefit paid in row `row`: income with the benefits, less income without them. */
function paidIn(p, row) {
  const without = JSON.parse(JSON.stringify(p));
  without.retirement.ssBenefit = 0;
  without.retirement.spouseSS = 0;
  const a = engine.runPlan(JSON.parse(JSON.stringify(p)));
  const b = engine.runPlan(without);
  assert.equal(a.status, 'ok');
  assert.equal(b.status, 'ok');
  return a.rows[row].income - b.rows[row].income;
}

const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 0.01, what + ': expected ' + expected + ', got ' + actual);

const selfBenefit = (spouseClaim, fields) => plan({ age: 68, spouseAge: 68, spouseOn: true }, Object.assign({
  ssClaim: 67.5, ssFra: 67, ssBenefit: 1000, ssCola: 10, survivor: false,
  spouseSS: 0, spouseClaim, selfLife: 95, spouseLife: 95,
}, fields));
const spouseBenefit = (ssClaim) => plan({ age: 68, spouseAge: 68, spouseOn: true }, {
  ssClaim, ssFra: 67, ssBenefit: 0, ssCola: 10, survivor: false,
  spouseSS: 1000, spouseClaim: 67.5, selfLife: 95, spouseLife: 95,
});

test('R2-004 (runPlan): an unrelated spouse claim inside the year does not advance the self\'s benefit growth, $12,480 either way', () => {
  near(paidIn(selfBenefit(69.5), 1), 12480, 'spouse claim outside the year');
  near(paidIn(selfBenefit(68.5), 1), 12480, 'spouse claim inside the year');
});

test('R2-004 (runPlan): an unrelated self claim inside the year does not advance the spouse\'s benefit growth', () => {
  near(paidIn(spouseBenefit(69.5), 1), 12480, 'self claim outside the year');
  near(paidIn(spouseBenefit(68.5), 1), 12480, 'self claim inside the year');
});

test('R2-004 (runPlan): with no benefit growth, and with no spouse, the benefit is unchanged', () => {
  near(paidIn(selfBenefit(68.5, { ssCola: 0 }), 1), 12480, 'no growth, spouse claim inside the year');
  const single = plan({ age: 68, spouseOn: false }, { ssClaim: 67.5, ssFra: 67, ssBenefit: 1000, ssCola: 10, survivor: false, selfLife: 95 });
  near(paidIn(single, 1), 12480, 'no spouse');
});

test('R2-004 (runPlan): benefit growth still accrues from one year to the next', () => {
  near(paidIn(selfBenefit(68.5), 2), 13728, 'the second year, after a whole year of 10% growth');
});
