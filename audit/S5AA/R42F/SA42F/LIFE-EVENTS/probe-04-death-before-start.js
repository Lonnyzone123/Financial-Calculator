const { run, show, codes, basePlan, account, E, h } = require('./lib.js');
function mk(age, spouseAge, spouseLife) {
  const p = basePlan({ couple: true, age, spouseAge, endAge: 63, spending: 0, pension: 80000, dividendOn: true, dividendYield: 0,
    accounts: [account('brok','taxable',100000,{basisPct:100})] });
  Object.assign(p.retirement, { selfLife: 120, spouseLife });
  return p;
}
for (const [a, sa, sl] of [[60.5, 60.5, 60.2], [60.5, 60.5, 59.8], [60.5, 60.5, 120]]) {
  console.log('--- age', a, 'spouse', sa, 'spouseLife', sl);
  const r = run(mk(a, sa, sl)); show(r, ['age','income','federalAgi','taxes']); console.log(codes(r).join(','));
  const iss = (r.issues||[]).find(i=>i.code==='DEATH_BEFORE_PLAN_START'); if (iss) console.log(iss.message);
}
