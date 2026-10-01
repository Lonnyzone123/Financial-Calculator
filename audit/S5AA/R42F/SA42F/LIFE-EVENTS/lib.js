'use strict';
const h = require(require('path').join(__dirname, '..', 'harness.js'));
function run(p, quiet) {
  const v = h.validateScenario(structuredClone(p));
  const errs = v.issues.filter(x => x.severity === 'ERROR');
  const r = h.engine.runPlan(structuredClone(p));
  if (!quiet) console.log('valid=' + v.valid + (errs.length ? ' ' + JSON.stringify(errs) : '') + ' status=' + r.status + (r.calculationErrorCode ? ' code=' + r.calculationErrorCode : ''));
  r._valid = v.valid; r._vissues = v.issues;
  return r;
}
const F = ['age','income','spending','taxes','withdrawals','total','federalAgi','rmd','contributions','networth'];
function show(r, fields) { (fields||F).length; for (const row of r.rows) console.log((fields||F).map(f => f + '=' + (typeof row[f]==='number'? Math.round(row[f]*100)/100 : row[f])).join(' ')); }
function codes(r){ return (r.issues||[]).map(i=>i.code); }
module.exports = { h, run, show, codes, account: h.grid.account, basePlan: h.grid.basePlan, E: h.engine };
