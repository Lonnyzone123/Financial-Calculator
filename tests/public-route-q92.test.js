/* Q92 (F6, with G19) through the PUBLIC ROUTE -- runPlan() and the rows it reports.
 *
 * tests/audit-s5aa-survivor-age-60.test.js pins the rule where it lives, calling the reduction factor
 * and the household benefit directly, and is implementation-coupled for that reason. This file exists
 * because tools/closeout-check.js refused Q92 as COUPLED-ONLY until it did: a repair that cannot be
 * seen from the public route has not been shown to reach a user.
 *
 * Nothing here names an internal function. Every claim is a claim about what a household is paid.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const DECEASED_ANNUAL = 36000;      /* $3,000 a month, claimed at their own full retirement age */
const FLOOR = 0.715;                /* SSA: "Payments start at 71.5%" */

/* A household whose spouse claims at 67 and then dies, leaving a survivor with no benefit of their own
   and a retirement claim age of 67 -- so anything paid before 67 is a survivor benefit and nothing
   else. No wages, no pension, no dividends, no COLA: the row's `income` IS the benefit. */
function widow(selfStart, selfEnd, spouseStart, spouseDeath) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, {
    age: selfStart, retireAge: selfStart, endAge: selfEnd,
    spouseOn: true, spouseAge: spouseStart, filing: 'mfj',
  });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, dividendOn: false, qcdOn: false, pension: 0,
    ssBenefit: 0, ssClaim: 67, spouseSS: 3000, spouseClaim: 67, ssCola: 0, ssAdvanced: false, aime: 0,
    survivor: true, selfLife: 120, spouseLife: spouseDeath,
    stages: [], expenses: [], otherIncomes: [],
  });
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false });
  p.accounts = [{
    id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 500000,
    basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  }];
  return p;
}

function paidAt(p, selfAge) {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  const row = r.rows.find((x) => Math.abs(Number(x.age) - (selfAge + 1)) < 1e-6);
  assert.ok(row, 'no row ending at ' + (selfAge + 1));
  return Number(row.income) || 0;
}

test('Q92 public route: a widow of 60 is paid, where before she was paid nothing', () => {
  /* The auditor's case. The survivor's own retirement claim age is 67, and that is what used to gate
     this to zero for seven years. */
  const paid = paidAt(widow(59, 63, 67, 68), 60);
  assert.equal(paid.toFixed(2), (DECEASED_ANNUAL * FLOOR).toFixed(2));
});

test('Q92 public route: a widow of 50 is still paid nothing', () => {
  const p = widow(50, 53, 55, 56);
  assert.equal(paidAt(p, 51).toFixed(2), '0.00');
  assert.equal(paidAt(p, 52).toFixed(2), '0.00');
});

test('Q92 public route: a household widowed later is paid more than one widowed at 60', () => {
  /* Two households, differing only in when the spouse died. SSA increases the benefit the longer the
     survivor waits to claim, and here that is the age at which they were widowed. */
  const atSixty = paidAt(widow(59, 63, 67, 68), 60);
  const atSixtyFive = paidAt(widow(64, 68, 67, 68), 65);
  assert.ok(atSixtyFive > atSixty,
    'widowed at 65 must be paid more than widowed at 60: ' + atSixtyFive.toFixed(2) + ' against ' + atSixty.toFixed(2));
  assert.ok(atSixtyFive < DECEASED_ANNUAL, 'but still less than the deceased\'s full amount');
});

test('Q92 public route: having a birthday does not raise an early widow\'s benefit', () => {
  /* The reduction belongs to the age the benefit started, not to the survivor's current age. Without
     this, simply living longer would quietly undo it. */
  const p = widow(59, 72, 67, 68);
  const first = paidAt(p, 60);
  assert.equal(paidAt(p, 64).toFixed(2), first.toFixed(2), 'four years later: the same');
  assert.equal(paidAt(p, 70).toFixed(2), first.toFixed(2), 'and past 67: still the same');
});

test('Q92 public route: a household widowed past full retirement age is paid the whole benefit', () => {
  assert.equal(paidAt(widow(67, 70, 67, 68), 68).toFixed(2), DECEASED_ANNUAL.toFixed(2));
});

test('Q92 public route: the result says the figure is an approximation, and why', () => {
  const r = engine.runPlan(widow(59, 65, 67, 68));
  const said = (r.issues || []).find((i) => i.code === 'SURVIVOR_BENEFIT_APPROXIMATED');
  assert.ok(said, 'a household paid a survivor benefit is told what the figure does not include');
  assert.equal(said.state.approximation, true);
  assert.equal(said.state.capApplied, false);
  assert.ok(Array.isArray(said.state.notModelled) && said.state.notModelled.length >= 3,
    'and what is not modelled is a list, not only a sentence');
});
