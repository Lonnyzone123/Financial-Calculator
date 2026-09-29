'use strict';
// Shared plan builders for the LIFE-EVENTS audit area. Reads only the frozen tree through the harness.
const h = require('../harness.js');
function couple(o = {}) {
  const p = h.plan({ years: 1, amount: 0 });
  p.advanced.transferOn = false; p.advanced.transferAmount = 0;
  Object.assign(p.profile, { age: 68, spouseAge: 64, spouseOn: true, filing: 'mfj', retireAge: 60, endAge: 90 }, o.profile || {});
  Object.assign(p.employment, { contributionStop: 60 }, o.employment || {});
  Object.assign(p.retirement, { ssBenefit: 0, spouseSS: 0, ssClaim: 67, spouseClaim: 67, ssFra: 67, ssCola: 0, survivor: true,
    survivorSpendingReduction: 0, selfLife: 95, spouseLife: 95, spending: 0, dividendOn: false, dividendYield: 0, pension: 0 }, o.retirement || {});
  Object.assign(p.advanced, o.advanced || {});
  p.accounts = o.accounts || [h.account('cash', 'taxable', 2000000, { cashHolding: true, allocation: {} })];
  if (o.mutate) o.mutate(p);
  return p;
}
function check(p) {
  const v = h.validateScenario(structuredClone(p));
  const errs = v.issues.filter(x => x.severity === 'ERROR');
  return { valid: v.valid, errs };
}
function runRaw(p) { return h.engine.runPlan(structuredClone(p)); }
module.exports = { h, couple, check, runRaw, run: p => h.run(structuredClone(p)) };
