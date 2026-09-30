/* S5AA R40 (an R32F suspicion confirmed by Claude; the owner 2026-09-30: "Repair all four now"; corrected after the audit of PR #35) --
 * A REQUIRED DISTRIBUTION READS THE AGE THE OWNER REACHES IN THE ROW, BY THE ENGINE'S OWN BIRTH YEAR.
 *
 * The RMD start and the Uniform Lifetime divisor read the age reached by the birthday in the distribution year (Publication 590-B:
 * "use your age as of your birthday in 2026"). Row k is tax year 2026 + k, and the engine reads each person's birth year as
 * 2026 - floor(age at the plan's start) (rmdStartAge(); MODEL_ASSUMPTIONS 12). So the age reached in row k is that whole age plus k.
 * Before R40 the engine read the age at the row's opening: with a fractional self start, a spouse whose fraction is smaller than the
 * self's read an age a year short -- the first RMD year skipped, the divisor a year young. R40 first read the calendar age at the
 * row's close, which disagreed with rmdStartAge()'s birth year (the audit's finding: at the 1959/1960 line the start fell in a year
 * neither reading gives, and the self's own Joint and Last Survivor figure moved); these witnesses pin the corrected reading.
 *
 * By hand (IRA $100,000, no return, tax paid from cash; the Uniform Lifetime divisors 26.5 at 73, 25.5 at 74, 24.6 at 75):
 *   self 72.5 / spouse 72.3, both born 1954 (start 73), the spouse's IRA: the spouse reaches 73 in 2027, the row opening at the
 *   self's 73. Rows closing 73 to 76: 0, 100,000 / 26.5 = 3,773.58, 96,226.42 / 25.5 = 3,773.58, 92,452.83 / 24.6 = 3,758.25.
 *   Before R40: 0, 0, 3,773.58, 3,773.58. */
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

function rmds(selfAge, spouseAge, iraOwner, endAge) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: selfAge, spouseAge, retireAge: selfAge, endAge, spouseOn: true, filing: 'mfj' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: selfAge });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 100, spouseLife: 100, withdrawalOrder: 'manual',
    manualOrder: 'taxable,preTax,roth,hsa' });
  Object.assign(p.advanced, { rmdOn: true, healthOn: false, conversionOn: false, transferOn: false, ltcOn: false });
  p.accounts = [
    acct({ id: 'cash', name: 'Cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 1000000, basisPct: 100, cashHolding: true, priority: 1 }),
    acct({ id: 'ira', name: 'IRA', type: 'traditionalIRA', taxClass: 'preTax', owner: iraOwner, balance: 100000, priority: 2 })];
  assert.ok(validateScenario(p).valid, 'witness must be a valid plan');
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return r.rows.slice(1).map((x) => +x.rmd.toFixed(2));
}

test('R40: with a fractional self start, a spouse born the same year starts the same year', () => {
  assert.deepStrictEqual(rmds(72.5, 72.3, 'spouse', 76), [0, 3773.58, 3773.58, 3758.25]);   // before R40: [0, 0, 3773.58, 3773.58]
  /* The spouse's fraction larger than the self's: still born 1954 on the engine's reading, so the same years. (R40's first reading
     charged half an RMD in the half-year first row: 1,886.79.) */
  assert.deepStrictEqual(rmds(72.5, 72.7, 'spouse', 76), [0, 3773.58, 3773.58, 3758.25]);
});

test('R40: a whole self start reads the spouse as before R40 -- born 1954 at 72.5 as at 72', () => {
  assert.deepStrictEqual(rmds(72, 72.5, 'spouse', 75), [0, 3773.58, 3773.58]);   // R40's first reading: [3773.58, 3773.58, 3758.25]
});

test('R40: at the 1959/1960 line the start age and the age reached come from one birth year', () => {
  /* Spouse 66.5 in 2026: born 1960 on the engine's reading, so the start is 75, reached in 2035 (row 9): 100,000 / 24.6 = 4,065.04.
     R40's first reading put it in row 8, a year neither reading gives. */
  const r = rmds(66, 66.5, 'spouse', 77);
  assert.deepStrictEqual(r.slice(0, 9), [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.strictEqual(r[9], 4065.04);
});

test('R40: the self\'s own RMD reads the spouse\'s age for the joint table by the same birth year', () => {
  /* Self 80 (born 1946), spouse 69.5 (born 1957): eleven years apart, so the Joint and Last Survivor table applies: [80][69] = 20.9;
     100,000 / 20.9 = 4,784.69, as before R40. R40's first reading counted the spouse as 70, ten years apart: 4,950.50. */
  assert.strictEqual(rmds(80, 69.5, 'self', 82)[0], 4784.69);
});
