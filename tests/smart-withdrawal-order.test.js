'use strict';

// Track B, L2 -- unit tests for smartWithdrawalOrder(), the scoring
// function that decides WHICH account tax class to draw from first every
// year (complementing tests/withdrawal-strategies.test.js's strategySpending(),
// which decides HOW MUCH). Never tested in isolation before -- only
// exercised indirectly through full runPlan() runs, where its effect on
// the final numbers is nearly impossible to attribute to this function
// specifically versus everything else happening in the same simulation.
//
// smartWithdrawalOrder() works by nudging four base scores (taxable:10,
// preTax:20, roth:34, hsa:48 -- lower score = withdrawn first) up or down
// based on age/goal/RMD/IRMAA/legacy/reserve/debt, then sorting ascending.
// Each test below is chosen to actually flip the relative order of two
// classes (not just nudge a score that doesn't cross another class's
// value), so the assertion is meaningful rather than incidental.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

function planFor(retirementOverrides = {}, advancedOverrides = {}, profileOverrides = {}) {
  return {
    retirement: Object.assign({
      optimizationGoal: 'balanced', rmdSmoothing: false, irmaaGuard: false, spending: 60000,
      preserveRoth: false, survivor: false, selfLife: 95, spouseLife: 95,
    }, retirementOverrides),
    advanced: Object.assign({
      penaltyException: false, rule55: false, healthOn: false, reserveOn: false,
      legacy: 0, debts: [],
    }, advancedOverrides),
    /* RE-FIXTURED BY INTENT at S5AA R35 (SA32F-22): the Rule of 55 needs a separation in or after the year of 55; this owner left at 55. */
    profile: Object.assign({ age: 65, retireAge: 55, filing: 'single', spouseOn: false }, profileOverrides),
  };
}
// Evenly split across the four tax classes so preTaxShare is always ~0.25
// unless a test deliberately overrides the account mix.
function evenAccounts(amount = 1000000) {
  return [
    { taxClass: 'taxable', balance: amount },
    { taxClass: 'preTax', balance: amount },
    { taxClass: 'roth', balance: amount },
    { taxClass: 'hsa', balance: amount },
  ];
}

test('smartWithdrawalOrder: base order with no special conditions is taxable, preTax, roth, hsa', () => {
  const p = planFor({}, {}, { age: 65 }); // age >= 59.5, well below any plausible RMD start age
  const order = engine.smartWithdrawalOrder(p, 65, evenAccounts(), [], 0.05);
  assert.deepEqual(order, ['taxable', 'preTax', 'roth', 'hsa']);
});

test('smartWithdrawalOrder: under 59.5 with no penalty exception pushes preTax to last (avoid the early-withdrawal penalty)', () => {
  const p = planFor({}, { penaltyException: false, rule55: false });
  const order = engine.smartWithdrawalOrder(p, 50, evenAccounts(), [], 0.05);
  assert.deepEqual(order, ['taxable', 'roth', 'hsa', 'preTax']);
});

test('smartWithdrawalOrder: rule55 exception at 55+ removes the early-withdrawal penalty nudge, restoring the base order', () => {
  /* RE-FIXTURED at S5AA R20 (R18F-03): the Rule of 55 exempts EMPLOYER-PLAN money only, and the ranking now prices the
     nudge from the account the draw would tax, so the pre-tax account here is a 401(k). An untyped or IRA pre-tax
     account keeps the nudge under Rule of 55 (tests/audit-s5aa-r20-rule55-ranking.test.js). */
  const p = planFor({}, { rule55: true });
  const accounts = evenAccounts().map((a) => (a.taxClass === 'preTax' ? Object.assign({ type: 'traditional401k' }, a) : a));
  const order = engine.smartWithdrawalOrder(p, 56, accounts, [], 0.05);
  assert.deepEqual(order, ['taxable', 'preTax', 'roth', 'hsa']);
});

