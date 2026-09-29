// S5AA R32 self-audit sweep: an IRA rolls only its taxable money into a 401(k), measured across every IRA of the owner on the
// transfer date (R30A-01 with R31-01). Expectations are written from the rule (IRC 408(d)(3)(A)(ii) and (H)), never read from the
// engine. The plan is ChatGPT's basisPlan() (audit/S5AA/R29/S5AA_R29_EXTERNAL_AUDIT_REPRO_20260928.js) with ChatGPT's R31 second
// IRA (audit/S5AA/R31/S5AA_R31_EXTERNAL_AUDIT_REPRO_20260929.js), sending $8,600 to the 401(k) instead of an HSA.
//   node audit/S5AA/R32/S5AA_R32_SELF_AUDIT_ROLLOVER_SWEEP.js [another checkout]
'use strict';
const path = require('path');
const assert = require('assert');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..'));
const h = require(path.join(ROOT, 'audit/S5AA/R29/S5AA_R29_EXTERNAL_AUDIT_REPRO_20260928.js'));
const engine = require(path.join(ROOT, 'src/engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src/scenario-validator.js'));

function plan(x) {
  const p = h.basisPlan();
  p.assumptions.returnRate = x.sourceRate;
  p.advanced.assetClasses = [{ id: 'flat', name: 'Source', returnRate: x.sourceRate, volatility: 0 },
    { id: 'second', name: 'Second IRA', returnRate: x.secondRate, volatility: 0 }];
  Object.assign(p.advanced, { transferTo: 'work', transferAmount: 8600, transferAge: x.at });
  p.accounts.push(h.account('secondIRA', 'traditionalIRA', x.opening, { allocation: { second: 100 }, priority: 3 }));
  return p;
}
/* The rule: on the date the owner's pool is both IRAs at their own rates; its taxable value is the pool less the $8,600 of basis;
   the 401(k) takes at most that, and at most what the source holds. The basis stays in the IRAs. The drain at 62.5 empties both
   IRAs (taxable above the basis) and the 401(k) (all taxable). */
function expected(x) {
  const g = 1 + x.sourceRate / 100, o = 1 + x.secondRate / 100, f = x.at - 61;
  const source = 8600 * Math.pow(g, 1 + f), pool = source + x.opening * Math.pow(o, 1 + f);
  const moved = Math.min(8600, Math.max(0, pool - 8600), source);
  const ira = (8600 * g * g - moved * Math.pow(g, 1 - f) + 2000) * Math.sqrt(g) + x.opening * Math.pow(o, 2.5);
  const work = 1000 * Math.pow(g, 2.5) + moved * Math.pow(g, 1.5 - f);
  return { moved, agi: 30000 + Math.max(0, ira - 8600) + work - 2000 };
}
let plans = 0;
const problems = [];
for (const sourceRate of [-10, 0, 10]) for (const secondRate of [-20, 0, 20]) for (const opening of [0, 2000, 20000])
for (const at of [61, 61.25, 61.75]) {
  const x = { sourceRate, secondRate, opening, at }, p = plan(x);
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok');
  plans++;
  const e = expected(x), row = r.rows[r.rows.length - 1];
  if (!(Math.abs(row.federalAgi - e.agi) < 0.01)) problems.push(JSON.stringify(x) + ': AGI ' + row.federalAgi + ' against ' + e.agi + ' (moved ' + e.moved.toFixed(2) + ')');
}
console.log(JSON.stringify({ plans, checks: plans, problems: problems.length }));
problems.slice(0, 20).forEach((x) => console.log('  ' + x));
console.log(problems.length ? 'SWEEP FAILED' : 'SWEEP PASSED');
process.exitCode = problems.length ? 1 : 0;
