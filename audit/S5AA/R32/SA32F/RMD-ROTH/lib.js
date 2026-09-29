'use strict';
// Shared builder for the RMD-ROTH area. Reads only the frozen tree through the audit harness.
const h = require('../harness.js');
const classes = { taxable: 'taxable', traditionalIRA: 'preTax', traditional401k: 'preTax', rothIRA: 'roth', roth401k: 'roth', hsa: 'hsa', customTraditional: 'preTax', customRoth: 'roth' };

function acct(id, type, balance, extra = {}) {
  return h.account(id, type, balance, Object.assign({ taxClass: classes[type] }, extra));
}

// A retired household, zero returns, zero inflation, no spending, manual order.
function plan({ age = 75, endAge, spouseOn = false, spouseAge, filing, accounts = [], rmdOn = true, qcd = 0,
  conversionOn = false, conversionAmount = 0, spending = 0, retireAge, order = 'taxable,preTax,roth,hsa', cash = 0 } = {}) {
  const p = h.plan({ years: 1 });
  Object.assign(p.profile, { age, retireAge: retireAge === undefined ? Math.min(age, 60) : retireAge,
    endAge: endAge === undefined ? age + 1 : endAge, spouseOn, filing: filing || (spouseOn ? 'mfj' : 'single'),
    spouseAge: spouseAge === undefined ? age : spouseAge });
  Object.assign(p.employment, { contributionStop: Math.min(age, 60) });
  Object.assign(p.retirement, { spending, manualOrder: order, dividendOn: false, selfLife: 120, spouseLife: 120 });
  Object.assign(p.advanced, { rmdOn, qcd, conversionOn, conversionAmount, transferOn: false, transferFrom: '', transferTo: '',
    transferAmount: 0, surplusPolicy: 'retain', surplusPolicyBySource: {} });
  p.accounts = [acct('cash', 'taxable', cash, { cashHolding: true, allocation: {}, priority: 0 })].concat(accounts);
  return p;
}

function check(p) {
  const v = h.validateScenario(structuredClone(p));
  if (!v.valid) throw new Error('INVALID: ' + JSON.stringify(v.issues.filter(x => x.severity === 'ERROR')));
  const r = h.engine.runPlan(structuredClone(p));
  if (r.status !== 'ok') throw new Error('STATUS ' + r.status + ' ' + r.calculationErrorCode);
  return r;
}

function row(r, i) {
  const x = r.rows[i];
  return { age: x.age, rmd: +x.rmd.toFixed(2), rmdDistributed: +x.rmdDistributed.toFixed(2), rmdUnmet: +x.rmdUnmet.toFixed(2),
    agi: +x.federalAgi.toFixed(2), taxes: +x.taxes.toFixed(2), taxSettled: +(x.taxSettled || 0).toFixed(2),
    trueUpPaid: +(x.taxTrueUpPaid || 0).toFixed(2), outstanding: +(x.taxOutstanding || 0).toFixed(2),
    preTax: +x.preTax.toFixed(2), roth: +x.roth.toFixed(2), taxable: +x.taxable.toFixed(2), withdrawals: +x.withdrawals.toFixed(2) };
}
function codes(r) { return (r.issues || []).map(i => i.code); }

module.exports = { h, acct, plan, check, row, codes };
