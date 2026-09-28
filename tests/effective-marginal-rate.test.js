/* S5 task 9: a source's effective marginal tax rate by recomputation (TAX_RULES_ENGINE_REFERENCE_2026.md section 7.3).
 *
 *   effective_marginal_rate(source) = (total_liability(base + delta) - total_liability(base)) / delta
 *
 * effectiveMarginalRate() recomputes estimateTaxes().total, the whole modelled federal and Arizona return, on a $100 step
 * unless told otherwise, and reports the rate above and the rate below separately because a threshold makes them differ.
 * The additive composition it replaces (bracket rate plus Arizona's rate) runs on no live path since R2's piecewise
 * funding solver, so the comparison computes that formula here. runPlan() does not call the new function, so no result
 * moves; the funding quote across the Social Security band is the gate's "still lands exactly" control.
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

const person = (filing, age) => ({ profile: { filing, age, spouseOn: false, spouseAge: age } });
const near = (a, b) => Math.abs(a - b) <= 1e-9;

test('across the Social Security inclusion band, the recomputed ordinary rate is the bracket rate times 1.85 plus Arizona, well above the additive composition', () => {
  const p = person('single', 66);
  const t = engine.estimateTaxes(p, 66, 30000, 0, 24000, 0, 0, 0);
  assert.ok(t.ssTaxable > 0 && t.ssTaxable < 0.85 * 24000 - 200, 'premise: each extra dollar makes 85 cents of benefits taxable: ' + t.ssTaxable);
  const bracket = engine.marginalRateAt(t.ordinaryTaxable, 'single');
  const additive = bracket + RULES.arizona.rate;
  const r = engine.effectiveMarginalRate(p, 66, { ordinaryIncome: 30000, ssBenefit: 24000 }, 'ordinary');
  assert.ok(near(r.above, bracket * 1.85 + RULES.arizona.rate), 'above ' + r.above);
  assert.ok(near(r.below, r.above), 'no threshold within $100 either side: below ' + r.below);
  assert.ok(r.above - additive > 0.05, 'the additive composition ' + additive + ' misses the benefit inclusion');
});

test('at the NIIT threshold the capital-gains rate is one-sided: 3.8 points higher above than below', () => {
  const p = person('single', 40);
  const threshold = RULES.federal.niit.threshold.single;
  const t = engine.estimateTaxes(p, 40, 150000, threshold - 150000, 0, 0, 0, 0);
  assert.equal(t.measures.niit_magi, threshold, 'premise: NIIT MAGI sits exactly on the threshold');
  const cgRate = engine.capitalGainsMarginalRateAt(t.ordinaryTaxable + t.taxableGains, 'single');
  const r = engine.effectiveMarginalRate(p, 40, { ordinaryIncome: 150000, capitalGains: threshold - 150000 }, 'capitalGains');
  assert.ok(near(r.below, cgRate + RULES.arizona.rate), 'below ' + r.below);
  assert.ok(near(r.above, cgRate + RULES.arizona.rate + RULES.federal.niit.rate), 'above ' + r.above);
});

test('inside one bracket with no threshold within the step, the recomputed ordinary rate is the bracket rate plus Arizona on both sides', () => {
  const p = person('single', 40);
  const t = engine.estimateTaxes(p, 40, 80000, 0, 0, 0, 0, 0);
  const r = engine.effectiveMarginalRate(p, 40, { ordinaryIncome: 80000 }, 'ordinary');
  const expected = engine.marginalRateAt(t.ordinaryTaxable, 'single') + RULES.arizona.rate;
  assert.ok(near(r.above, expected) && near(r.below, expected), r.above + ' / ' + r.below + ' vs ' + expected);
});

test('the step defaults to $100, and the rate below is null when the source holds less than the step', () => {
  const p = person('single', 40);
  const r = engine.effectiveMarginalRate(p, 40, { ordinaryIncome: 60000, capitalGains: 50 }, 'capitalGains');
  assert.equal(r.delta, 100);
  assert.equal(r.below, null);
  assert.ok(Number.isFinite(r.above));
  const small = engine.effectiveMarginalRate(p, 40, { ordinaryIncome: 60000, capitalGains: 50 }, 'capitalGains', 25);
  assert.equal(small.delta, 25);
  assert.ok(Number.isFinite(small.below), 'a $25 step fits inside $50 of gains');
});

test('an unknown source is refused rather than priced at zero', () => {
  assert.throws(() => engine.effectiveMarginalRate(person('single', 40), 40, { ordinaryIncome: 60000 }, 'roth'), /unknown source/);
});

test('control: a funding quote that crosses the Social Security inclusion band still lands exactly on estimateTaxes()', () => {
  const p = { profile: { filing: 'single', age: 66, spouseOn: false, spouseAge: 66 }, retirement: { withdrawalOrder: 'priority', manualOrder: 'preTax,taxable,roth,hsa' }, advanced: { assetsOn: false, reserveOn: false, penaltyException: false, rule55: false } };
  const T0 = engine.estimateTaxes(p, 66, 20000, 0, 24000, 0, 0, 0).total;
  const ctx = { ordinaryIncome: 20000, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 24000, filing: 'single', seniorAges: [66, -1], Tbase: T0 - 4000, payrollConst: 0, penalties: 0, penaltyApplies: false };
  const quote = engine.quoteTaxFunding(ctx, ['preTax'], [{ id: 'ira', taxClass: 'preTax', balance: 1000000, basisPct: 0, priority: 1 }], p, 0, 0);
  assert.equal(quote.status, 'funded');
  const real = engine.estimateTaxes(p, 66, quote.finalOrdinaryIncome, quote.finalCapitalGains, 24000, 0, 0, 0);
  assert.ok(quote.finalOrdinaryIncome + 12000 > 34000, 'the sale carries provisional income past the upper base: ' + quote.finalOrdinaryIncome);
  const raised = quote.transactions.reduce((s, x) => s + x.gross, 0);
  assert.ok(Math.abs(raised - (Math.max(0, real.total - ctx.Tbase) + quote.finalPenalties)) <= 0.01, 'raised ' + raised);
});
