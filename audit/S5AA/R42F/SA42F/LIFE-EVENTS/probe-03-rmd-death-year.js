const { run, show, codes, basePlan, account, E } = require('./lib.js');
function mk(selfLife) {
  const p = basePlan({ couple: true, age: 72, spouseAge: 70, endAge: 76, spending: 0, rmdOn: true,
    accounts: [account('ira','traditionalIRA',1000000), account('brok','taxable',100000,{basisPct:100})] });
  Object.assign(p.retirement, { ssBenefit: 0, spouseSS: 0, selfLife, spouseLife: 120 });
  p.advanced.qcd = 0;
  return p;
}
for (const sl of [73.5, 120, 74.5]) {
  console.log('--- selfLife', sl);
  const r = run(mk(sl)); show(r, ['age','income','rmd','rmdDistributed','taxes','federalAgi','preTax','taxable','total']); console.log(codes(r).join(','));
}
