/* S5AA task 5.1, Q94 (F8) -- an adjustable-rate loan always re-amortises at its reset.
 *
 * THE DEFECT. projectDebts() re-amortised only when advanced.armRecastOnReset was true. It defaulted
 * false and the key occurred ONCE in the whole shipped page -- inside the default plan object, with no
 * input element, no id-to-key mapping and no read-back. (Positive control: `rule55`, a flag that IS
 * wired to a control, occurs seven times.) So the feature was unreachable and every modelled ARM kept
 * its entered payment across the reset.
 *
 * THE ENGINE'S OWN COMMENT SAID THIS WAS TEMPORARY: "real ARMs re-amortise unconditionally, so this
 * flag is a transitional migration flag, not a modelling choice -- it exists only so this sprint cannot
 * move output for any existing scenario while a whole-model external audit is pending. SPRINT_QUESTIONS
 * records the intended end state (unconditional re-amortisation once the audit lands)." The audit has
 * landed. This is that end state.
 *
 * MEASURED BEFORE THE REPAIR, and worse than the audit reported. A $400,000 ARM at 3% resetting to 6%
 * at 45 held its payment at $20,232 a year while the recast control rose to $27,497.68. At 6% the
 * interest alone on the $355,652 balance is $21,339 -- MORE than the payment -- so the balance GREW
 * every year from the reset onward and the loan never paid off. The default did not merely amortise
 * slowly; it amortised backwards.
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

function loanPlan(rateType, edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 40, retireAge: 41, endAge: 56, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, dividendOn: false, qcdOn: false, pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [],
  });
  Object.assign(p.advanced, {
    rmdOn: false, transferOn: false, conversionOn: false, healthOn: false, networthOn: true,
    otherAssets: [],
    debts: [{
      id: 'm1', type: 'mortgage', name: 'loan', owner: 'household', balance: 400000, rate: 3,
      paymentMonthly: 1686, payoffAge: 70, includePayment: true, taxDeductible: false,
      mortgageType: 'conventional', rateType, originalAmount: 400000, propertyValue: 600000,
      remainingTermYears: 30, loanTermYears: 30, extraPrincipalMonthly: 0,
      annualPropertyTax: 0, annualInsurance: 0, hoaMonthly: 0, pmiMonthly: 0,
      includeHousingCosts: false, nextRateResetAge: 45, resetRate: 6,
    }],
  });
  p.accounts = [{
    id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 2000000,
    basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  }];
  if (edit) edit(p);
  return p;
}

function debtAt(p, age) {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  const row = r.rows.find((x) => Math.abs(Number(x.age) - age) < 1e-6);
  assert.ok(row, 'no row at ' + age);
  return { payments: Number(row.debtPaymentsTotal) || 0, balance: Number(row.debtBalance) || 0 };
}

/* ------------------------------------------------------------------ the reset raises the payment */

test('S5AA 5.1 (Q94): a 3% to 6% reset raises the payment, with no switch to turn on', () => {
  const p = loanPlan('adjustable');
  assert.equal(p.advanced.armRecastOnReset, false,
    'the FIELD is still there and still false -- it is the SWITCH that is gone. Removing the field from '
    + 'the default plan would change the input hash of every generated corpus scenario, which is a versioned '
    + 'corpus change belonging to task 6.2. Nothing reads it to decide a projection any more -- only to '
    + 'tell a saved plan its numbers moved -- and this test proves the false no longer bites.');
  assert.equal(debtAt(p, 45).payments.toFixed(2), '20232.00', 'before the reset, the entered payment');
  assert.equal(debtAt(p, 46).payments.toFixed(2), '27497.68', 'after it, the re-amortised payment');
});

test('S5AA 5.1 (Q94): the balance falls after the reset instead of growing', () => {
  /* The defect was not slow amortisation. At 6% the interest alone on the reset balance exceeded the
     held payment, so the loan amortised BACKWARDS and never paid off. */
  const p = loanPlan('adjustable');
  const at45 = debtAt(p, 45).balance, at55 = debtAt(p, 55).balance;
  assert.ok(at55 < at45,
    'the balance must fall across ten years after the reset; got ' + at45.toFixed(2) + ' -> ' + at55.toFixed(2));
});

/* ------------------------------------------------------------------ a fixed loan is untouched */

