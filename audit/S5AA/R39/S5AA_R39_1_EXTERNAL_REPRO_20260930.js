'use strict';
// Run at s5aa-r39.1-source or its records merge:
// node audit/S5AA/R39/S5AA_R39_1_EXTERNAL_REPRO_20260930.js
// Independent public runPlan boundary witness; reads source and changes no file.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const shell = fs.readFileSync(path.join(root, 'src', 'app-shell.html'), 'utf8');
const ruleText = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
const defaultText = shell.match(/var defaultPlan=(\{.*?\});/);
assert.ok(ruleText && defaultText, 'App rules and default plan exist');
global.RULES = JSON.parse(ruleText[1]);
require(path.join(root, 'tools', 'capture-baseline.js')).installDebtModules();
const { runPlan } = require(path.join(root, 'src', 'engine.js'));
const { validateScenario } = require(path.join(root, 'src', 'scenario-validator.js'));
const defaults = eval('(' + defaultText[1] + ')'); // App's actual default, same extraction as prior witnesses.

function incomeAt68(profile, retirement) {
  const p = JSON.parse(JSON.stringify(defaults));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 66.5, spouseAge: 66.5, retireAge: 66.5,
    endAge: 68, spouseOn: true, filing: 'mfj' }, profile);
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0,
    contributionStop: 66.5 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0,
    fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0,
    dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    ssClaim: 67, spouseClaim: 67, ssCola: 10, survivor: true,
    selfLife: 95, spouseLife: 95, stages: [], expenses: [], otherIncomes: [] }, retirement);
  Object.assign(p.advanced, { rmdOn: false, healthOn: false,
    conversionOn: false, transferOn: false });
  p.accounts = [];
  const v = validateScenario(p);
  assert.equal(v.valid, true, JSON.stringify(v.issues));
  const r = runPlan(p);
  assert.equal(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  const row = r.rows.find(x => Math.abs(x.age - 68) < 1e-9);
  assert.ok(row, 'Age-68 closing row exists');
  return row.income;
}

const original = [67.5, 68, 69].map(ssClaim => incomeAt68({},
  { ssBenefit: 2000, ssClaim, selfLife: 67.25 }));
assert.deepEqual(original, [18360, 18360, 18360]);
const mirrored = [67.5, 68].map(spouseClaim => incomeAt68({},
  { spouseSS: 2000, spouseClaim, spouseLife: 67.25 }));
assert.deepEqual(mirrored, [18360, 18360]);

// Death is exactly at the scheduled claim. Entitlement has not started.
// Six survivor months; PIA 2,000 x (1 + six DRC months x 2/3%) = 2,080.
const atDeath = [67.5, 68].map(ssClaim => incomeAt68({},
  { ssBenefit: 2000, ssClaim, selfLife: 67.5 }));
assert.deepEqual(atDeath, [12480, 12480]);

// Spouse is one year younger. Their death at own age 66.25 is self age
// 67.25; an own-age claim at 66.5 would occur inside this self row but
// after death. Survivor is past FRA 67: 2,000 x nine months = 18,000.
const ageGap = [66.5, 67].map(spouseClaim => incomeAt68(
  { spouseAge: 65.5 }, { spouseSS: 2000, spouseClaim, spouseLife: 66.25 }));
assert.deepEqual(ageGap, [18000, 18000]);

// A claim actually reached alive at 67.5 retains R39's COLA pricing:
// 2,000 x 1.10 x 1.04 = 2,288 for six paid months.
const aliveClaim = incomeAt68({ spouseOn: false, filing: 'single' },
  { ssBenefit: 2000, ssClaim: 67.5, survivor: false });
assert.equal(aliveClaim, 13728);
console.log(JSON.stringify({ source: 'a2ee714ff5a3d32fd14ac4b1f0fcbfedeed8d5fd',
  original, mirrored, atDeath, ageGap, aliveClaim }, null, 2));
