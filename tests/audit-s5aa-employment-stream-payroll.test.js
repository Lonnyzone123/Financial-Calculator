/* S5AA task 3.4, Q98 (G4) -- an `employment` income stream owes payroll tax, per owner.
 *
 * An `employment`-type entry in retirement.otherIncomes is wages. It bears Social Security and
 * Medicare payroll tax like any other wages, and the OASDI wage base is applied PER PERSON, not per
 * household. The engine folded the stream into `other.ordinary`, so it already bore INCOME tax
 * correctly, but it never reached the wage base, so it bore no FICA at all: the same $60,000 cost
 * $8,312.50 as `employment.salary` and $3,722.50 as a stream -- a gap of exactly $4,590.00, which is
 * 7.65% of it.
 *
 * WHY THE OWNER IS THE WHOLE POINT. estimateTaxes() derives the self's wages as
 * `wages - spouseWages` and caps EACH person's OASDI separately. A repair that added the stream to
 * the household total without also crediting the spouse's share would push the spouse's wages onto
 * the self, where a single cap truncates the pair -- UNDERCHARGING a two-earner household by up to
 * the whole difference. That case is asserted below, because it is the one a household-total repair
 * gets wrong while every single-earner test still passes.
 *
 * Medicare has no wage base, and the ADDITIONAL Medicare tax is a household-level threshold by filing
 * status, so neither of those is per person -- only OASDI is. Both are pinned.
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

const PAY = global.RULES.federal.payroll;
const FICA = PAY.oasdiEmployee + PAY.medicareEmployee;   /* the employee share on a dollar under the cap */

/* The employee payroll tax on a given split of wages, written from the rule tables: OASDI capped PER
   PERSON, Medicare uncapped on the household total, and the additional Medicare tax on the household
   total above a threshold that depends on filing status. Deriving it here rather than reusing the
   engine keeps the expectations independent of the thing under test. */
const employeePayroll = (selfW, spouseW, filing) =>
  (Math.min(selfW, PAY.oasdiWageBase) + Math.min(spouseW, PAY.oasdiWageBase)) * PAY.oasdiEmployee
  + (selfW + spouseW) * PAY.medicareEmployee
  + Math.max(0, selfW + spouseW - global.RULES.federal.payroll.additionalThreshold[filing])
    * PAY.additionalMedicare;

/* A working couple, no portfolio income, deterministic returns: the only thing that varies between
   runs is where the employment income is entered. */
function plan(selfSalary, spouseSalary, streams) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 45, retireAge: 60, endAge: 47, spouseOn: true, spouseAge: 45, filing: 'mfj' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: selfSalary, spouseSalary, growth: 0, contributionStop: 60 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 10000, /* RE-FIXTURED at the S5AA R18 round (workstream B, taxable basis in dollars): dividends ON at a 0% yield, so no imputed 1.5% -- at a 0% return a taxed, retained yield adds basis the account never gains, and the tax sales then realise small capital losses that are not what this test is about. */ dividendOn: true, dividendYield: 0,
    stages: [], expenses: [], ssBenefit: 0, spouseSS: 0, survivor: false,
    otherIncomes: (streams || []).map((s) => ({
      name: s.type + ':' + s.owner, type: s.type, owner: s.owner, amount: s.amount,
      start: 45, end: 60, growthMode: 'fixed', growth: 0,   // S5AA R43: 'none' is not an income growth mode; fixed at 0% is the same
    })),
  });
  p.accounts = [{
    id: 'a', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 2000000,
    basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0,
    matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  }];
  return p;
}

function firstYearTaxes(selfSalary, spouseSalary, streams) {
  const r = engine.runPlan(plan(selfSalary, spouseSalary, streams));
  assert.strictEqual(r.status, 'ok', 'the fixture must run: ' + r.status + ' / ' + r.calculationErrorCode);
  return Number(r.rows[1].taxes) || 0;
}

const JOB = 60000;

test('S5AA 3.4 control: the same money entered as salary already bears FICA, so there is a target to hit', () => {
  const none = firstYearTaxes(0, 0, []);
  const salary = firstYearTaxes(JOB, 0, []);
  assert.ok(salary > none, 'CONTROL: a salary must cost more than no salary');
  /* and the fixture is below the OASDI cap, so the arithmetic below is the simple one */
  assert.ok(JOB < PAY.oasdiWageBase, 'CONTROL: this fixture must sit below the OASDI wage base');
});

test('S5AA 3.4: an employment STREAM costs exactly what the same salary costs', () => {
  /* The finding, stated as an equivalence rather than as a dollar figure: the two routes are the same
     income and must be taxed identically, whatever the rates happen to be. */
  const asSalary = firstYearTaxes(JOB, 0, []);
  const asStream = firstYearTaxes(0, 0, [{ type: 'employment', owner: 'self', amount: JOB }]);
  assert.ok(Math.abs(asSalary - asStream) < 0.01,
    'an employment stream must cost the same as the salary: salary ' + asSalary.toFixed(2)
    + ' against stream ' + asStream.toFixed(2) + ', a gap of ' + (asSalary - asStream).toFixed(2));
});

