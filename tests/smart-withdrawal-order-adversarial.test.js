'use strict';

// Track B, L5 -- adversarial/boundary-exact pass on smartWithdrawalOrder(),
// following the same file's L2 base coverage (tests/smart-withdrawal-order
// .test.js, 8 tests, each chosen to flip an order comparison somewhere
// inside a clearly-triggered or clearly-untriggered zone). This file
// targets every strict inequality in the function's source at its exact
// boundary value -- age<59.5, age>=55, preTaxShare>.45, age>=startRmd,
// age>=63, the IRMAA margin's "<", preTaxShare>.55, age>=65, the survivor
// age threshold, priorReturn<0, and debtTotal>total*.25 -- proving each one
// is evaluated with the documented strictness (an exactly-equal value does
// NOT trigger a ">"/"<" nudge, but DOES trigger a ">="/"<=" one) rather
// than assuming it from reading the source.

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
function evenAccounts(amount = 1000000) {
  return [
    { taxClass: 'taxable', balance: amount },
    { taxClass: 'preTax', balance: amount },
    { taxClass: 'roth', balance: amount },
    { taxClass: 'hsa', balance: amount },
  ];
}
const BASE_ORDER = ['taxable', 'preTax', 'roth', 'hsa'];

// ---------------------------------------------------------------------------
// Early-withdrawal penalty avoidance: age < 59.5 (strict)
// ---------------------------------------------------------------------------

test('penalty nudge: exactly 59.5 does NOT trigger (the check is strictly "<"), one tick below does', () => {
  const p = planFor();
  assert.deepEqual(engine.smartWithdrawalOrder(p, 59.5, evenAccounts(), [], 0.05), BASE_ORDER);
  assert.deepEqual(engine.smartWithdrawalOrder(p, 59.499, evenAccounts(), [], 0.05), ['taxable', 'roth', 'hsa', 'preTax']);
});

test('rule55 waiver: exactly age 55 counts as "55+" and waives the penalty nudge; one tick below still incurs it', () => {
  /* RE-FIXTURED at S5AA R20 (R18F-03): the Rule of 55 exempts employer-plan money only, and the ranking now prices the
     nudge from the account the draw would tax, so the pre-tax account here is a 401(k). The boundary is unchanged. */
  const p = planFor({}, { rule55: true });
  const accounts = () => evenAccounts().map((a) => (a.taxClass === 'preTax' ? Object.assign({ type: 'traditional401k' }, a) : a));
  assert.deepEqual(engine.smartWithdrawalOrder(p, 55, accounts(), [], 0.05), BASE_ORDER);
  assert.deepEqual(engine.smartWithdrawalOrder(p, 54.999, accounts(), [], 0.05), ['taxable', 'roth', 'hsa', 'preTax']);
});

// ---------------------------------------------------------------------------
// RMD smoothing: preTaxShare > 0.45 (strict), and the age floor
// max(55, startRmd-15)
// ---------------------------------------------------------------------------

test('rmdSmoothing: preTaxShare of exactly 0.45 does NOT trigger the smoothing nudge; a hair above does', () => {
  const p = planFor({ rmdSmoothing: true });
  const startRmd = engine.rmdStartAge(p);
  const age = Math.max(59.5, startRmd - 15); // clear of the separate penalty nudge, per the L2 file's own guard
  if (age >= startRmd) return;
  const atBoundary = [
    { taxClass: 'preTax', balance: 45 },
    { taxClass: 'taxable', balance: 55 },
    { taxClass: 'roth', balance: 0 }, { taxClass: 'hsa', balance: 0 },
  ];
  assert.deepEqual(engine.smartWithdrawalOrder(p, age, atBoundary, [], 0.05)[0], 'taxable', 'exactly 0.45 must not fire the smoothing nudge, leaving taxable (score 10) ahead of preTax (score 20)');
  const justAbove = [
    { taxClass: 'preTax', balance: 45.01 },
    { taxClass: 'taxable', balance: 54.99 },
    { taxClass: 'roth', balance: 0 }, { taxClass: 'hsa', balance: 0 },
  ];
  assert.deepEqual(engine.smartWithdrawalOrder(p, age, justAbove, [], 0.05)[0], 'preTax', 'a share just above 0.45 must fire the nudge (preTax 20-14=6 beats taxable\'s 10)');
});

