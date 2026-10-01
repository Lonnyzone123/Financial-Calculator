'use strict';
const h = require('../harness.js');
const acct = h.grid.account;
// A working-years plan: zero return/inflation/spending; person works until retireAge.
function work(o = {}) {
  const p = h.grid.basePlan(Object.assign({ spending: 0 }, o));
  p.profile.retireAge = o.retireAge ?? 65;
  p.profile.endAge = o.endAge ?? ((o.age ?? 45) + 3);
  p.employment.contributionStop = o.stop ?? p.profile.retireAge;
  p.employment.growth = o.growth ?? 0;
  if (o.selfLife !== undefined) p.retirement.selfLife = o.selfLife;
  if (o.spouseLife !== undefined) p.retirement.spouseLife = o.spouseLife;
  if (o.filing) p.profile.filing = o.filing;
  if (o.policy) p.limitPolicy = o.policy;
  return p;
}
function run(p, quiet) {
  const v = h.validateScenario(structuredClone(p));
  const errs = v.issues.filter(x => x.severity === 'ERROR');
  const r = h.engine.runPlan(structuredClone(p));
  if (!quiet) console.log('valid', v.valid, errs.map(e => e.code + ':' + (e.path || '')).join(','), 'status', r.status, r.calculationErrorCode || '');
  return { v, r };
}
function bal(r, i) { const row = r.rows[i]; return { age: row.age, preTax: row.preTax, roth: row.roth, taxable: row.taxable, hsa: row.hsa, contributions: row.contributions, agi: row.federalAgi, taxes: row.taxes, income: row.income }; }
module.exports = { h, acct, work, run, bal };
