/* S5AA task 4.4, Q99 (G5) -- the qualified-medical share of an HSA distribution.
 *
 * WHAT WAS TRUE BEFORE. An HSA draw was tax-free at every age for every purpose. withdrawFromClass()
 * recognised gains for `taxable` and a penalty for `preTax`; the `hsa` class fell through both.
 * quoteTaxFunding() quoted it as {rIncome:0, rGains:0}, and the row added a draw to `ordinaryWithdrawal`
 * only when the class was `preTax`. So the engine modelled an HSA as a Roth account that had also
 * escaped the contribution's income tax -- right for a qualified medical distribution, wrong for any
 * other.
 *
 * THE RULE, from IRC 223(f), checked against the primary source before this file was written
 * (citation check C-06):
 *
 *   223(f)(2)    a distribution not used exclusively for the beneficiary's qualified medical expenses
 *                is included in THAT BENEFICIARY'S gross income.
 *   223(f)(4)(A) the tax is increased by 20 PERCENT OF THE AMOUNT SO INCLUDIBLE -- not of the
 *                distribution. With a 60% qualified share only 40% of the draw is includible, so the
 *                charge is 8% of it and not 20%.
 *   223(f)(4)(B) the 20% does not apply after disability, after death, or after the beneficiary attains
 *                the age in section 1811 of the Social Security Act, which is 65. THE AGE IS THE
 *                ACCOUNT OWNER'S, not the household's.
 *
 * DEFAULT 100. An account with no `qualifiedMedicalPct` behaves exactly as before, so every scenario
 * saved before this change loads unmoved. That default is what makes this a disclosure rather than a
 * silent re-pricing of existing plans. The full set of definitions is in
 * Handover temp/S5AA_TASK_4_4_DEFINITIONS_20260920.md.
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

function acct(id, type, taxClass, owner, balance, extra) {
  return Object.assign({
    id, name: id, type, taxClass, owner, balance, basisPct: taxClass === 'taxable' ? 100 : 0,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  }, extra || {});
}

/* The household spends a fixed amount and holds only an HSA, so the whole draw is an HSA draw and the
   whole tax bill is the tax on it. `manual` withdrawal order pins the class so the optimizer's ranking
   cannot silently change what is being measured. */
function hsaPlan(age, share, spending, spouseAge) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, {
    age, retireAge: age, endAge: age + 1,
    spouseOn: spouseAge !== undefined, spouseAge: spouseAge === undefined ? 60 : spouseAge,
    filing: spouseAge === undefined ? 'single' : 'mfj',
  });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending, dividendOn: false, qcdOn: false,
    withdrawalOrder: 'manual', manualOrder: 'hsa,taxable,preTax,roth',
    stages: [], expenses: [], otherIncomes: [], ssBenefit: 0, spouseSS: 0, survivor: false,
  });
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false });
  const extra = share === null ? {} : { qualifiedMedicalPct: share };
  p.accounts = [acct('hsa', 'hsa', 'hsa', 'self', 400000, extra)];
  return p;
}

function run(p) {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return { result: r, taxes: Number(r.rows[1].taxes) || 0, withdrawals: Number(r.rows[1].withdrawals) || 0 };
}

/* ------------------------------------------------------------------ the default */

test('S5AA 4.4 (Q99): an account with no share stated is fully qualified, and costs nothing', () => {
  const r = run(hsaPlan(50, null, 40000));
  assert.equal(r.taxes.toFixed(2), '0.00',
    'absent must mean 100% qualified, or every scenario saved before this change moves');
});

test('S5AA 4.4 (Q99): a share of 100 is identical to no share at all', () => {
  assert.equal(run(hsaPlan(50, 100, 40000)).taxes.toFixed(2), run(hsaPlan(50, null, 40000)).taxes.toFixed(2));
});

/* ------------------------------------------------------------------ the rule */

test('S5AA 4.4 (Q99): a wholly non-qualified draw before 65 is ordinary income plus 20%', () => {
  /* Single filer, age 50, no other income, holding nothing but the HSA -- so the tax on the draw is
     itself drawn from the HSA and taxed in turn, and the gross exceeds the $40,000 of spending. The
     charge must therefore exceed 20% of the spending, because the draw is ALSO ordinary income at this
     size. Measured against the same household at 100% qualified, which pays neither. */
  const none = run(hsaPlan(50, 0, 40000));
  const full = run(hsaPlan(50, 100, 40000));
  assert.equal(full.taxes.toFixed(2), '0.00');
  assert.ok(none.taxes > 8000,
    'the charge must exceed the 20% alone, because the draw is also ordinary income; got ' + none.taxes.toFixed(2));
});