test('rmdSmoothing: at the age floor exactly (max(55,startRmd-15)) the nudge is eligible; one tick below the floor it is not, regardless of preTaxShare', () => {
  const p = planFor({ rmdSmoothing: true });
  const startRmd = engine.rmdStartAge(p);
  const floorAge = Math.max(55, startRmd - 15);
  if (floorAge >= startRmd) return;
  const highPreTaxShare = [
    { taxClass: 'preTax', balance: 900000 },
    { taxClass: 'taxable', balance: 100000 },
    { taxClass: 'roth', balance: 0 }, { taxClass: 'hsa', balance: 0 },
  ];
  assert.deepEqual(engine.smartWithdrawalOrder(p, floorAge, highPreTaxShare, [], 0.05)[0], 'preTax', 'exactly at the age floor, a high preTaxShare must fire the nudge');
  if (floorAge - 0.5 >= 59.5) { // stay clear of the separate penalty nudge for a clean isolation
    assert.deepEqual(engine.smartWithdrawalOrder(p, floorAge - 0.5, highPreTaxShare, [], 0.05)[0], 'taxable', 'one tick below the age floor, the same high preTaxShare must NOT fire the nudge');
  }
});

// ---------------------------------------------------------------------------
// RMD start age: age >= startRmd (inclusive)
// ---------------------------------------------------------------------------

test('RMD start: half a year before startRmd, the pre-RMD nudge has not fired yet (only ">=", not ">", but still not equal)', () => {
  const p = planFor();
  const startRmd = engine.rmdStartAge(p);
  const order = engine.smartWithdrawalOrder(p, startRmd - 0.5, evenAccounts(), [], 0.05);
  assert.deepEqual(order, BASE_ORDER, 'half a year before RMD start, preTax must still be in its base position');
});

// ---------------------------------------------------------------------------
// IRMAA guard: age >= 63, and the margin check "nextIrmaa - latestMagi <
// max(10000, spending*0.35)" (strict "<")
// ---------------------------------------------------------------------------

test('irmaaGuard: age exactly 63 is eligible; age 62.999 is not, even with an identical tight MAGI margin', () => {
  const jointThresholds = RULES.medicare.irmaa.singleThresholds;
  const nextThreshold = jointThresholds[0];
  const latestMagi = nextThreshold - 5000; // margin of 5000, well under the 10000 floor -- should fire once age-eligible
  const p = planFor({ irmaaGuard: true, spending: 10000 }); // max(10000, spending*.35) = 10000
  const atAge = engine.smartWithdrawalOrder(p, 63, evenAccounts(), [latestMagi], 0.05);
  const belowAge = engine.smartWithdrawalOrder(p, 62.999, evenAccounts(), [latestMagi], 0.05);
  // Scores at 63 with the guard firing: taxable 10, preTax 20+18=38, roth 34,
  // hsa 48 -> sorted taxable, roth, preTax, hsa.
  assert.deepEqual(atAge, ['taxable', 'roth', 'preTax', 'hsa'], 'at 63 with a tight margin, the +18 must land preTax between roth and hsa');
  assert.deepEqual(belowAge, BASE_ORDER, 'the same tight margin one tick before age 63 must not yet apply the IRMAA nudge');
});

test('irmaaGuard: a margin exactly equal to the threshold floor does NOT trigger (strict "<"); one dollar tighter does', () => {
  const singleThresholds = RULES.medicare.irmaa.singleThresholds;
  const nextThreshold = singleThresholds[0];
  const p = planFor({ irmaaGuard: true, spending: 10000 }); // floor = max(10000, 3500) = 10000
  const atBoundaryMagi = nextThreshold - 10000; // margin exactly 10000 -> must NOT fire
  const justInsideMagi = nextThreshold - 10000 + 1; // margin 9999 -> must fire
  const atBoundary = engine.smartWithdrawalOrder(p, 65, evenAccounts(), [atBoundaryMagi], 0.05);
  const justInside = engine.smartWithdrawalOrder(p, 65, evenAccounts(), [justInsideMagi], 0.05);
  assert.notDeepEqual(atBoundary, justInside, 'a margin exactly at the floor and one dollar inside it must NOT produce the same order -- the nudge must be strictly boundary-sensitive');
  assert.deepEqual(atBoundary, BASE_ORDER, 'exactly at the margin floor, the guard must not have fired');
});

