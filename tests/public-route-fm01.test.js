/* FM-01 through the public entry point: S5 block 2r's rebuild-proof guard.
 *
 * findingIds: FM-01
 *
 * In historical mode, benefit growth reads each projection year's cost-of-living
 * adjustment from one shared history calendar. A person's claim is measured
 * against that person's OWN opening age, so whoever claims at their own opening
 * age has zero calendar time elapsed at claim, and their second year grows by the
 * first projection year's adjustment. Before the repair every owner was measured
 * against the SELF's opening age. A spouse two years older was indexed two history
 * years ahead (with history from 2020, a 2021 payment grew by 2022's 8.7% rather
 * than 2020's 1.3%), and a younger spouse fell behind and did not grow at all.
 *
 * The existing guard (tests/audit-fm01-ss-calendar.test.js) calls the engine's
 * internal benefit helpers and edits its history table directly, so a rebuild
 * that renamed them would leave the behaviour unguarded. This file reaches it only
 * through runPlan(). It compares year-on-year growth between households under the
 * same history start, never against a stored adjustment, so a corrected history
 * table does not break it. The benefit or income paid in a year is that row's
 * income less the same plan's income without it; each household is retired, with
 * no wages, zero returns and inflation, and no configured growth.
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

function plan(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'historical', historyStart: o.historyStart || 2020, rollingHistory: false, returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.profile, { age: o.age, spouseAge: o.spouseAge, spouseOn: true, retireAge: o.age, endAge: o.age + 4 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: o.age });
  p.accounts = [{
    id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 2000000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  p.retirement.otherIncomes = o.incomes || [];
  p.retirement.pension = 0;
  Object.assign(p.retirement, {
    ssClaim: o.selfClaim, spouseClaim: o.spouseClaim, ssFra: 67,
    ssBenefit: o.selfBenefit || 0, spouseSS: o.spouseBenefit || 0,
    ssCola: 0, survivor: false, selfLife: 95, spouseLife: 95,
  });
  return p;
}

/* The benefit and income-stream cash paid in rows 1 and 2. */
function paid(p) {
  const without = JSON.parse(JSON.stringify(p));
  without.retirement.ssBenefit = 0;
  without.retirement.spouseSS = 0;
  without.retirement.otherIncomes = [];
  const a = engine.runPlan(JSON.parse(JSON.stringify(p)));
  const b = engine.runPlan(without);
  assert.equal(a.status, 'ok');
  assert.equal(b.status, 'ok');
  return [1, 2].map((i) => a.rows[i].income - b.rows[i].income);
}
const growth = (p) => { const [first, second] = paid(p); return second / first; };
const equalAges = (historyStart) => growth(plan({ age: 66, spouseAge: 66, selfClaim: 66, spouseClaim: 66, spouseBenefit: 1000, historyStart }));

const near = (actual, expected, what, tolerance) => assert.ok(Math.abs(actual - expected) < (tolerance || 0.01), what + ': expected ' + expected + ', got ' + actual);

test('FM-01 (runPlan): a spouse older than the self is indexed on the shared calendar, growing like an equal-age household', () => {
  const older = (gap, historyStart) => growth(plan({ age: 65, spouseAge: 65 + gap, selfClaim: 65, spouseClaim: 65 + gap, spouseBenefit: 1000, historyStart }));
  near(older(2, 2020), equalAges(2020), 'a spouse two years older, history from 2020, second-year growth against equal ages', 1e-9);
  near(older(2, 1980), equalAges(1980), 'a spouse two years older, history from 1980, second-year growth against equal ages', 1e-9);
  near(older(10, 2020), equalAges(2020), 'a spouse ten years older, history from 2020, second-year growth against equal ages', 1e-9);
});

test('FM-01 (runPlan): a spouse younger than the self is indexed on the shared calendar too', () => {
  const younger = growth(plan({ age: 67, spouseAge: 65, selfClaim: 67, spouseClaim: 65, spouseBenefit: 1000 }));
  near(younger, equalAges(2020), 'a spouse two years younger, history from 2020, second-year growth against equal ages', 1e-9);
});

test('FM-01 (runPlan): a household grows the same whether the self or the spouse holds the benefit', () => {
  const spouseHolds = paid(plan({ age: 65, spouseAge: 67, selfClaim: 65, spouseClaim: 67, spouseBenefit: 1000 }));
  const selfHolds = paid(plan({ age: 67, spouseAge: 65, selfClaim: 67, spouseClaim: 65, selfBenefit: 1000 }));
  near(spouseHolds[1], selfHolds[1], 'the second year, spouse-held against self-held');
});

test('FM-01 (runPlan): a half-year claim age accrues whole growth steps on its owner\'s own clock', () => {
  const halfYear = growth(plan({ age: 65, spouseAge: 67.5, selfClaim: 65, spouseClaim: 67.5, spouseBenefit: 1000 }));
  near(halfYear, equalAges(2020), 'a half-year claim age, second-year growth against equal ages', 1e-9);
});

test('FM-01 (runPlan): a spouse-owned income stream indexed to benefit growth follows the spouse\'s own clock', () => {
  const stream = growth(plan({
    age: 65, spouseAge: 70, selfClaim: 65, spouseClaim: 70,
    incomes: [{ type: 'pension', owner: 'spouse', amount: 10000, start: 70, end: 95, growthMode: 'cola', growth: 0 }],
  }));
  near(stream, equalAges(2020), 'a spouse-owned income stream, second-year growth against equal ages', 1e-9);
});

test('FM-01 (runPlan): a self-held benefit grows like an equal-age household, and both do grow', () => {
  const selfHolds = growth(plan({ age: 67, spouseAge: 65, selfClaim: 67, spouseClaim: 65, selfBenefit: 1000 }));
  near(selfHolds, equalAges(2020), 'a self-held benefit, second-year growth against equal ages', 1e-9);
  assert.ok(equalAges(2020) > 1, 'an equal-age household grows in its second year');
});
