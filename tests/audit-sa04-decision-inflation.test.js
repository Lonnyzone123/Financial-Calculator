'use strict';

/**
 * SA-04 (SPRINT_EXTERNAL_AUDIT_20260909.md) -- CURRENT-PERIOD INFLATION
 * CROSSED THE DECISION BOUNDARY.
 *
 * R2-T07 removed the BALANCE lookahead from spending decisions and the
 * audit accepted that repair. But it left a second channel open, and the
 * R2-T07 tests could not see it because they hold inflation constant.
 *
 * `annualInflation` appears in exactly two places in `simulatePlan()`, and
 * they want opposite things:
 *
 *   1. `inflationFactor *= Math.pow(1 + annualInflation, duration)` at the
 *      END of the period. This is ex-post purchasing-power accounting and
 *      SHOULD use the realized figure. (`inflationFactor` was therefore
 *      already correct at decision time: it only ever reflects completed
 *      periods.)
 *   2. the last argument to `strategySpending()`, where `fixedReal`,
 *      `guardrails` and `guyton` compute `priorSpend * (1 + annualInflation)`.
 *      This is a DECISION input, and in historical mode it is that same
 *      period's own not-yet-realized CPI outcome.
 *
 * So the leak is one argument, not the whole inflation model.
 *
 * Audit's independent counterfactual, reproduced below: a two-period
 * historical guardrails plan with nonbinding limits. Hold the entire
 * scenario, all market returns and the first period's results identical, and
 * change ONLY the second period's own historical inflation outcome. Before
 * the repair the second period's decision moved from $40,000 to $44,000 --
 * driven purely by information from inside the period being decided.
 *
 * RESOLUTION (recorded in SPRINT_QUESTIONS.md Q6): the product intends a
 * start-of-period decision, so the lag is fixed rather than documented as an
 * ex-post figure. A decision now uses the LAST OBSERVED CPI change. For
 * `simple` and `monteCarlo` the configured `assumptions.inflation` is an
 * intentionally known forecast input and is preserved exactly -- the
 * mechanism is a one-period lag on OBSERVED data, which for a constant
 * assumption is indistinguishable from the assumption itself. The tests
 * below assert that equivalence rather than assuming it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs');
const defaultPlan = extractDefaultPlan(shell);

function historicalPlan(overrides) {
  overrides = overrides || {};
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.id = 'sa04';
  p.profile.age = 65;
  p.profile.retireAge = 65;
  p.profile.endAge = 68;
  p.profile.spouseOn = false;
  p.employment.salary = 0;
  p.employment.spouseSalary = 0;
  p.assumptions.method = 'historical';
  p.assumptions.historyStart = 1928;
  p.assumptions.fee = 0;
  p.assumptions.withdrawalTiming = 'annual';
  p.retirement.strategy = 'guardrails';
  p.retirement.withdrawalRate = 4;
  p.retirement.flexibility = 0;
  // Guardrails deliberately nonbinding, so the only thing moving spending is
  // the inflation uplift under test.
  p.retirement.upperGuardrail = 1000;
  p.retirement.lowerGuardrail = 1000;
  p.retirement.adjustment = 1; // S5AA R54 item 3 (the owner's decision of 2026-10-04: a value outside the form's range is refused by every route, through src/plan-value-contract.json): the form's minimum, 1 (was 0; the guardrails above never bind, so no figure moves)
  p.retirement.floor = 0;
  p.retirement.ceiling = 1e9;
  p.retirement.ssBenefit = 0;
  p.retirement.spouseSS = 0;
  p.retirement.pension = 0;
  p.retirement.dividendOn = false;
  p.retirement.survivor = false;
  p.retirement.stages = [];
  p.retirement.expenses = [];
  p.retirement.otherIncomes = [];
  p.advanced.rmdOn = false;
  p.advanced.healthOn = false;
  p.advanced.ltcOn = false;
  p.advanced.conversionOn = false;
  p.advanced.transferOn = false;
  p.advanced.reserveOn = false;
  p.advanced.bondTentOn = false;
  p.advanced.assetsOn = false;
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  p.accounts = [{
    id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 1000000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  Object.assign(p.retirement, overrides.retirement || {});
  Object.assign(p.assumptions, overrides.assumptions || {});
  return p;
}

/** Runs the plan with the modeled periods' realized inflation overridden in
 *  an isolated, restored copy of the engine's own historical table. Returns
 *  the per-period rows. `inflations[i]` is the inflation realized DURING
 *  modeled period i+1. */
function runWithInflation(plan, inflations) {
  const saved = engine.HIST_INFLATION.map(function (x) { return x[1]; });
  try {
    const start = engine.historyIndex(plan, 0);
    inflations.forEach(function (v, i) {
      engine.HIST_INFLATION[(start + i) % engine.HIST_INFLATION.length][1] = v;
    });
    return engine.simulatePlan(plan, null, 0, null, null).rows;
  } finally {
    saved.forEach(function (v, i) { engine.HIST_INFLATION[i][1] = v; });
  }
}