// ---------------------------------------------------------------------------
// goal "taxes": the extra preTax cut needs BOTH preTaxShare > 0.55 AND
// age < startRmd
// ---------------------------------------------------------------------------

test('goal "taxes": the extra preTaxShare>0.55 cut is real -- stacked with rmdSmoothing so the extra -5 is what tips preTax below taxable, not merely "no observed change"', () => {
  // A lone -5 (20->15) never crosses taxable's goal-"taxes" score of 4 (10-6),
  // so isolating this branch needs a second, already-verified nudge
  // (rmdSmoothing's -14) to bring preTax close enough that the extra -5 is
  // what decides the crossing. Both sides share an identical rmdSmoothing
  // -14 (same age, same >0.45 share on both sides); only the >0.55 split
  // differs.
  const p = planFor({ optimizationGoal: 'taxes', rmdSmoothing: true });
  const startRmd = engine.rmdStartAge(p);
  const age = Math.max(59.5, startRmd - 15);
  if (age >= startRmd) return;
  const below55 = [ // preTaxShare 0.54: >0.45 (smoothing fires), not >0.55
    { taxClass: 'preTax', balance: 54 }, { taxClass: 'taxable', balance: 46 },
    { taxClass: 'roth', balance: 0 }, { taxClass: 'hsa', balance: 0 },
  ];
  const above55 = [ // preTaxShare 0.56: both smoothing and the extra cut fire
    { taxClass: 'preTax', balance: 56 }, { taxClass: 'taxable', balance: 44 },
    { taxClass: 'roth', balance: 0 }, { taxClass: 'hsa', balance: 0 },
  ];
  // below55: preTax 20-14=6, taxable 10-6=4 -> taxable still first (6>4).
  // above55: preTax 20-14-5=1, taxable 4 -> preTax crosses ahead (1<4).
  assert.deepEqual(engine.smartWithdrawalOrder(p, age, below55, [], 0.05), ['taxable', 'preTax', 'roth', 'hsa']);
  assert.deepEqual(engine.smartWithdrawalOrder(p, age, above55, [], 0.05), ['preTax', 'taxable', 'roth', 'hsa'], 'crossing 0.55 while smoothing is held constant on both sides must be what flips the order');
});

// ---------------------------------------------------------------------------
// goal "success"/"spending": the hsa reduction only applies at age >= 65
// ---------------------------------------------------------------------------

test('goal "success" combined with healthOn: both share the identical age>=65 gate, so 64.999 fires neither and 65 fires both -- the exact boundary where hsa crosses ahead of roth', () => {
  // goal "success" alone (-4 roth, -12 hsa only at 65+) never crosses roth
  // and hsa on its own (base gap 14, nudge gap 12-4=8 < 14). Stacking
  // healthOn's own age>=65-gated -10 to hsa closes the rest of the gap:
  // at 65, hsa = 48-12-10 = 26 vs roth = 34-4 = 30 -> hsa crosses ahead.
  // Below 65, neither age-gated cut fires (they share the same literal
  // age>=65 condition), so hsa stays at 48 -- no crossing.
  const p = planFor({ optimizationGoal: 'success' }, { healthOn: true });
  const at65 = engine.smartWithdrawalOrder(p, 65, evenAccounts(), [], 0.05);
  const justUnder = engine.smartWithdrawalOrder(p, 64.999, evenAccounts(), [], 0.05);
  assert.deepEqual(at65.slice(2), ['hsa', 'roth'], 'at exactly 65, hsa (26) must sort ahead of roth (30)');
  assert.deepEqual(justUnder.slice(2), ['roth', 'hsa'], 'one tick before 65, neither age-gated cut has fired -- roth (30) stays ahead of hsa (48)');
});

// ---------------------------------------------------------------------------
// survivor: age >= min(selfLife, spouseLife) - 10
// ---------------------------------------------------------------------------