test('S5AA 3.4: the gap it closes is exactly FICA, and the INCOME tax does not move', () => {
  /* Direction and size. The stream already bore income tax correctly, so the repair must add payroll
     tax and nothing else -- if the income tax moved too, the stream would now be counted twice. */
  const none = firstYearTaxes(0, 0, []);
  const stream = firstYearTaxes(0, 0, [{ type: 'employment', owner: 'self', amount: JOB }]);
  const pension = firstYearTaxes(0, 0, [{ type: 'pension', owner: 'self', amount: JOB }]);

  assert.ok(Math.abs((stream - pension) - JOB * FICA) < 0.01,
    'employment against an identical pension must differ by exactly FICA on the amount: expected '
    + (JOB * FICA).toFixed(2) + ', got ' + (stream - pension).toFixed(2));
  assert.ok(pension > none, 'CONTROL: the pension itself still bears income tax, so this is not a zero-zero match');
});

test('S5AA 3.4: a SECOND job for the same person shares that person one OASDI cap', () => {
  /* The "second job" case. One person with a salary AND a stream has ONE wage base between them, so
     once the pair crosses the cap the excess bears Medicare only.
     The income tax is held constant by comparing against the SAME amount carried as a pension: both
     runs have identical ordinary income, so the whole difference is payroll. Measuring the income tax
     separately at a different income level would not isolate it -- the second $138,375 lands in higher
     brackets than the first. */
  const half = PAY.oasdiWageBase * 0.75;
  const asEmployment = firstYearTaxes(half, 0, [{ type: 'employment', owner: 'self', amount: half }]);
  const asPension = firstYearTaxes(half, 0, [{ type: 'pension', owner: 'self', amount: half }]);

  const expected = employeePayroll(half + half, 0, 'mfj') - employeePayroll(half, 0, 'mfj');
  const uncapped = employeePayroll(half, 0, 'mfj');
  assert.ok(expected < uncapped - 0.01,
    'CONTROL: the second job must actually cross the cap and so cost LESS than the first, or this '
    + 'fixture tests nothing: first ' + uncapped.toFixed(2) + ', second ' + expected.toFixed(2));

  assert.ok(Math.abs((asEmployment - asPension) - expected) < 0.01,
    'the second job must be capped against the same person wage base: expected payroll of '
    + expected.toFixed(2) + ', got ' + (asEmployment - asPension).toFixed(2));
});

test('S5AA 3.4: a SPOUSE job keeps its own owner, and therefore its own OASDI cap', () => {
  /* THE CASE A HOUSEHOLD-TOTAL REPAIR GETS WRONG. Two jobs at 75% of the wage base, one each, are both
     entirely under the cap, so the full OASDI applies twice. Credit the spouse's stream to the self and
     a single cap truncates the pair, undercharging the household. */
  const each = PAY.oasdiWageBase * 0.75;
  const spouseAsSalary = firstYearTaxes(each, each, []);
  const spouseAsStream = firstYearTaxes(each, 0, [{ type: 'employment', owner: 'spouse', amount: each }]);

  assert.ok(Math.abs(spouseAsSalary - spouseAsStream) < 0.01,
    'a spouse employment stream must cost what a spouse salary costs: salary ' + spouseAsSalary.toFixed(2)
    + ' against stream ' + spouseAsStream.toFixed(2));

  /* and the pooled-onto-self answer is measurably different, so the assertion above has teeth */
  const pooledOasdi = Math.min(2 * each, PAY.oasdiWageBase) * PAY.oasdiEmployee;
  const perPersonOasdi = 2 * Math.min(each, PAY.oasdiWageBase) * PAY.oasdiEmployee;
  assert.ok(perPersonOasdi - pooledOasdi > 1000,
    'CONTROL: pooling the two would differ by $' + (perPersonOasdi - pooledOasdi).toFixed(2)
    + ', so this test can tell the two implementations apart');
});

test('S5AA 3.4 MUST NOT MOVE: no other income type gains payroll tax', () => {
  /* Only `employment` is wages. `selfEmployment` bears SE tax through its own channel and must not be
     charged FICA as well, which would be a double charge on the same dollars. */
  const base = firstYearTaxes(0, 0, []);
  const pension = firstYearTaxes(0, 0, [{ type: 'pension', owner: 'self', amount: JOB }]);
  for (const type of ['pension', 'rental', 'investment', 'other', 'socialSecurity', 'taxFree']) {
    const t = firstYearTaxes(0, 0, [{ type, owner: 'self', amount: JOB }]);
    assert.ok(t - base < JOB * FICA - 0.01,
      type + ' must not pick up payroll tax: it cost ' + (t - base).toFixed(2)
      + ', which is at least FICA of ' + (JOB * FICA).toFixed(2));
  }
  /* self-employment is taxed, but through the SE channel, and must not equal the FICA-bearing wage answer */
  const se = firstYearTaxes(0, 0, [{ type: 'selfEmployment', owner: 'self', amount: JOB }]);
  const employment = firstYearTaxes(0, 0, [{ type: 'employment', owner: 'self', amount: JOB }]);
  assert.ok(se > pension, 'CONTROL: self-employment income does bear its own payroll-style tax');
  assert.ok(Math.abs(se - employment) > 0.01,
    'self-employment and employment must not be charged identically -- SE tax is the whole rate with a '
    + 'deductible half, not the employee share');
});