test('SA-04 (setup): the counterfactual really is isolated -- changing only period 2\'s inflation leaves period 1 identical', () => {
  const a = runWithInflation(historicalPlan(), [0, 0, 0]);
  const b = runWithInflation(historicalPlan(), [0, 0.10, 0]);
  assert.equal(a[1].spending, b[1].spending, 'period 1 spending must be unaffected');
  assert.equal(a[1].total, b[1].total, 'period 1 ending balance must be identical -- otherwise a divergence later could be wealth, not information');
});

test('SA-04: a period\'s spending decision must NOT move when only that period\'s own inflation outcome changes', () => {
  const flat = runWithInflation(historicalPlan(), [0, 0, 0]);
  const spike = runWithInflation(historicalPlan(), [0, 0.10, 0]);
  assert.equal(spike[2].spending, flat[2].spending,
    'period 2 decided on its own not-yet-realized inflation: $' + flat[2].spending + ' vs $' + spike[2].spending);
});

test('SA-04 POSITIVE CONTROL: a decision MUST still respond to a previously observed inflation outcome', () => {
  // Period 1's inflation is fully observed by the time period 2 is decided,
  // so it must change period 2's uplift. This is what separates "fixed the
  // lag" from "deleted the inflation uplift".
  const flat = runWithInflation(historicalPlan(), [0, 0, 0]);
  const early = runWithInflation(historicalPlan(), [0.10, 0, 0]);
  assert.equal(flat[1].spending, early[1].spending, 'period 1 itself is decided before its own inflation is known');
  assert.ok(early[2].spending > flat[2].spending,
    'period 2 must carry period 1\'s observed 10%: got $' + early[2].spending + ' vs $' + flat[2].spending);
  assert.ok(Math.abs(early[2].spending - flat[2].spending * 1.10) < 1e-6,
    'and it must be exactly one 10% step, not a doubled or missing one: expected $' +
    (flat[2].spending * 1.10) + ', got $' + early[2].spending);
});

test('SA-04: the lag applies to fixedReal as well as guardrails -- both take the same uplift path', () => {
  const plan = historicalPlan({ retirement: { strategy: 'fixedReal' } });
  const flat = runWithInflation(plan, [0, 0, 0]);
  const spike = runWithInflation(plan, [0, 0.10, 0]);
  assert.equal(spike[2].spending, flat[2].spending,
    'fixedReal period 2 saw its own inflation: $' + flat[2].spending + ' vs $' + spike[2].spending);
  const early = runWithInflation(plan, [0.10, 0, 0]);
  assert.ok(Math.abs(early[2].spending - flat[2].spending * 1.10) < 1e-6,
    'and must still carry the previously observed step');
});

test('SA-04: end-of-period purchasing-power accounting still uses the REALIZED figure, not the lagged one', () => {
  // inflationFactor is deliberately untouched: it is ex-post accounting.
  // A 10% realized inflation in period 2 must still deflate period 2's real
  // total, even though it no longer feeds period 2's decision.
  const flat = runWithInflation(historicalPlan(), [0, 0, 0]);
  const spike = runWithInflation(historicalPlan(), [0, 0.10, 0]);
  assert.equal(spike[2].total, flat[2].total, 'nominal totals are unaffected by inflation');
  assert.ok(spike[2].realTotal < flat[2].realTotal,
    'the realized inflation must still reduce real purchasing power: ' + spike[2].realTotal + ' vs ' + flat[2].realTotal);
  assert.ok(Math.abs(spike[2].realTotal - flat[2].realTotal / 1.10) < 1e-6,
    'by exactly the realized amount');
});

test('SA-04: a configured forecast assumption is an intentionally KNOWN input and is preserved exactly', () => {
  // For simple/monteCarlo, assumptions.inflation is constant, so a one-period
  // lag on observed data is indistinguishable from the assumption itself.
  // Asserted against a closed form rather than assumed.
  for (const method of ['simple', 'monteCarlo']) {
    const p = historicalPlan();
    p.assumptions.method = method;
    p.assumptions.inflation = 4;
    p.assumptions.returnRate = 0;
    p.assumptions.volatility = 0;
    p.retirement.strategy = 'fixedReal';
    const rows = engine.simulatePlan(p, function () { return 0.5; }, 0, null, null).rows;
    assert.ok(Math.abs(rows[2].spending - rows[1].spending * 1.04) < 1e-6,
      method + ': the configured 4% forecast must still be applied between periods; got $' +
      rows[1].spending + ' then $' + rows[2].spending);
  }
});