test('smartWithdrawalOrder: at or past RMD start age, preTax moves to first (spend down the RMD-forcing balance)', () => {
  const p = planFor({}, {}, { age: 76 });
  const startRmd = engine.rmdStartAge(p);
  const order = engine.smartWithdrawalOrder(p, startRmd, evenAccounts(), [], 0.05);
  assert.deepEqual(order, ['preTax', 'taxable', 'roth', 'hsa']);
});

test('smartWithdrawalOrder: RMD smoothing pre-emptively pulls preTax ahead of taxable before RMDs actually start', () => {
  const p = planFor({ rmdSmoothing: true }, {}, { age: 70 });
  const startRmd = engine.rmdStartAge(p);
  // 59.5 floor keeps this clear of the separate (much larger) early-
  // withdrawal-penalty nudge below that age, which would otherwise swamp
  // the smoothing effect this test is isolating.
  const age = Math.max(59.5, startRmd - 15);
  if (age >= startRmd) return; // guard: only meaningful while still pre-RMD
  // preTaxShare must exceed 0.45 for the smoothing nudge to fire.
  const accounts = [
    { taxClass: 'taxable', balance: 200000 },
    { taxClass: 'preTax', balance: 700000 },
    { taxClass: 'roth', balance: 50000 },
    { taxClass: 'hsa', balance: 50000 },
  ];
  const order = engine.smartWithdrawalOrder(p, age, accounts, [], 0.05);
  assert.deepEqual(order, ['preTax', 'taxable', 'roth', 'hsa'], 'preTax score 20-14=6 must beat taxable\'s 10');
});

test('smartWithdrawalOrder: goal "legacy" (roth +18, hsa +10) combined with preserveRoth (roth +12 more) pushes roth past hsa to last', () => {
  // goal="legacy" alone narrows the roth/hsa gap (34+18=52 vs 48+10=58) but
  // doesn't close it -- roth stays third. Stacking preserveRoth's own +12
  // (a separate, independent nudge) is what actually flips it: 52+12=64 > 58.
  const p = planFor({ optimizationGoal: 'legacy', preserveRoth: true });
  const order = engine.smartWithdrawalOrder(p, 65, evenAccounts(), [], 0.05);
  assert.deepEqual(order, ['taxable', 'preTax', 'hsa', 'roth'], 'roth 34+18+12=64 must exceed hsa\'s 48+10=58');
});

test('smartWithdrawalOrder: goal "success" combined with healthOn at 65+ pulls hsa ahead of roth', () => {
  const p = planFor({ optimizationGoal: 'success' }, { healthOn: true });
  const order = engine.smartWithdrawalOrder(p, 65, evenAccounts(), [], 0.05);
  assert.deepEqual(order, ['taxable', 'preTax', 'hsa', 'roth'], 'hsa 48-12-10=26 must fall below roth\'s 34-4=30');
});

test('smartWithdrawalOrder: preserveRoth and a nonzero advanced.legacy asset apply the identical +12 roth nudge', () => {
  // +12 alone (34 -> 46) narrows the gap to hsa's 48 but doesn't close it,
  // so pair it with healthOn's independent -10 to hsa (48 -> 38) to get an
  // observable order flip -- proving the +12 actually applied, via either
  // trigger, rather than asserting on an unchanged order that wouldn't
  // distinguish "nudge applied but not enough" from "nudge never applied".
  const withPreserve = planFor({ preserveRoth: true }, { healthOn: true });
  const order1 = engine.smartWithdrawalOrder(withPreserve, 65, evenAccounts(), [], 0.05);
  assert.deepEqual(order1, ['taxable', 'preTax', 'hsa', 'roth'], 'roth 34+12=46 must exceed hsa 48-10=38');

  const withLegacyAsset = planFor({}, { legacy: 500000, healthOn: true });
  const order2 = engine.smartWithdrawalOrder(withLegacyAsset, 65, evenAccounts(), [], 0.05);
  assert.deepEqual(order2, order1, 'a nonzero advanced.legacy asset must trigger the identical +12 roth protection as preserveRoth');
});
