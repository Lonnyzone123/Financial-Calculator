'use strict';
// FLOWS R42F probe helpers: plan builder (the R40 grid's), a strict runner, a row printer and a hand-compare.
const h = require('../harness.js');
const G = h.grid;
function plan(o) { return G.basePlan(o); }
const account = G.account;
function run(p, { allowNotOk = false } = {}) {
  const v = h.validateScenario(structuredClone(p));
  const errs = v.issues.filter(x => x.severity === 'ERROR');
  if (!v.valid) throw new Error('INVALID: ' + JSON.stringify(errs));
  const r = h.engine.runPlan(structuredClone(p));
  if (!allowNotOk && r.status !== 'ok') throw new Error('status ' + r.status + ' ' + r.calculationErrorCode);
  r._warn = v.issues.filter(x => x.severity !== 'ERROR').map(x => x.code);
  return r;
}
const F = ['age', 'total', 'income', 'spending', 'withdrawals', 'dividends', 'taxes', 'shortfall', 'inflationFactor', 'realTotal', 'taxable', 'preTax', 'roth'];
function rows(r, fields = F) {
  return r.rows.map(x => fields.map(f => f + '=' + (typeof x[f] === 'number' ? Math.round(x[f] * 100) / 100 : x[f])).join(' '));
}
let fails = 0, passes = 0;
function cmp(label, actual, expected, tol = 0.01) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  if (ok) passes++; else fails++;
  console.log((ok ? 'PASS ' : 'MISMATCH ') + label + ' expected=' + (Math.round(expected * 100) / 100) + ' actual=' + (Math.round(actual * 100) / 100));
  return ok;
}
function summary() { console.log(`== ${passes} pass, ${fails} mismatch`); }
module.exports = { h, plan, account, run, rows, cmp, summary, G };
