/* S5AA R40 (an R32F suspicion confirmed by Claude; the owner 2026-09-30: "Repair all four now") -- A SPOUSE'S REQUIRED DISTRIBUTION
 * READS THE AGE THE SPOUSE REACHES IN THE ROW.
 *
 * Rows follow the self's birthdays, so a spouse's birthday can fall inside a row. The RMD start and the Uniform Lifetime divisor were read
 * at the row's opening. A spouse half a year older than the self therefore skipped the distribution for the year they reached 73 --
 * nothing doubles up the next year -- and was then given the divisor of an age a year younger than the one they reached. The table is
 * read at the age reached by the birthday in the distribution year (Treas. Reg. 1.401(a)(9)-9(c); Publication 590-B, Table III). The
 * start and the divisor now read the age reached within the row. For the self, whose birthdays fall on row boundaries, that is the same
 * figure as before.
 *
 * Witness, by hand: self 72, spouse 72.5 (born 1953 and 1954 on the plan's whole-age reading, so a start at 73), the spouse's IRA at
 * $100,000, no return, tax paid from cash. The spouse reaches 73 in the row 72 to 73: 100,000 / 26.5 = 3,773.58; then 74:
 * 96,226.42 / 25.5 = 3,773.58; then 75: 92,452.83 / 24.6 = 3,758.25. Before: nothing at 73, then 26.5 and 25.5 a year late
 * (3,773.58, 3,773.58). Prediction: audit/S5AA/R40/S5AA_R40_PREDICTION_RECORD_20260930.md section 4. */
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
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const acct = (extra) => Object.assign({ contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0, vesting: 100 }, extra);

function rmds(selfAge, spouseAge, iraOwner) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: selfAge, spouseAge, retireAge: selfAge, endAge: selfAge + 3, spouseOn: true, filing: 'mfj' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: selfAge });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 100, spouseLife: 100, withdrawalOrder: 'manual',
    manualOrder: 'taxable,preTax,roth,hsa' });
  Object.assign(p.advanced, { rmdOn: true, healthOn: false, conversionOn: false, transferOn: false, ltcOn: false });
  p.accounts = [
    acct({ id: 'cash', name: 'Cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 100000, basisPct: 100, cashHolding: true, priority: 1 }),
    acct({ id: 'ira', name: 'IRA', type: 'traditionalIRA', taxClass: 'preTax', owner: iraOwner, balance: 100000, priority: 2 })];
  assert.ok(validateScenario(p).valid, 'witness must be a valid plan');
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return r.rows.slice(1).map((x) => +x.rmd.toFixed(2));
}

test('R40: a spouse whose birthday falls inside the row takes the RMD for the year they reach 73, at that age\'s divisor', () => {
  assert.deepStrictEqual(rmds(72, 72.5, 'spouse'), [3773.58, 3773.58, 3758.25]);   // before: [0, 3773.58, 3773.58]
});

test('R40: controls -- the self\'s own IRA, and a spouse a whole year apart, are as before', () => {
  assert.deepStrictEqual(rmds(72, 72, 'self'), [0, 3773.58, 3773.58]);
  assert.deepStrictEqual(rmds(72, 73, 'spouse'), [3773.58, 3773.58, 3758.25]);
});
