const { run, show, codes, basePlan, account, E } = require('./lib.js');
function mk(selfLife, spouseLife, opts={}) {
  const p = basePlan({ couple: true, age: 70, spouseAge: 68, endAge: 80, spending: 40000, healthOn: true,
    accounts: [account('brok','taxable',800000,{basisPct:100})] });
  Object.assign(p.retirement, { ssBenefit: 2000, ssClaim: 67, spouseSS: 1000, spouseClaim: 67, ssCola: 0, survivor: true, survivorSpendingReduction: 20, selfLife, spouseLife }, opts);
  p.advanced.healthCost = 0;
  return p;
}
for (const [sl, spl] of [[72, 120], [72.5, 120], [120, 70], [120, 70.5]]) {
  console.log('--- selfLife', sl, 'spouseLife', spl);
  const r = run(mk(sl, spl)); show(r, ['age','income','spending','taxes','federalAgi','total']); console.log(codes(r).join(','));
}
