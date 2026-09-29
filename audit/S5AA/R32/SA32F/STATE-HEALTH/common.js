'use strict';
// Shared builders for the STATE-HEALTH audit area. Reads only the frozen tree through the audit harness.
const h = require('../harness.js');

// A flat, zero-return, zero-inflation plan. Income comes from other-income streams so MAGI is exact.
function base({ age = 60, endAge = 63, retireAge = 60, filing = 'single', spouseOn = false, spouseAge = 60,
  selfLife = 100, spouseLife = 100 } = {}) {
  const p = h.plan({ years: 1, amount: 0 });
  p.advanced.transferOn = false;
  Object.assign(p.profile, { age, retireAge, endAge, spouseOn, spouseAge, filing });
  Object.assign(p.retirement, { selfLife, spouseLife, spending: 0, pension: 0, ssBenefit: 0, spouseSS: 0, irmaaGuard: false });
  Object.assign(p.employment, { contributionStop: 101 });
  p.accounts = [h.account('cash', 'taxable', 1000000, { cashHolding: true, allocation: {} })];
  return p;
}
function income(p, type, amount, owner = 'self', start = 0, end = 100) {
  p.retirement.otherIncomes.push({ name: type + '-' + owner + '-' + p.retirement.otherIncomes.length, type, owner,
    amount, start, end, growth: 0, growthMode: 'fixed' });
}
function check(p) {
  const v = h.validateScenario(structuredClone(p));
  const errs = v.issues.filter(x => x.severity === 'ERROR');
  if (!v.valid) throw new Error('INVALID ' + JSON.stringify(errs));
  const r = h.engine.runPlan(structuredClone(p));
  if (r.status !== 'ok') throw new Error('STATUS ' + r.status + ' ' + r.calculationErrorCode + ' ' + JSON.stringify((r.issues || []).filter(x => x.severity === 'ERROR')));
  return r;
}
function row(r, age) { return r.rows.find(x => Math.abs(x.age - age) < 1e-9); }
let fails = 0, passes = 0;
function cmp(label, actual, expected, tol = 0.005) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  ok ? passes++ : fails++;
  console.log((ok ? 'MATCH    ' : 'MISMATCH ') + label + ' | expected ' + expected.toFixed(2) + ' | engine ' +
    (Number.isFinite(actual) ? actual.toFixed(2) : String(actual)) + ' | diff ' + (Number.isFinite(actual) ? (actual - expected).toFixed(2) : 'n/a'));
  return ok;
}
function summary(note) { console.log('SUMMARY matches=' + passes + ' mismatches=' + fails + (note ? ' | ' + note : '')); }
module.exports = { h, base, income, check, row, cmp, summary };
