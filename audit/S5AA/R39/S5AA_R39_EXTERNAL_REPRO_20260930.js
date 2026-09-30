'use strict';
// Run at the R39 source or its records merge: node audit/S5AA/R39/S5AA_R39_EXTERNAL_REPRO_20260930.js
// Public runPlan input only; no source or fixture is edited.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const shell = fs.readFileSync(path.join(root, 'src', 'app-shell.html'), 'utf8');
const rules = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
const rawDefault = shell.match(/var defaultPlan=(\{.*?\});/);
assert.ok(rules && rawDefault, 'App rules and default plan exist');
global.RULES = JSON.parse(rules[1]);
require(path.join(root, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(root, 'src', 'engine.js'));
const validator = require(path.join(root, 'src', 'scenario-validator.js'));
const defaults = eval('(' + rawDefault[1] + ')'); // Same extraction as the S5AA witness scripts.

function survivorIncome(plannedClaim, run = engine.runPlan) {
  const p = JSON.parse(JSON.stringify(defaults));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 66.5, spouseAge: 66.5, retireAge: 66.5,
    endAge: 68, spouseOn: true, filing: 'mfj' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0,
    contributionStop: 66.5 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0,
    fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0,
    dividendOn: false, pension: 0, ssBenefit: 2000, ssClaim: plannedClaim,
    spouseSS: 0, spouseClaim: 67, ssCola: 10, survivor: true,
    selfLife: 67.25, spouseLife: 95, stages: [], expenses: [], otherIncomes: [] });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false,
    conversionOn: false, transferOn: false });
  p.accounts = [];
  const validation = validator.validateScenario(p);
  assert.equal(validation.valid, true, JSON.stringify(validation.issues));
  const result = run(p);
  assert.equal(result.status, 'ok', result.status + ' / ' + result.calculationErrorCode);
  const row = result.rows.find(x => Math.abs(x.age - 68) < 1e-9);
  assert.ok(row, 'Age-68 closing row exists');
  return row.income;
}

const claimAt675 = survivorIncome(67.5);
const claimAt68 = survivorIncome(68);
const claimAt69 = survivorIncome(69);
// All three planned claims follow death at 67.25. The survivor's record and
// 67.25-to-68 paid duration are otherwise identical, so the three amounts
// must agree. R39 incorrectly spends the never-reached 67.5 COLA in one case.
assert.deepEqual([claimAt675, claimAt68, claimAt69], [20196, 18360, 18360]);

// Isolate only the R39 PIA pricing change in memory. This is a pre-change
// control, not a file edit or an alternate public entry point for the witness.
const marker = 'var selfPia=ssPiaAt(p,"self",selfClaim>age+1e-9&&selfClaim<rowAge-1e-9?selfClaim:age,startHistory),spousePia=spouseOn?ssPiaAt(p,"spouse",spouseClaimAtSelfAge>age+1e-9&&spouseClaimAtSelfAge<rowAge-1e-9?spouseAge+(spouseClaimAtSelfAge-age):spouseAge,startHistory):0,';
const prior = require(path.join(root, 'tests', 'lib', 'engine-variant.js')).loadEngineVariant([{
  id: 'R39-before-claim-pricing', marker,
  replace: 'var selfPia=ssPiaAt(p,"self",age,startHistory),spousePia=spouseOn?ssPiaAt(p,"spouse",spouseAge,startHistory):0,'
}]);
const prior675 = survivorIncome(67.5, prior.runPlan);
const prior68 = survivorIncome(68, prior.runPlan);
assert.deepEqual([prior675, prior68], [18360, 18360]);
console.log(JSON.stringify({ finding: 'R39-01', source: 'f7ea076f1871d1c83fc4505098601a0cf1f0eae6',
  deathAge: 67.25, current: { claimAt675, claimAt68, claimAt69 },
  preR39Pricing: { claimAt675: prior675, claimAt68: prior68 },
  discrepancy: claimAt675 - claimAt68 }, null, 2));
