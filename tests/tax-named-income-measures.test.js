/* S5 task 6: the generic MAGI split into named income measures (TAX_RULES_ENGINE_REFERENCE_2026.md section 2.3).
 *
 * estimateTaxes() computed one `magi` and used it for the senior-deduction phaseout, the NIIT threshold and the IRMAA
 * lookback. It now computes the named set and each consumer reads its own measure:
 *   federal_agi            ordinary income + investment income + taxable Social Security (no AGI deduction exists yet)
 *   ss_provisional_income  Pub. 915 comparison income: other income + half the benefits
 *   senior_deduction_magi  AGI with the section 911/931/933 add-backs, none of which the engine models: equal to AGI today
 *   niit_magi              AGI with the section 911 modification, not modelled: equal to AGI today
 *   irmaa_magi             the IRMAA lookback's measure; the result row's `magi` field reports it
 *   arizona_agi            federal AGI less federally taxable Social Security (task 8)
 * Today every MAGI equals federal_agi, so no result moves; the measures diverge once task 7's deductible half of
 * self-employment tax and task 8's Arizona return exist. ss_provisional_income already differs, which is what lets a
 * test tell a consumer reading the wrong measure from one reading its own.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));

const NAMES = ['arizona_agi', 'federal_agi', 'irmaa_magi', 'niit_magi', 'senior_deduction_magi', 'ss_provisional_income'];
const FILINGS = ['single', 'mfj'];
const person = (filing, age) => ({ profile: { filing, age, spouseOn: filing === 'mfj', spouseAge: age } });
/* A grid over filing status, benefits, ordinary income and gains, at 67 so the senior deduction applies. */
function grid(visit) {
  for (const filing of FILINGS) for (const benefit of [0, 24000, 60000]) for (const ordinary of [0, 40000, 150000, 400000]) for (const gains of [0, 30000, 250000]) {
    visit(filing, benefit, ordinary, gains, engine.estimateTaxes(person(filing, 67), 67, ordinary, gains, benefit, 0, 0, 0));
  }
}
const near = (a, b) => Math.abs(a - b) <= 1e-6;

test('estimateTaxes() returns the named income measures, none called bare magi, with arizona_agi computed since task 8', () => {
  const r = engine.estimateTaxes(person('single', 67), 67, 50000, 10000, 20000, 0, 0, 0);
  assert.ok(r.measures && typeof r.measures === 'object', 'a measures object');
  assert.deepEqual(Object.keys(r.measures).sort(), NAMES);
  /* S5AA R48 (AA1-16, the owner's AA1 decision of 2026-10-03): Arizona AGI is also less the federal senior deduction (A.R.S. 43-1022(35)):
     $6,000 for one person 65 or older, less 6% of MAGI (federal AGI) over $75,000. It was federal AGI less taxable Social Security alone. */
  const senior = Math.max(0, 6000 - 0.06 * Math.max(0, r.measures.federal_agi - 75000));
  assert.ok(senior > 0, 'premise: a senior deduction is taken');
  assert.ok(near(r.measures.arizona_agi, r.measures.federal_agi - r.ssTaxable - senior), 'arizona_agi is federal AGI less taxable Social Security and the federal senior deduction');
});

test('federal_agi is ordinary income plus investment income plus taxable Social Security', () => {
  grid((filing, benefit, ordinary, gains, r) => {
    assert.ok(near(r.measures.federal_agi, ordinary + gains + r.ssTaxable), filing + ' ' + benefit + '/' + ordinary + '/' + gains);
  });
});

test('ss_provisional_income is the Pub. 915 comparison income, other income plus half the benefits, and differs from federal_agi when benefits are paid', () => {
  let differed = 0;
  grid((filing, benefit, ordinary, gains, r) => {
    assert.ok(near(r.measures.ss_provisional_income, ordinary + gains + benefit / 2), filing + ' ' + benefit + '/' + ordinary + '/' + gains);
    if (!near(r.measures.ss_provisional_income, r.measures.federal_agi)) differed++;
  });
  assert.ok(differed > 10, 'the two measures differ somewhere on the grid: ' + differed);
});

