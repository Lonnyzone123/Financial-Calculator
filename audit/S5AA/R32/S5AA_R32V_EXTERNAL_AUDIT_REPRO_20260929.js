'use strict';
// External R32V probes. Inputs use the published builders; expectations below are independent.
// Run from this checkout: node --expose-internals audit/S5AA/R32/S5AA_R32V_EXTERNAL_AUDIT_REPRO_20260929.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const h = require('./SA32F/harness.js');
const L = require('./SA32F/FLOWS/lib.js');
const ref = require('./SA32F/TAX-FED/ref.js');
const results = [];
function record(id, expected, actual, note) {
  assert.ok(Number.isFinite(expected) && Number.isFinite(actual), id + ': finite figures required');
  results.push({id, expected, actual, difference: actual - expected, note});
}
function run(p) {
  const v = h.validateScenario(structuredClone(p));
  assert.equal(v.valid, true, JSON.stringify(v.issues));
  const r = h.engine.runPlan(structuredClone(p));
  assert.equal(r.status, 'ok', JSON.stringify(r.issues));
  return r;
}
// R32V-01: deterministic asset returns are -10%; the unused flat return is +10%.
const p = L.basePlan({age:70, endAge:73, returnRate:10, spending:40000, flexibility:10,
  accounts:[L.account('r', 'rothIRA', 1000000)]});
p.advanced.assetClasses[0].returnRate = -10;
const a = run(p);
assert.ok(a.rows[1].total < 1000000 - 40000, 'first period must be a market loss');
record('R32V-01 asset loss, positive headline return', 36000, a.rows[2].spending,
  '40,000 x (1 - 10%) after the preceding portfolio loss');
const matched = structuredClone(p); matched.assumptions.returnRate = -10;
const b = run(matched);
assert.equal(b.rows[1].total, a.rows[1].total, 'identical first-period assets');
record('R32V-01 control: align headline return', 36000, b.rows[2].spending, 'control is the same portfolio return');
const upside = structuredClone(p); upside.advanced.assetClasses[0].returnRate = 10;
upside.assumptions.returnRate = -10;
record('R32V-01 asset gain, negative headline return', 40000, run(upside).rows[2].spending,
  'no down-year cut follows the preceding positive portfolio return');
// R32V-02: the 8,073-return reference shares SA32F-34.
const taxPlan = {profile:{filing:'single', age:70, spouseOn:false}, retirement:{selfLife:110}};
const engineCarry = h.engine.estimateTaxes(taxPlan,70,20000,0,0,0,0,0,0,0,0,10000).capitalLossCarryOut;
const referenceCarry = ref.federal({f:'single', ages:[70,-1], ordinary:20000, carry:10000}).carryOut;
const negativeTI = 17000 - (16100 + 2050 + 6000);
const adjustedTI = negativeTI + 3000 + 6000; // IRC 1212(b)(2)(B), including section 151
const correctCarry = 10000 - Math.min(3000, Math.max(0, adjustedTI));
assert.equal(correctCarry,8150);
record('R32V-02 engine carry',correctCarry,engineCarry,'SA32F-34, independently calculated');
record('R32V-02 published reference carry',correctCarry,referenceCarry,'a matching reference is not an independent legal check');
assert.equal(engineCarry,referenceCarry);
// R32V-03: advanced AIME calculation does not truncate PIA to a dime.
// SSA's own 2026 example: AIME 5,825, bend points 1,286 and 7,749.
const s = L.basePlan({age:67,endAge:68,spending:0,accounts:[L.account('cash','taxable',100000,{cashHolding:true})]});
Object.assign(s.retirement,{ssAdvanced:true,aime:5825,ssBenefit:0,ssClaim:67,ssFra:67,ssCola:0});
const rawPIA = .9*1286 + .32*(5825-1286);
assert.ok(Math.abs(rawPIA-2609.88)<1e-8);
const roundedPIA = Math.floor((rawPIA+1e-9)*10)/10;
record('R32V-03 PIA rounding only',roundedPIA*12,h.engine.ssaBenefitAtClaim(s,'self',0,67),
  '2,609.88 -> statutory PIA 2,609.80; excludes final payment-dollar rounding');
record('R32V-03 final no-deduction monthly payment',Math.floor(roundedPIA)*12,run(s).rows[1].income,
  'SSA final monthly payment rounds down to a dollar when there are no Medicare deductions');
// Reproduction metadata: hash only checked-in source, no personal paths or IDs.
const sourceFiles = ['src/engine.js','src/scenario-validator.js','src/app-shell.html'];
const sourceHashes = sourceFiles.filter(f=>fs.existsSync(path.join(root,f))).map(f=>({file:f,
  sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')}));
console.log(JSON.stringify({node:process.version,platform:process.platform,osRelease:require('node:os').release(),sourceHashes,results},null,2));
console.log('R32V probes completed; mismatches are audit evidence, not passing financial expectations.');


