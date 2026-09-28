/* S5AA, after the R9 round: VPW AND THE RMD-STYLE STRATEGY SPREAD THE PORTFOLIO OVER THE YEARS THE PROJECTION MODELS
 * (fifth internal audit, finding 1; the owner's decision of 2026-09-22, on Claude's recommendation).
 *
 * The app describes VPW as using the "remaining lifetime" and the RMD-style strategy as dividing the balance "over
 * remaining modeled years". Both divided by the years to profile.endAge. Since decision 8 the projection stops at the
 * last death, so where a lifespan ends before endAge they paced spending for years the plan never models. MEASURED at
 * bd8c922: one person retiring at 65, lifespan 80, horizon 100 -- VPW spent for 35 years of which the plan models 16, and
 * most of the portfolio was left at death. Their horizon is now the projection's own last row: the first row opening at
 * which nobody is alive (the cut decision 8 made), or endAge when that comes first. So such a plan spends exactly as the
 * same plan with endAge set to that last row. Strategies that do not read a horizon are unchanged. Tested through
 * runPlan only.
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
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

function run({ strategy, endAge = 100, selfLife = 80, spouseLife = null, method = 'simple' }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  const spouse = spouseLife !== null;
  Object.assign(p.profile, { age: 65, retireAge: 65, endAge, spouseOn: spouse, spouseAge: 65, filing: spouse ? 'mfj' : 'single' });
  Object.assign(p.assumptions, { method, returnRate: 6, inflation: 2, fee: 0, volatility: 10, runs: 50, seed: 11 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, { strategy, spending: 20000, withdrawalRate: 4, vpwMinRate: 0, vpwMaxRate: 100, rmdFloor: 0, rmdMultiplier: 100,
    ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [], otherIncomes: [], selfLife, spouseLife: spouse ? spouseLife : 95, survivor: false });
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
  p.accounts = [{ id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 1000000, basisPct: 100, contribution: 0, priority: 1 }];
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const spend = (r) => r.rows.map((x) => [x.age, Math.round(Number(x.spending) * 100) / 100]);

for (const strategy of ['vpw', 'rmd']) {
  test('fifth audit, finding 1: ' + strategy + ' with a lifespan of 80 against a horizon of 100 spends as the plan whose horizon is its last row', () => {
    const cut = run({ strategy });
    assert.equal(cut.rows[cut.rows.length - 1].age, 81, 'decision 8: the row opening at 80 is the last');
    assert.deepEqual(spend(cut), spend(run({ strategy, endAge: 81 })));
  });
}

test('fifth audit, finding 1: a couple -- the horizon is the SECOND death', () => {
  assert.deepEqual(spend(run({ strategy: 'vpw', selfLife: 80, spouseLife: 88 })), spend(run({ strategy: 'vpw', selfLife: 80, spouseLife: 88, endAge: 89 })));
});

test('fifth audit, finding 1: Monte Carlo paths use the same horizon', () => {
  const a = run({ strategy: 'vpw', method: 'monteCarlo' }), b = run({ strategy: 'vpw', method: 'monteCarlo', endAge: 81 });
  assert.equal(a.successRate, b.successRate);
  assert.deepEqual(spend(a), spend(b));
});

test('fifth audit, finding 1, control: a horizon that ends before the last death paces to the horizon, as before', () => {
  assert.deepEqual(spend(run({ strategy: 'vpw', selfLife: 99, endAge: 90 })), spend(run({ strategy: 'vpw', selfLife: 100, endAge: 90 })));
});

test('fifth audit, finding 1, control: a strategy that reads no horizon is unchanged', () => {
  const a = run({ strategy: 'constantPercent' }), b = run({ strategy: 'constantPercent', endAge: 81 });
  assert.deepEqual(spend(a), spend(b));
});