test('the senior deduction is phased out on senior_deduction_magi, which equals federal_agi while no section 911/931/933 amount is modelled', () => {
  grid((filing, benefit, ordinary, gains, r) => {
    const m = r.measures;
    assert.ok(near(m.senior_deduction_magi, m.federal_agi), 'equal to AGI today');
    /* S5AA task 3.1 (Q88): + the IRC 63(f) additional standard deduction for the aged. Derived the same way
       the senior deduction above it is -- by calling the engine's own rule function -- because this file
       tests which MEASURE each deduction is phased out on, not what the amounts are. */
    const deduction = RULES.federal.standardDeduction[filing] + engine.seniorDeduction(m.senior_deduction_magi, [67, filing === 'mfj' ? 67 : -1], filing) + engine.additionalStandardDeduction([67, filing === 'mfj' ? 67 : -1], filing);
    assert.ok(near(r.ordinaryTaxable, Math.max(0, ordinary + r.ssTaxable - deduction)), filing + ' ' + benefit + '/' + ordinary + '/' + gains + ': ' + r.ordinaryTaxable);
  });
});

test('NIIT is charged on niit_magi above its threshold, capped at net investment income, and niit_magi equals federal_agi today', () => {
  grid((filing, benefit, ordinary, gains, r) => {
    const m = r.measures;
    assert.ok(near(m.niit_magi, m.federal_agi), 'equal to AGI today');
    const expected = RULES.federal.niit.rate * Math.min(gains, Math.max(0, m.niit_magi - RULES.federal.niit.threshold[filing]));
    assert.ok(near(r.niit, expected), filing + ' ' + benefit + '/' + ordinary + '/' + gains + ': ' + r.niit + ' vs ' + expected);
  });
});

test('the result row\'s magi is irmaa_magi, the IRMAA lookback\'s measure', () => {
  grid((filing, benefit, ordinary, gains, r) => {
    assert.ok(near(r.magi, r.measures.irmaa_magi), filing + ' ' + benefit + '/' + ordinary + '/' + gains);
  });
});

test('control: estimateTaxes().magi is ordinary income plus investment income plus taxable Social Security', () => {
  grid((filing, benefit, ordinary, gains, r) => {
    assert.ok(near(r.magi, ordinary + gains + r.ssTaxable), filing + ' ' + benefit + '/' + ordinary + '/' + gains);
  });
});

test('control: a tax-funding quote for a Social Security household that crosses the NIIT threshold reconciles to estimateTaxes()', () => {
  const p = { profile: { filing: 'single', age: 70, spouseOn: false, spouseAge: 70 }, retirement: { withdrawalOrder: 'priority', manualOrder: 'taxable,preTax,roth,hsa' }, advanced: { assetsOn: false, reserveOn: false, penaltyException: false, rule55: false } };
  for (const [ordinary, benefit, need] of [[150000, 40000, 20000], [185000, 30000, 8000], [120000, 60000, 40000]]) {
    const T0 = engine.estimateTaxes(p, 70, ordinary, 0, benefit, 0, 0, 0).total;
    const ctx = { ordinaryIncome: ordinary, capitalGains: 0, qualifiedDividends: 0, ssBenefit: benefit, filing: 'single', seniorAges: [70, -1], Tbase: T0 - need, payrollConst: 0, penalties: 0, penaltyApplies: false };
    const accounts = [{ id: 'b', taxClass: 'taxable', balance: 2000000, basisPct: 0, priority: 1 }];
    const quote = engine.quoteTaxFunding(ctx, ['taxable'], accounts, p, 0, 0);
    assert.equal(quote.status, 'funded', ordinary + '/' + benefit + ': funded');
    const raised = quote.transactions.reduce((s, t) => s + t.gross, 0);
    const real = engine.estimateTaxes(p, 70, quote.finalOrdinaryIncome, quote.finalCapitalGains, benefit, 0, 0, 0);
    assert.ok(real.magi > RULES.federal.niit.threshold.single, 'the sale crosses the NIIT threshold: ' + real.magi);
    assert.ok(Math.abs(raised - (Math.max(0, real.total - ctx.Tbase) + quote.finalPenalties)) <= 0.01, ordinary + '/' + benefit + ': raised ' + raised);
  }
});