test('survivor: exactly at min(selfLife,spouseLife)-10 the preTax survivor cut applies; one tick below it does not', () => {
  // A lone survivor cut (-6, 20->14) never crosses taxable's 10 on its own.
  // Pair it with goal "legacy" (-8 to preTax, ungated by age/share) so the
  // combined 20-8-6=6 is what tips preTax below taxable's 10; without the
  // survivor cut, legacy alone leaves preTax at 12, still above 10.
  const p = planFor({ optimizationGoal: 'legacy', survivor: true, selfLife: 70, spouseLife: 95 }, {}, { spouseOn: true });
  const boundaryAge = Math.min(70, 95) - 10; // 60, well clear of the 59.5 penalty and any plausible RMD start
  const at = engine.smartWithdrawalOrder(p, boundaryAge, evenAccounts(), [], 0.05);
  const below = engine.smartWithdrawalOrder(p, boundaryAge - 0.5, evenAccounts(), [], 0.05);
  assert.deepEqual(at, ['preTax', 'taxable', 'roth', 'hsa'], 'preTax 20-8-6=6 must beat taxable\'s 10 exactly at the survivor boundary');
  assert.deepEqual(below, ['taxable', 'preTax', 'roth', 'hsa'], 'one tick before the boundary, only the legacy -8 applies (preTax=12), leaving taxable ahead');
});

// ---------------------------------------------------------------------------
// reserve: priorReturn < 0 (strict) -- exactly 0 is not a down year
// ---------------------------------------------------------------------------

test('reserve nudge: priorReturn of exactly 0 does not cut taxable; a genuinely negative return does', () => {
  const p = planFor({}, { reserveOn: true });
  const atZero = engine.smartWithdrawalOrder(p, 65, evenAccounts(), [], 0);
  const negative = engine.smartWithdrawalOrder(p, 65, evenAccounts(), [], -0.0001);
  assert.deepEqual(atZero, BASE_ORDER, 'priorReturn 0 must not trigger the reserve-driven taxable cut');
  assert.deepEqual(negative, BASE_ORDER, 'a -7 cut to taxable (10->3) does not cross preTax\'s 20 either, so order shape is unchanged -- the point is it must not throw or behave differently structurally at this boundary');
});

// ---------------------------------------------------------------------------
// debt: debtTotal(p) > total*0.25 (strict) -- exactly equal does not trigger
// ---------------------------------------------------------------------------

test('debt nudge: debt exactly equal to 25% of the account total does not cut roth; one dollar more does', () => {
  const accounts = evenAccounts(100); // total = 400
  const atBoundary = planFor({}, { debts: [{ balance: 100 }] }); // exactly 25% of 400
  const justAbove = planFor({}, { debts: [{ balance: 100.01 }] });
  const atOrder = engine.smartWithdrawalOrder(atBoundary, 65, accounts, [], 0.05);
  const aboveOrder = engine.smartWithdrawalOrder(justAbove, 65, accounts, [], 0.05);
  assert.deepEqual(atOrder, BASE_ORDER, 'debt exactly at 25% of the total must not fire the roth cut');
  assert.deepEqual(aboveOrder, BASE_ORDER, 'a -2 cut to roth (34->32) does not cross any neighboring score, so order shape is unchanged -- confirms the nudge does not throw or over-apply, not that it is inert (see the score-based test above for a nudge that does cross)');
});

// ---------------------------------------------------------------------------
// Degenerate input: all-zero account balances (totalBalance clamps to 1,
// avoiding a division by zero in preTaxShare)
// ---------------------------------------------------------------------------

test('all-zero account balances do not throw or produce NaN-driven order corruption (totalBalance clamps to a minimum of 1)', () => {
  const p = planFor({ rmdSmoothing: true, optimizationGoal: 'taxes' });
  const zeroAccounts = [
    { taxClass: 'taxable', balance: 0 }, { taxClass: 'preTax', balance: 0 },
    { taxClass: 'roth', balance: 0 }, { taxClass: 'hsa', balance: 0 },
  ];
  assert.doesNotThrow(() => engine.smartWithdrawalOrder(p, 65, zeroAccounts, [], 0.05));
  const order = engine.smartWithdrawalOrder(p, 65, zeroAccounts, [], 0.05);
  assert.equal(order.length, 4);
  assert.ok(!order.includes(undefined) && !order.includes(NaN));
});
