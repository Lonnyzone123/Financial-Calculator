/* P1 and Q16 through the public entry point: S5 block 2r's rebuild-proof guard.
 *
 * findingIds: P1, Q16
 *
 * A Social Security benefit claimed before the projection opens is still
 * indexed from its claim age, and for those earlier years it grows at the
 * configured cost-of-living rate, never on the projection's own history. In
 * historical mode the projection's first history years stand for the years
 * after it opens; using them for years before it opens borrows later calendar
 * years to reconstruct earlier ones. The configured rate is what simple mode
 * already uses for every year, so it is well defined for any year.
 *
 * The existing guard (tests/audit-fm01-ss-calendar.test.js) calls the engine's
 * internal benefit helpers directly, so a rebuild that renamed them would leave
 * the behaviour unguarded. This file reaches it only through runPlan(). The
 * benefit paid in a year is that row's income less the same plan's income with
 * no benefits. The household is retired, with no wages and no other income: the
 * self is 65 with no benefit, and the spouse opens the projection at 67 having
 * claimed $1,000 a month at 65, two years before it opens.
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

/* RE-FIXTURED BY INTENT at S5AA R34. (1) SA32F-03: a partner with no benefit of their own now draws the spouse's benefit on the
   other's record once both have filed; these tests isolate the COLA calendar, so that partner files at 70, outside the rows tested.
   (2) SA32F-05 and R32V-03: the benefit holder's factor comes from their birth year, and SSA rounds the PIA to the dime and the
   benefit to the dollar -- expectations are worked with tests/lib/ssa-reference.js. */
const SSA = require('./lib/ssa-reference.js');
function plan(method, historyStart, ssCola, spouseClaim) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method, historyStart, rollingHistory: false, returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.profile, { age: 65, spouseAge: 67, spouseOn: true, retireAge: 65, endAge: 68 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: 65 });
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
  Object.assign(p.retirement, {
    ssClaim: 70, spouseClaim: spouseClaim === undefined ? 65 : spouseClaim, ssFra: 67,
    ssBenefit: 0, spouseSS: 1000, ssCola, survivor: false, selfLife: 95, spouseLife: 95,
  });
  return p;
}

/* The benefit paid in row 1: income with the benefit, less income without it. */
function paidInFirstYear(p) {
  const without = JSON.parse(JSON.stringify(p));
  without.retirement.ssBenefit = 0;
  without.retirement.spouseSS = 0;
  const a = engine.runPlan(JSON.parse(JSON.stringify(p)));
  const b = engine.runPlan(without);
  assert.equal(a.status, 'ok');
  assert.equal(b.status, 'ok');
  return a.rows[1].income - b.rows[1].income;
}

const near = (actual, expected, what, tolerance) => assert.ok(Math.abs(actual - expected) < (tolerance || 0.01), what + ': expected ' + expected + ', got ' + actual);
const growthRatio = (method, historyStart) => paidInFirstYear(plan(method, historyStart, 3)) / paidInFirstYear(plan(method, historyStart, 0));
/* The spouse (67, born 1959, full retirement age 66 and 10 months) claimed at 65, 22 months early; two pre-projection years at 3%, each
   rounded to the dime; the benefit to the dollar. */
const TWO_YEARS_AT_3 = (() => { const f = SSA.claimFactor(65, SSA.fra(67)); return SSA.floorDollar(SSA.colaPia(1000, 0.03, 2) * f) / SSA.floorDollar(1000 * f); })();

test('P1/Q16 (runPlan): a benefit claimed before the projection opens grows at the configured rate for those earlier years, not on history', () => {
  near(growthRatio('historical', 1979), TWO_YEARS_AT_3, 'two years before the projection opens, growth at 3% against 0%, history from 1979', 1e-6);
});

test('P1/Q16 (runPlan): at a configured 0% the earlier years add nothing, the same benefit as in simple mode', () => {
  const simple = paidInFirstYear(plan('simple', 1979, 0));
  near(paidInFirstYear(plan('historical', 1979, 0)), simple, 'a claim before the projection at 0%, historical against simple');
});

test('P1/Q16 (runPlan): the rule does not depend on where the history starts', () => {
  near(growthRatio('historical', 1975), TWO_YEARS_AT_3, 'two years before the projection opens, growth at 3% against 0%, history from 1975', 1e-6);
  near(growthRatio('historical', 2021), TWO_YEARS_AT_3, 'two years before the projection opens, growth at 3% against 0%, history from 2021', 1e-6);
});

test('P1/Q16 (runPlan): simple mode grows at the configured rate, and a claim at the opening has not grown yet', () => {
  near(growthRatio('simple', 1979), TWO_YEARS_AT_3, 'simple mode, growth at 3% against 0%', 1e-6);
  const atOpening = (ssCola) => paidInFirstYear(plan('historical', 1979, ssCola, 67));
  near(atOpening(3), atOpening(0), 'a claim at the opening, first year, at 3% against 0%');
});