test('S5AA 5.1 (Q94): a fixed-rate loan is unchanged in every year', () => {
  const fixed = loanPlan('fixed');
  for (const age of [45, 46, 50, 55]) {
    assert.equal(debtAt(fixed, age).payments.toFixed(2), '20232.00',
      'a fixed loan has no reset, so nothing re-amortises at ' + age);
  }
});

/* ------------------------------------------------------------------ Q78's refusal is kept */

test('S5AA 5.1 (Q94): a recast term beyond the amortisation module is still REFUSED, never clipped', () => {
  /* Q78 and EXT-03: the module throws on a term past its own maximum, and the engine reports
     DEBT_RECAST_TERM_UNSUPPORTED rather than silently shortening the loan. Making the recast
     unconditional makes this path MORE reachable, not less, so it is pinned here. */
  const p = loanPlan('adjustable', (x) => { x.advanced.debts[0].payoffAge = 900; });
  const r = engine.runPlan(p);
  assert.equal(r.calculationErrorCode, 'DEBT_RECAST_TERM_UNSUPPORTED');
  assert.equal(r.status, 'calculation_error', 'a refusal, and a result rather than a RangeError');
});

/* ------------------------------------------------------------------ the saved plan and its notice */

test('S5AA 5.1 (Q94): a plan saved with the old switch still loads, and is told its projection moved', () => {
  const p = loanPlan('adjustable', (x) => { x.advanced.armRecastOnReset = false; });
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', 'an older saved plan must still run: ' + r.calculationErrorCode);
  const said = (r.issues || []).find((i) => i.code === 'ARM_RECAST_ALWAYS_APPLIED');
  assert.ok(said, 'and it must be told, because its numbers have changed under it');
  assert.equal(said.severity, 'WARNING');
  assert.match(said.message, /re-amortis/i);
  assert.match(said.message, /saved before this change/,
    'the notice is about a plan whose projection moved, not a general description');
});

test('S5AA 5.1 (Q94): the retired switch changes no projection, and is still type-checked', () => {
  /* TWO CLAIMS, and they are not the same one.

     FIRST: no VALID value of the key changes an outcome any more. The recast is unconditional, so true
     and false project identically -- which is why the Q53 contract records that no setup can make them
     differ.

     SECOND: FM-09's protection is NOT given up. Its hazard was that a non-boolean -- the string
     "false" -- ENABLED the feature, because Boolean("false") is true. The engine still reads this key
     (to tell a saved plan its projection moved), which is exactly what keeps the validator and the
     engine boundary type-checking it. A non-boolean is still REFUSED, not coerced and not ignored. */
  const base = debtAt(loanPlan('adjustable'), 46);
  for (const value of [true, false]) {
    const seen = debtAt(loanPlan('adjustable', (x) => { x.advanced.armRecastOnReset = value; }), 46);
    assert.equal(seen.payments.toFixed(6), base.payments.toFixed(6),
      'armRecastOnReset = ' + value + ' must change nothing');
    assert.equal(seen.balance.toFixed(6), base.balance.toFixed(6));
  }
  for (const value of ['false', 'true', 0, 1, null, [], {}]) {
    const r = engine.runPlan(loanPlan('adjustable', (x) => { x.advanced.armRecastOnReset = value; }));
    assert.notEqual(r.status, 'ok',
      'a non-boolean must still be refused, not run: ' + JSON.stringify(value));
  }
});

test('S5AA 5.1 (Q94): a household with no adjustable debt is told nothing about resets', () => {
  const r = engine.runPlan(loanPlan('fixed'));
  assert.equal((r.issues || []).filter((i) => i.code === 'ARM_RECAST_ALWAYS_APPLIED').length, 0);
});

/* ------------------------------------------------------------------ repeat-run consistency */

test('S5AA 5.1 (Q94): two runs of the same plan agree, and the debt object is not mutated', () => {
  /* The recast caches its computed payment on the debt object (`_armScheduledPayment`). If that cache
     escaped onto the caller's plan, a second run would start from a different state -- the defect
     shape Q103 names for projectDebts writing a private field onto the caller's debt. */
  const p = loanPlan('adjustable');
  const first = engine.runPlan(p);
  const second = engine.runPlan(p);
  assert.deepEqual(second.rows.map((r) => r.debtBalance), first.rows.map((r) => r.debtBalance),
    'a second run of the same plan must project the same balances');
  assert.equal(p.advanced.debts[0]._armScheduledPayment, undefined,
    'the caller\'s debt object must come back as it went in');
});
