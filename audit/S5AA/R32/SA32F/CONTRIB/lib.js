'use strict';
const h = require('../harness.js');
// A working-year plan: one row per year from `age`, no transfer, zero returns, zero inflation.
function work({ age = 40, years = 1, filing = 'single', salary = 100000, spouseOn = false, spouseAge = 40, spouseSalary = 0, retireAge = 65, accounts = [] } = {}) {
  const p = h.plan({ years });
  Object.assign(p.profile, { age, retireAge, endAge: age + years, spouseOn, spouseAge, filing });
  Object.assign(p.employment, { salary, spouseSalary, growth: 0, contributionStop: retireAge });
  p.advanced.transferOn = false; p.advanced.transferAmount = 0;
  p.accounts = [h.account('cash', 'taxable', 100000, { cashHolding: true, allocation: {} })].concat(accounts);
  return p;
}
function check(p) {
  const v = h.validateScenario(structuredClone(p));
  if (!v.valid) throw new Error('INVALID ' + JSON.stringify(v.issues.filter(x => x.severity === 'ERROR')));
  const r = h.engine.runPlan(p);
  if (r.status !== 'ok') throw new Error('STATUS ' + r.status + ' ' + r.calculationErrorCode);
  return { r, warnings: v.issues.filter(x => x.severity === 'WARNING').map(x => x.code) };
}
module.exports = Object.assign({}, h, { work, check });
// Report one comparison: hand expectation vs engine figure.
let runs = 0;
function report(label, expected, actual) {
  const diff = +(actual - expected).toFixed(2);
  console.log(JSON.stringify({ label, expected, actual, diff, verdict: Math.abs(diff) > 0.005 ? 'MISMATCH' : 'PASS' }));
  return diff;
}
function row(p, i = 1) { const { r, warnings } = check(p); runs++; const x = r.rows[i]; return Object.assign({ warnings, limitWarnings: r.limitWarnings }, x); }
module.exports.report = report; module.exports.row = row; module.exports.runs = () => runs;
