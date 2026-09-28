'use strict';

/*
 * S4 task 4.6 -- Q54, split and version: every debt classified, and each class
 * held to an INDEPENDENT expectation (tests/lib/debt-classes.js).
 *
 * The expectation is the closed-form amortization balance plus the payoffAge
 * rule, written from the arithmetic, never read from the engine. This file
 * holds the engine to it:
 *   - on a hand-built fixture for each of the six classes, row by row;
 *   - at the payment boundary: just below, at, and just above the monthly
 *     interest, under the declared rounding;
 *   - on the control corpus's own debts, whose class distribution is a known,
 *     frozen property of that corpus;
 *   - and Q54's five seed ranges are re-measured: the generator's debt draw is
 *     unchanged by the split-and-version decision, so its share is too.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const baseline = require('../tools/capture-baseline.js');
baseline.installDebtModules();
const engine = require('../src/engine.js');
const DebtAmortization = require('../src/debt-amortization.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs.js');
const { generateScenarios } = require('./lib/scenario-generator.js');
const classes = require('./lib/debt-classes.js');

const DEFAULT_PLAN = extractDefaultPlan(SHELL);
const START_AGE = 60;
const clone = (v) => JSON.parse(JSON.stringify(v));

/* One debt, a household that can afford it, and nothing else moving. */
function household(debt) {
  const p = clone(DEFAULT_PLAN);
  p.setupComplete = true;
  Object.assign(p.profile, { age: START_AGE, retireAge: START_AGE, endAge: 80, spouseOn: false });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 5, inflation: 2 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 40000, ssBenefit: 0, selfLife: 80 });
  p.advanced.networthOn = true;
  p.advanced.otherAssets = [];
  p.accounts = [{
    id: 'brokerage', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 1500000,
    contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  p.advanced.debts = [Object.assign({ id: 'd1', name: 'Debt', type: 'otherDebt', owner: 'household', rateType: 'fixed', includePayment: true }, debt)];
  return p;
}

const FIXTURES = {
  'ordinary-amortizing': { balance: 180000, rate: 5.5, paymentMonthly: DebtAmortization.monthlyPayment(180000, 5.5, 180), payoffAge: 82 },
  'zero-interest': { balance: 12000, rate: 0, paymentMonthly: 250, payoffAge: 82 },
  'zero-balance': { balance: 0, rate: 6.5, paymentMonthly: 0, payoffAge: 82 },
  'payoff': { balance: 150000, rate: 6, paymentMonthly: DebtAmortization.monthlyPayment(150000, 6, 360), payoffAge: 70 },
  'negative-amortizing': { balance: 418773, rate: 11.77, paymentMonthly: 224, payoffAge: 77 },
  'interest-only': { balance: 200000, rate: 6, paymentMonthly: 1000, payoffAge: 75 },
};

test('Q54 4.6: the classifier names each class by rule, and places the payment boundary under the declared rounding', () => {
  assert.equal(classes.DECLARED_ROUNDING, 0.005, 'the declared rounding is half a cent a month');
  assert.deepEqual(Object.keys(FIXTURES).sort(), classes.CLASSES.slice().sort(), 'a fixture for every class');
  for (const [kind, debt] of Object.entries(FIXTURES)) {
    assert.equal(classes.classifyDebt(debt, START_AGE).kind, kind, kind);
    assert.equal(typeof classes.EXPECTATIONS[kind], 'string', kind + ' states its expectation');
  }
  // $100,000 at 6% accrues exactly $500.00 a month.
  const at = (payment, payoffAge) => classes.classifyDebt({ balance: 100000, rate: 6, paymentMonthly: payment, payoffAge }, START_AGE).kind;
  assert.equal(at(499.99, 75), 'negative-amortizing', 'a cent below the interest');
  assert.equal(at(500.00, 75), 'interest-only', 'exactly the interest');
  assert.equal(at(500.01, 75), 'payoff', 'a cent above amortizes, too slowly to finish by payoffAge');
  assert.equal(at(500.01, 250), 'ordinary-amortizing', 'the same payment with room to finish amortizes ordinarily');
  // $100,001 accrues $500.005: a whole-cent payment of $500.00 is within the declared rounding.
  const halfCent = (payment) => classes.classifyDebt({ balance: 100001, rate: 6, paymentMonthly: payment, payoffAge: 75 }, START_AGE).kind;
  assert.equal(halfCent(500.00), 'interest-only', 'half a cent below is within the declared rounding');
  assert.equal(halfCent(499.99), 'negative-amortizing', 'a cent and a half below is not');
  // Extra principal counts toward the payment, and an adjustable debt is flagged.
  assert.equal(classes.classifyDebt({ balance: 100000, rate: 6, paymentMonthly: 400, extraPrincipalMonthly: 200, payoffAge: 250 }, START_AGE).kind, 'ordinary-amortizing');
  assert.equal(classes.classifyDebt({ balance: 100000, rate: 6, paymentMonthly: 400, rateType: 'adjustable', payoffAge: 75 }, START_AGE).adjustable, true);
});

test('Q54 4.6: each class\'s independent expectation holds against the engine, row by row', () => {
  for (const [kind, debt] of Object.entries(FIXTURES)) {
    const rows = engine.runPlan(clone(household(debt))).rows;
    assert.equal(rows[0].age, START_AGE, kind + ': row 0 is the starting age');
    rows.forEach((row, i) => {
      const expected = classes.expectedBalance(debt, 12 * (row.age - START_AGE), START_AGE);
      assert.ok(Math.abs(row.debtBalance - expected) <= 1e-6 * Math.max(1, expected),
        kind + ' age ' + row.age + ': debtBalance ' + row.debtBalance + ' != closed form ' + expected);
    });
    const before = rows.filter((r) => r.age < debt.payoffAge);
    const step = (i) => before[i].debtBalance - before[i - 1].debtBalance;
    const payoffRow = rows.find((r) => r.age === debt.payoffAge);
    if (kind === 'zero-balance') {
      rows.forEach((r) => { assert.equal(r.debtBalance, 0); assert.equal(r.debtInterest, 0); assert.equal(r.debtPaymentsTotal, 0); });
    }
    if (kind === 'zero-interest') {
      rows.forEach((r) => assert.equal(r.debtInterest, 0, 'no interest at 0%'));
      assert.ok(rows.some((r) => r.age < debt.payoffAge && r.debtBalance === 0), 'paid off by its own payments before payoffAge');
    }
    if (kind === 'negative-amortizing') {
      for (let i = 1; i < before.length; i++) assert.ok(step(i) > 0, 'the balance rises every year before payoffAge (age ' + before[i].age + ')');
    }
    if (kind === 'interest-only') {
      for (let i = 1; i < before.length; i++) assert.ok(Math.abs(step(i)) <= 12 * classes.DECLARED_ROUNDING * 1.1, 'the balance holds within declared rounding');
    }
    if (kind === 'ordinary-amortizing') {
      /* A loan paid off by its own schedule can leave float dust (~1e-11) that
         the engine's loop, which stops at 1e-9, never clears. Dust is zero here,
         at the same 1e-6 the closed-form comparison above uses. */
      const DUST = 1e-6;
      const live = before.filter((r) => r.debtBalance > DUST);
      for (let i = 1; i < live.length; i++) assert.ok(live[i].debtBalance < live[i - 1].debtBalance, 'the balance falls every year (age ' + live[i].age + ')');
      assert.ok(live.length > 1, 'reach: some years actually amortize');
      assert.ok(before.some((r) => r.debtBalance <= DUST), 'and reaches zero before payoffAge');
    }
    if (kind === 'payoff' || kind === 'negative-amortizing' || kind === 'interest-only') {
      assert.ok(payoffRow, kind + ': the horizon reaches payoffAge');
      assert.equal(payoffRow.debtBalance, 0, kind + ': nothing remains from payoffAge on');
      const prior = rows.find((r) => r.age === debt.payoffAge - 1);
      assert.ok(payoffRow.debtPaymentsTotal > 3 * prior.debtPaymentsTotal, kind + ': the remainder is paid at once');
    }
    if (kind === 'payoff') {
      for (let i = 1; i < before.length; i++) assert.ok(step(i) < 0, 'the balance falls every year before payoffAge');
    }
  }
});

test('Q54 4.6: the payment boundary, observed in the engine -- a cent below rises, at the interest holds, a cent above falls', () => {
  const firstYear = (debt) => engine.runPlan(clone(household(debt))).rows[1].debtBalance - debt.balance;
  const below = firstYear({ balance: 100000, rate: 6, paymentMonthly: 499.99, payoffAge: 75 });
  const at = firstYear({ balance: 100000, rate: 6, paymentMonthly: 500.00, payoffAge: 75 });
  const above = firstYear({ balance: 100000, rate: 6, paymentMonthly: 500.01, payoffAge: 75 });
  assert.ok(below > 0, 'a cent below the interest capitalises: ' + below);
  assert.ok(Math.abs(at) <= 1e-9, 'exactly the interest holds: ' + at);
  assert.ok(above < 0, 'a cent above amortizes: ' + above);
  assert.ok(Math.abs(below + above) <= 1e-6, 'and the two sides are symmetric about the boundary');
  const halfCent = firstYear({ balance: 100001, rate: 6, paymentMonthly: 500.00, payoffAge: 75 });
  assert.ok(halfCent > 0 && halfCent <= 12 * classes.DECLARED_ROUNDING * 1.1,
    'half a cent under the interest drifts, but only within the declared rounding band: ' + halfCent);
});

test('Q54 4.6: the control corpus\'s debts are classified -- a known, FROZEN property, checked against the closed form where it applies', () => {
  const found = {};
  const byKind = {};
  let checked = 0;
  const skipped = [];
  baseline.corpus().forEach(({ name, plan }) => {
    const debts = (plan.advanced && plan.advanced.debts) || [];
    debts.forEach((d, i) => {
      const c = classes.classifyDebt(d, plan.profile.age);
      found[c.kind] = (found[c.kind] || 0) + 1;
      (byKind[c.kind] = byKind[c.kind] || []).push(name + '[' + i + ']');
    });
    if (debts.length !== 1) { if (debts.length) skipped.push(name + ': ' + debts.length + ' debts share one balance column'); return; }
    if (debts[0].rateType === 'adjustable') { skipped.push(name + ': adjustable, class may change at reset'); return; }
    if (plan.assumptions.method === 'monteCarlo') { skipped.push(name + ': Monte Carlo rows are percentiles'); return; }
    engine.runPlan(clone(plan)).rows.forEach((row) => {
      const expected = classes.expectedBalance(debts[0], 12 * (row.age - plan.profile.age), plan.profile.age);
      checked++;
      assert.ok(Math.abs(row.debtBalance - expected) <= 1e-6 * Math.max(1, expected),
        name + ' age ' + row.age + ': debtBalance ' + row.debtBalance + ' != closed form ' + expected);
    });
  });
  /* The control is frozen (tools/control-corpus.json), so this distribution is
     a fact about it, not a target. Four of eleven debts negatively amortize --
     Q54's accidental third, labelled here rather than left undiscovered. */
  assert.deepEqual(found, { 'negative-amortizing': 4, 'payoff': 2, 'ordinary-amortizing': 5 },
    'the control corpus\'s debt classes moved: ' + JSON.stringify(byKind));
  assert.deepEqual(byKind['negative-amortizing'], ['seed:1[0]', 'seed:3[0]', 'seed:14[0]', 'seed:17[1]']);
  assert.ok(checked > 0, 'reach: some control debt rows were checked against the closed form');
  assert.ok(skipped.length > 0, 'and the ones that could not be are named: ' + skipped.join('; '));
});

test('Q54 4.6: SPLIT AND VERSION -- the ordinary and adversarial sets are versioned, labelled truthfully, and cover every class', () => {
  const expansion = require('./lib/corpus-expansion.js');
  const families = new Map(expansion.EXPANSION_FAMILIES.map((f) => [f.id, f]));
  const ordinary = families.get('debts-ordinary');
  const adversarial = families.get('debts-adversarial');
  assert.ok(ordinary && adversarial, 'both sets exist, separately');
  assert.equal(ordinary.version, 1);
  assert.equal(adversarial.version, 1);
  const covered = new Set();
  const scenarios = new Map(expansion.expansionScenarios(DEFAULT_PLAN).map((e) => [e.name, e.plan]));
  for (const [family, allowed] of [[ordinary, ['ordinary-amortizing', 'zero-interest', 'zero-balance', 'payoff']], [adversarial, ['negative-amortizing', 'interest-only']]]) {
    for (const member of family.members) {
      const plan = scenarios.get(member.name);
      const debt = plan.advanced.debts[0];
      assert.equal(plan.advanced.debts.length, 1, member.name + ': one debt, so the row columns are that debt\'s');
      const kind = classes.classifyDebt(debt, plan.profile.age).kind;
      assert.equal(kind, member.debtClass, member.name + ' is labelled ' + member.debtClass + ' but classifies as ' + kind);
      assert.ok(allowed.includes(kind), member.name + ': a ' + kind + ' debt does not belong in ' + family.id);
      covered.add(kind);
      if (family === ordinary && Number(debt.balance) > 0) {
        const termMonths = debt.loanTermYears * 12;
        assert.equal(debt.paymentMonthly, DebtAmortization.monthlyPayment(debt.balance, debt.rate, termMonths),
          member.name + ': an ordinary debt\'s payment is its balance, rate and term, agreeing');
      }
      if (family === adversarial) {
        assert.ok(classes.paymentOf(debt) <= classes.monthlyInterestOf(debt) + classes.DECLARED_ROUNDING + 1e-9,
          member.name + ': an adversarial debt pays at or below its own interest');
      }
      const rows = engine.runPlan(clone(plan)).rows;
      assert.ok(family.reached({ rows }, plan, member), member.name + ': its rows meet its class\'s closed form');
    }
  }
  assert.deepEqual([...covered].sort(), classes.CLASSES.slice().sort(), 'together the two sets cover every class');
});

test('Q54 4.6: re-measured over Q54\'s five seed ranges -- the generator\'s debt draw is unchanged, and so is its share', () => {
  /* Split and version keeps the generator as it is: the control corpus is built
     from it and must not move. So the share Q54 measured is still the share,
     restated here at this commit. A change means the generator's debt draw
     moved -- re-check 4.4 and re-state Q54's figures with the new commit. */
  const measure = (count, startSeed) => {
    let debts = 0;
    let under = 0;
    generateScenarios(DEFAULT_PLAN, { count, startSeed }).forEach(({ plan }) => {
      ((plan.advanced && plan.advanced.debts) || []).forEach((d) => {
        if (!(Number(d.balance) > 0 && Number(d.rate) > 0)) return;
        debts++;
        if (Number(d.paymentMonthly) <= classes.monthlyInterestOf(d)) under++;
      });
    });
    return [debts, under, (100 * under / debts).toFixed(1)];
  };
  assert.deepEqual(measure(120, 1), [91, 33, '36.3']);
  assert.deepEqual(measure(120, 1000), [84, 31, '36.9']);
  assert.deepEqual(measure(120, 5000), [98, 33, '33.7']);
  assert.deepEqual(measure(500, 1), [345, 110, '31.9']);
  assert.deepEqual(measure(500, 20000), [324, 112, '34.6']);
});
