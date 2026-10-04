'use strict';

/*
 * S4 task 4.5 -- a Monte Carlo scenario that can actually fail.
 *
 * Volatility only expresses itself through failure, so a Monte Carlo corpus in
 * which everything succeeds is blind to every defect in the risk model. The
 * golden Monte Carlo plan succeeds 99.8% at this commit; a volatility defect
 * could move it by almost nothing and read as noise.
 *
 * expansion:monte-carlo-sensitive-band (tests/lib/corpus-expansion.js) sits in
 * the band where the statistic can move. It was chosen by a rule DECLARED
 * BEFORE MEASURING -- the golden plan, same seed and path count, spending
 * scaled up a 5% grid, the first step in [50, 85] -- and added as a new
 * scenario, never by re-tuning the golden one. This file holds all three
 * claims: that it is that rule's choice, that it is in band, and that it
 * RESPONDS to a risk input. A scenario that does not respond has not closed
 * the gap -- the check CL-07 was missing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require('../tools/capture-baseline.js').installDebtModules();
const engine = require('../src/engine.js');
const golden = require('./lib/golden-scenario-defs.js');
const expansion = require('./lib/corpus-expansion.js');

const DEFAULT_PLAN = golden.extractDefaultPlan(SHELL);
const BAND = [50, 85];
/* S5AA R9 round, decision 8: the rule re-applied after the projection began stopping at the last death -- step 24 rose to
   85.6%, and step 25 is the first in band (tests/lib/corpus-expansion.js, family version 2). The rule and the band are
   unchanged.
   S5AA R18 round, workstream B (taxable basis in dollars): the rule re-applied again -- step 24 fell to 84.8% and step 23
   is 85.6%, so step 24 is the first in band (family version 3). The rule and the band are unchanged.
   S5AA R34 (Social Security by law; the today's-dollar COLA up to the claim raises income): step 24 rose to 86.6% and step 25
   is 85.8%, so step 26 (84.8%) is the first in band (family version 4). The rule and the band are unchanged.
   S5AA R35 (R32V-01: the flexibility cut reads the portfolio's balance-weighted return): step 26 rose to 85.2%, so step 27
   (84.4%) is the first in band (family version 5). The rule and the band are unchanged.
   S5AA R36 (SA32F-D1: later years' tax figures index with inflation): step 31 is 85.6%, so step 32 (85.0%) is the first in band
   (family version 6). The rule and the band are unchanged.
   S5AA R43 (SA42F-31: each Monte Carlo path has its own seeds; seed + 2i let neighbouring seeds share paths): step 30 is 85.6%, so step
   31 (84.6%) is the first in band (family version 7). The rule and the band are unchanged.
   S5AA R46 (the owner's AA1 decision on MC-A: one set of market shocks per year shared by every account): the golden plan's accounts
   no longer diversify one another, so success falls along the whole grid (the golden plan 96.8%, step 13 85.2%), and step 14 (84.2%)
   is the first in band (family version 8). The rule and the band are unchanged. */
const DECLARED_STEP = 14;
const clone = (v) => JSON.parse(JSON.stringify(v));

const goldenPlan = () => {
  const def = golden.GOLDEN_SCENARIOS.find(([name]) => name === 'monte-carlo-fixed-seed');
  return golden.buildScenario(DEFAULT_PLAN, def[1] || {});
};
const member = () => expansion.expansionScenarios(DEFAULT_PLAN).find((e) => e.name === 'expansion:monte-carlo-sensitive-band').plan;
const atStep = (plan, step) => {
  const p = clone(plan);
  p.retirement.spending = Math.round(plan.retirement.spending * (1 + 0.05 * step) * 100) / 100;
  return p;
};
const success = (plan) => engine.runPlan(clone(plan)).successRate;

test('4.5: the member is the golden Monte Carlo plan with ONLY spending changed, by the declared step', () => {
  const g = goldenPlan();
  const m = member();
  assert.equal(m.assumptions.method, 'monteCarlo');
  assert.deepEqual(m, atStep(g, DECLARED_STEP), 'every field but spending is the golden plan\'s, and spending is golden x (1 + 0.05 x ' + DECLARED_STEP + ')');
  assert.equal(m.assumptions.seed, g.assumptions.seed, 'no seed tuning');
  assert.equal(m.assumptions.runs, g.assumptions.runs);
  assert.equal((m.advanced.otherAssets || []).length + (m.advanced.debts || []).length, 0, 'no other assets or debts, so S3-08 cannot arise');
});

test('4.5: it is the FIRST step of the declared grid inside the band -- the step before it is not, and the golden plan is saturated', () => {
  const g = goldenPlan();
  const chosen = success(member());
  assert.ok(chosen >= BAND[0] && chosen <= BAND[1], 'the member must sit in the sensitive band: ' + chosen + '%');
  /* Success falls monotonically along the grid (measured over steps 1-24 at d3dc52a, 20-30 at the R9 round), so
     the boundary pair is what makes the declared step the first in band. */
  const before = success(atStep(g, DECLARED_STEP - 1));
  assert.ok(before > BAND[1], 'step ' + (DECLARED_STEP - 1) + ' must still be above the band, or step ' + DECLARED_STEP + ' is not the first: ' + before + '%');
  const saturated = success(g);
  assert.ok(saturated > 95, 'the golden plan itself is saturated, which is the gap: ' + saturated + '%');
});

test('4.5: a risk input moves the member through the band, and moves the saturated golden plan far less', () => {
  const sweep = (plan) => [0.5, 1, 1.5].map((f) => {
    const p = clone(plan);
    p.assumptions.volatility = Math.round(plan.assumptions.volatility * f * 100) / 100;
    return success(p);
  });
  const range = (xs) => Math.max(...xs) - Math.min(...xs);
  const m = sweep(member());
  const g = sweep(goldenPlan());
  assert.ok(m[0] > m[1] && m[1] > m[2], 'more volatility must mean less success for the member: ' + m.join(' / '));
  assert.ok(range(m) >= 20, 'the member must respond by at least 20 percentage points across the sweep: ' + range(m).toFixed(1));
  assert.ok(range(m) > range(g), 'and respond more than the saturated golden plan: ' + range(m).toFixed(1) + ' vs ' + range(g).toFixed(1));
});
