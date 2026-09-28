/* S5 task 7: self-employment tax, on the owner's question 4 answered (B), 2026-09-14: self-employment profit is an
 * otherIncomes type, `selfEmployment`, timed by owner and ages.
 *
 * TAX_RULES_ENGINE_REFERENCE_2026.md section 3.8, for the common Schedule SE case:
 *   net earnings        = 0.9235 * adjusted net profit, and no SE tax below $400 of net earnings
 *   SE Social Security  = 0.124 * min(net earnings, max(0, 184,500 - that person's Social Security wages))
 *   SE Medicare         = 0.029 * net earnings
 *   Additional Medicare = 0.009 * max(0, Medicare wages + net SE earnings - filing-status threshold)
 *   deductible half     = 0.50 * (SE Social Security + SE Medicare); Additional Medicare is not in it
 * The deductible half comes off income before taxable Social Security and federal AGI (section 2.4).
 *
 * estimateTaxes() takes each person's adjusted SE profit as two trailing arguments; the profit itself is also in
 * ordinary income, as it is on the return. The validator accepts the new type through its own constant, so the corpus
 * generator, which draws from INCOME_TYPES, never draws it and no corpus input moves (the run's call under the owner's
 * answer 7 (A)).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const { corpus, installDebtModules } = require('../tools/capture-baseline.js');
installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const { validateScenario } = require('../src/scenario-validator.js');
const generator = require('./lib/scenario-generator.js');
const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const person = (filing, age) => ({ profile: { filing, age, spouseOn: false, spouseAge: age } });
const cents = (v) => Math.round(v * 100) / 100;

test('F-SE-01: $100,000 of adjusted SE profit and no wages gives net earnings $92,350 and SE tax $14,129.55', () => {
  const r = engine.estimateTaxes(person('single', 45), 45, 100000, 0, 0, 0, 0, 0, 100000, 0);
  assert.equal(cents(r.seNetEarnings), 92350);
  assert.equal(cents(r.seSocialSecurity), 11451.4);
  assert.equal(cents(r.seMedicare), 2678.15);
  assert.equal(cents(r.seTax), 14129.55);
});

test('the SE Social Security part is capped at the wage base less the same person\'s wages, including at the base\'s edges', () => {
  const r = engine.estimateTaxes(person('single', 45), 45, 250000, 0, 0, 150000, 0, 0, 100000, 0);
  assert.equal(cents(r.seSocialSecurity), cents(0.124 * (184500 - 150000)), 'wages $150,000 leave $34,500 of base');
  const base = RULES.federal.payroll.oasdiWageBase;
  for (const [wages, room] of [[base - 1, 1], [base, 0], [base + 1, 0]]) {
    const x = engine.estimateTaxes(person('single', 45), 45, wages + 50000, 0, 0, wages, 0, 0, 50000, 0);
    assert.equal(cents(x.seSocialSecurity), cents(0.124 * room), 'wages ' + wages);
  }
});

test('half the SE tax, without Additional Medicare, comes off federal AGI and off the income that decides Social Security taxability', () => {
  const r = engine.estimateTaxes(person('single', 45), 45, 100000, 0, 0, 0, 0, 0, 100000, 0);
  const half = 0.5 * (r.seSocialSecurity + r.seMedicare);
  assert.equal(cents(r.seDeductibleHalf), cents(half));
  assert.ok(Math.abs(r.measures.federal_agi - (100000 - half)) <= 0.005, 'federal_agi ' + r.measures.federal_agi);
  const withSs = engine.estimateTaxes(person('single', 66), 66, 60000, 0, 30000, 0, 0, 0, 60000, 0);
  assert.ok(Math.abs(withSs.measures.ss_provisional_income - (60000 - withSs.seDeductibleHalf + 15000)) <= 0.005, 'provisional income uses the adjusted income');
});

test('Additional Medicare applies to wages plus net SE earnings over the filing threshold', () => {
  const r = engine.estimateTaxes(person('single', 45), 45, 250000, 0, 0, 150000, 0, 0, 100000, 0);
  const pr = RULES.federal.payroll;
  const employee = 150000 * pr.oasdiEmployee + 150000 * pr.medicareEmployee;
  const additional = Math.max(0, 150000 + 92350 - pr.additionalThreshold.single) * pr.additionalMedicare;
  assert.equal(cents(r.payroll), cents(employee + additional + r.seTax));
});

test('net SE earnings under $400 carry no SE tax', () => {
  assert.equal(engine.estimateTaxes(person('single', 45), 45, 400, 0, 0, 0, 0, 0, 400, 0).seTax, 0, '$400 of profit is $369.40 of net earnings');
  assert.ok(engine.estimateTaxes(person('single', 45), 45, 1000, 0, 0, 0, 0, 0, 1000, 0).seTax > 0, '$1,000 of profit is taxed');
});

test('runPlan(): a selfEmployment income is taxed for self-employment while it runs, and not after it ends', () => {
  const plan = (type) => {
    const p = JSON.parse(JSON.stringify(defaultPlan));
    p.setupComplete = true;
    Object.assign(p.profile, { age: 50, retireAge: 50, endAge: 58, spouseOn: false, filing: 'single' });
    Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
    Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
    Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 30000, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [], dividendOn: false,
      otherIncomes: [{ name: 'Consulting', type, owner: 'self', amount: 60000, start: 50, end: 55, growthMode: 'fixed', growth: 0 }] });
    Object.assign(p.advanced, { healthOn: false, rmdOn: false, conversionOn: false, transferOn: false, ltcOn: false, otherAssets: [], debts: [] });
    return p;
  };
  const se = engine.runPlan(plan('selfEmployment')), other = engine.runPlan(plan('other'));
  assert.equal(se.status, 'ok');
  assert.equal(other.status, 'ok');
  const taxAt = (r, age) => r.rows.find((row) => row.age === age).taxes;
  assert.ok(taxAt(se, 52) - taxAt(other, 52) > 5000, 'SE tax while it runs: ' + taxAt(se, 52) + ' vs ' + taxAt(other, 52));
  assert.equal(cents(taxAt(se, 57)), cents(taxAt(other, 57)), 'nothing after it ends');
});

test('the validator accepts a selfEmployment income', () => {
  const p = JSON.parse(JSON.stringify(corpus()[0].plan));
  p.retirement.otherIncomes = [{ name: 'Consulting', type: 'selfEmployment', owner: 'self', amount: 60000, start: p.profile.age, end: p.profile.age + 5, growthMode: 'fixed', growth: 0 }];
  const bad = validateScenario(p).issues.filter((i) => i.path === 'retirement.otherIncomes[0].type');
  assert.deepEqual(bad, []);
});

test('control: estimateTaxes() without SE amounts gives the same result as with zero SE profit', () => {
  for (const [ordinary, gains, ss, wages] of [[80000, 0, 0, 80000], [150000, 20000, 30000, 0], [400000, 0, 0, 400000]]) {
    const a = engine.estimateTaxes(person('single', 66), 66, ordinary, gains, ss, wages, 0, 0);
    const b = engine.estimateTaxes(person('single', 66), 66, ordinary, gains, ss, wages, 0, 0, 0, 0);
    assert.equal(a.total, b.total, ordinary + '/' + gains + '/' + ss + '/' + wages);
  }
});

test('control: the corpus generator\'s income types do not include selfEmployment, so no generated scenario draws it', () => {
  const { incomeTypes } = generator.describeSources();
  assert.ok(Array.isArray(incomeTypes) && incomeTypes.length > 0);
  assert.equal(incomeTypes.includes('selfEmployment'), false);
});
