'use strict';
const h = require('../harness.js');
// SOCSEC builder: retired-ish plan, zero everything, big cash so nothing runs out.
function plan(o = {}) {
  const p = h.grid.basePlan(Object.assign({ spending: 0, accounts: [h.grid.account('brok', 'taxable', 5000000, { basisPct: 100 })] }, o));
  Object.assign(p.retirement, { ssCola: 0, survivor: false, selfLife: 120, spouseLife: 120 }, o.ret || {});
  if (o.profile) Object.assign(p.profile, o.profile);
  if (o.employment) Object.assign(p.employment, o.employment);
  return p;
}
function run(p, quiet) {
  const v = h.validateScenario(structuredClone(p));
  const errs = v.issues.filter(x => x.severity === 'ERROR');
  const r = h.engine.runPlan(structuredClone(p));
  if (!quiet) { if (!v.valid) console.log('INVALID', JSON.stringify(errs)); if (r.status !== 'ok') console.log('STATUS', r.status, r.calculationErrorCode); }
  r._valid = v.valid; r._verrs = errs; r._vissues = v.issues;
  return r;
}
function ssRows(r, keys = ['socialSecurity']) {
  return r.rows.map(x => { const o = { age: x.age }; keys.forEach(k => o[k] = x[k]); return o; });
}
module.exports = { h, plan, run, ssRows };
