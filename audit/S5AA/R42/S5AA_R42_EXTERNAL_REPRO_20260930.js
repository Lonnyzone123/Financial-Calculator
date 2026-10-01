'use strict';
/* Read-only R42-01 witness. Run from the repository root:
   node audit/S5AA/R42/S5AA_R42_EXTERNAL_REPRO_20260930.js
   The R41 engine is compiled in memory from its tag; no source file is changed. */
const assert = require('node:assert/strict');
const child = require('node:child_process');
const Module = require('node:module');
const path = require('node:path');
const L = require('../R40/S5AA_R40_CONSERVATION_GRID/lib.js');

const engineFile = path.resolve('src/engine.js');
const r41Module = new Module(engineFile + '#r41', module);
r41Module.filename = engineFile;
r41Module.paths = Module._nodeModulePaths(path.dirname(engineFile));
r41Module._compile(child.execFileSync('git', ['show', 's5aa-r41-source:src/engine.js'], { encoding: 'utf8' }), engineFile);

function plan(spouseClaim) {
  const p = L.basePlan({ couple: true, age: 62, spouseAge: 67, retireAge: 63,
    endAge: 68, salary: 45000, spouseSalary: 0, spending: 0, returnRate: 0,
    inflation: 0, ssBenefit: 3000, spouseSS: 0,
    accounts: [L.account('cash', 'taxable', 2000000, { basisPct: 100 })] });
  Object.assign(p.retirement, { ssClaim: 62, spouseClaim, ssCola: 0,
    survivor: false, selfLife: 120, spouseLife: 120 });
  p.employment.contributionStop = 63;
  p.advanced.healthOn = false;
  return p;
}
function run(engine, spouseClaim) {
  const p = plan(spouseClaim);
  assert.equal(L.h.validateScenario(structuredClone(p)).valid, true);
  const r = engine.runPlan(structuredClone(p));
  assert.equal(r.status, 'ok');
  return { claimYear: r.rows.find(x => x.age === 63).income,
    postFraYear: r.rows.find(x => x.age === 68).income };
}

const beforeHalf = run(r41Module.exports, 67.5);
const afterHalf = run(L.h.engine, 67.5);
const beforeLater = run(r41Module.exports, 68);
const afterLater = run(L.h.engine, 68);
console.log(JSON.stringify({ beforeHalf, afterHalf, beforeLater, afterLater }, null, 2));
assert.equal(beforeHalf.postFraYear, 43944);
assert.equal(afterHalf.claimYear, 68940);
assert.equal(afterHalf.postFraYear, 43800);
assert.equal(beforeLater.postFraYear, 43944);
assert.equal(afterLater.postFraYear, 43944);