test('S5AA 4.4 (Q99): the 20% is charged on the INCLUDIBLE amount, not on the distribution', () => {
  /* $10,000 of spending, at 60% qualified and at 0%. The household holds nothing but the HSA, so the
     tax on the draw must itself be drawn from the HSA and is taxed in turn -- the engine solves that
     fixed point, and these figures are its solution, not 20% of the spending.

       0% qualified:  G = 10,000 + 0.20 G  ->  G = 12,500.00 and the tax is 2,500.00
       60% qualified: the includible share is 0.4, so the rate on the draw is 0.08:
                      G = 10,000 + 0.08 G  ->  G = 10,869.57 and the tax is   869.57

     THAT DIFFERENCE IS THE POINT. Were the 20% charged on the distribution rather than on the
     includible amount, the 60% run would solve G = 10,000 + 0.20 G and pay $2,500 -- the same as the
     wholly non-qualified one. Income tax is zero in both: $12,500 of ordinary income is below a single
     filer's standard deduction, so what remains IS the additional tax. */
  const part = run(hsaPlan(50, 60, 10000));
  const none = run(hsaPlan(50, 0, 10000));
  const full = run(hsaPlan(50, 100, 10000));
  assert.equal(full.taxes.toFixed(2), '0.00', 'a fully qualified draw is free');
  assert.equal(none.taxes.toFixed(2), '2500.00', '20% of the $12,500 that had to leave the account');
  assert.equal(part.taxes.toFixed(2), '869.57',
    '20% of the includible 40%, not 20% of the draw -- which would have been 2500.00 again');
  assert.equal(none.withdrawals.toFixed(2), '12500.00', 'and the gross draw is the solved one');
  assert.equal(part.withdrawals.toFixed(2), '10869.57');
});

/* ------------------------------------------------------------------ age 65 */

test('S5AA 4.4 (Q99): at 65 the 20% stops, and the income does not', () => {
  const under = run(hsaPlan(64, 0, 10000));
  const over = run(hsaPlan(66, 0, 10000));
  assert.equal(under.taxes.toFixed(2), '2500.00', 'before 65 the additional tax applies');
  assert.equal(over.taxes.toFixed(2), '0.00',
    'at 65 the additional tax stops; the $10,000 is still ordinary income but falls under the ' +
    'standard deduction, so the household owes nothing on it');
});

test('S5AA 4.4 (Q99): the age tested is the ACCOUNT OWNER\'s, not the household\'s', () => {
  /* Section 223(f)(4) keys the exception on the beneficiary attaining the age in section 1811. A
     66-year-old primary filer does not exempt the 50-year-old spouse's HSA. */
  const p = hsaPlan(66, 0, 10000, 50);
  p.accounts = [acct('hsaSpouse', 'hsa', 'hsa', 'spouse', 400000, { qualifiedMedicalPct: 0 })];
  const spouseOwned = run(p);
  const q = hsaPlan(66, 0, 10000, 50);
  const selfOwned = run(q);
  assert.equal(selfOwned.taxes.toFixed(2), '0.00', 'the 66-year-old\'s own HSA is past the exception');
  assert.equal(spouseOwned.taxes.toFixed(2), '2500.00',
    'the 50-year-old spouse\'s HSA is not, however old the primary filer is');
});

/* ------------------------------------------------------------------ the three sites agree */

test('S5AA 4.4 (Q99): the quote and the settlement agree on a non-qualified draw', () => {
  /* The tax on an HSA draw must itself be funded, and funding it draws more from the HSA, which is
     taxed again. The solver has to price that fixed point. If the quote and the commit disagreed the
     row would report one of the two settlement codes rather than a different total. */
  const r = engine.runPlan(hsaPlan(50, 0, 60000));
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.equal(r.calculationErrorCode || null, null);
  const codes = (r.issues || []).map((i) => i.code);
  assert.ok(!codes.includes('TAX_SETTLEMENT_MISMATCH'), codes.join(','));
  assert.ok(!codes.includes('QUOTE_SETTLEMENT_UNVERIFIED'), codes.join(','));
});

