const { run, show, codes, basePlan, account, E, h } = require('./lib.js');
function mk(sl, spl) {
  const p = basePlan({ couple: true, age: 75, spouseAge: 60, endAge: 79, spending: 0, rmdOn: true, dividendOn: true, dividendYield: 0,
    accounts: [account('ira','traditionalIRA',1000000), account('brk','taxable',10000,{basisPct:100})] });
  Object.assign(p.retirement, { selfLife: sl, spouseLife: spl });
  p.advanced.qcd = 0; return p;
}
const J = h.RULES.retirement.rmd.jointLastSurvivor.rows, U = h.RULES.retirement.rmd.uniformLifetime;
console.log('JLS 75/60', J['75'][60], 'JLS 76/61', J['76'][61], 'U76', U['76'], 'U77', U['77'], 'U78', U['78']);
for (const [sl,spl] of [[120, 61.5],[120,120]]) { console.log('--- selfLife',sl,'spouseLife',spl); const r=run(mk(sl,spl)); show(r,['age','rmd','preTax']); }