test('S5AA 4.4 (Q99): the optimizer stops ranking a non-qualified HSA as the cheapest class', () => {
  /* smartWithdrawalOrder() scored `hsa` as free money. Before 65 a wholly non-qualified HSA is the
     MOST expensive class the household holds -- ordinary income plus 20% -- and the ranking must read
     the same qualification the quote and the commit read, or the engine recommends a draw it then
     prices as a penalty. */
  const base = {
    profile: { age: 50, spouseAge: 50, spouseOn: false, filing: 'single', endAge: 51, retireAge: 50 },
    retirement: { withdrawalOrder: 'optimized', optimizationGoal: 'balanced', spending: 10000 },
    advanced: { rmdOn: false, healthOn: false, penaltyException: false, rule55: false, legacy: 0 },
  };
  const accounts = [
    acct('tax', 'taxable', 'taxable', 'self', 100000),
    acct('roth', 'rothIRA', 'roth', 'self', 100000),
    acct('hsa', 'hsa', 'hsa', 'self', 100000, { qualifiedMedicalPct: 0 }),
  ];
  const order = engine.smartWithdrawalOrder(base, 50, accounts, [], 0);
  assert.equal(order[order.length - 1], 'hsa',
    'a wholly non-qualified HSA before 65 must rank LAST, not first; got ' + order.join(','));

  const qualified = accounts.map((a) => (a.taxClass === 'hsa' ? Object.assign({}, a, { qualifiedMedicalPct: 100 }) : a));
  const orderQ = engine.smartWithdrawalOrder(base, 50, qualified, [], 0);
  assert.notEqual(orderQ[orderQ.length - 1], 'hsa',
    'a fully qualified HSA must keep its existing standing -- the default must not move the ranking');
});

/* ------------------------------------------------------------------ the disclosure */

test('S5AA 4.4 (Q99): the share is disclosed as an assumption, including when it is the default', () => {
  /* The DEFAULT is the assumption that most needs saying, because it is invisible: a household that
     never touched this field is still being told that every HSA dollar it draws is assumed to pay a
     qualified expense. The raw evidence carries each account's share, so the disclosure survives into
     an export rather than living only in a sentence. */
  const disclosure = (p) => (engine.runPlan(p).issues || []).find((i) => i.code === 'HSA_QUALIFIED_SHARE_ASSUMED');

  const byDefault = disclosure(hsaPlan(50, null, 10000));
  assert.ok(byDefault, 'a household holding an HSA is told what is assumed about it');
  assert.equal(byDefault.severity, 'WARNING');
  assert.deepEqual(byDefault.state.accounts.map((a) => a.qualifiedMedicalPct), [100]);
  assert.match(byDefault.message, /assumed to pay a qualified medical expense/);
  assert.match(byDefault.message, /disability and death are not modelled/,
    'the statutory exceptions this engine does not model are named, not left to be inferred');

  const partial = disclosure(hsaPlan(50, 60, 10000));
  assert.deepEqual(partial.state.accounts.map((a) => a.qualifiedMedicalPct), [60]);
  assert.equal(partial.state.exceptionAge, 65);
  assert.equal(partial.state.additionalTaxRate, 0.2);
  assert.match(partial.message, /assumed NOT to pay a qualified medical expense/);

  const noHsa = JSON.parse(JSON.stringify(hsaPlan(50, null, 10000)));
  noHsa.accounts = [acct('cash', 'taxable', 'taxable', 'self', 400000)];
  noHsa.retirement.manualOrder = 'taxable,preTax,roth,hsa';
  assert.equal(disclosure(noHsa), undefined, 'a household with no HSA is told nothing about one');
});

/* ------------------------------------------------------------------ validation */

test('S5AA 4.4 (Q99): the share is validated as a 0-100 percentage on HSA accounts', () => {
  const validator = require(path.join(ROOT, 'src', 'scenario-validator.js'));
  const bad = hsaPlan(50, 150, 10000);
  const issues = validator.validateScenario(bad).issues || [];
  assert.ok(issues.some((i) => String(i.path || '').includes('qualifiedMedicalPct')),
    'a share of 150 must be reported: ' + issues.map((i) => i.path).join(','));

  const wrongType = hsaPlan(50, 50, 10000);
  wrongType.accounts[0].qualifiedMedicalPct = 'most of it';
  const typeIssues = validator.validateScenario(wrongType).issues || [];
  assert.ok(typeIssues.some((i) => String(i.path || '').includes('qualifiedMedicalPct') && i.code === 'WRONG_TYPE'),
    'a non-numeric share must be WRONG_TYPE');

  const absent = hsaPlan(50, null, 10000);
  const absentIssues = (validator.validateScenario(absent).issues || [])
    .filter((i) => String(i.path || '').includes('qualifiedMedicalPct'));
  assert.deepEqual(absentIssues, [], 'absent is a defined value (100) and must not be reported');
});
