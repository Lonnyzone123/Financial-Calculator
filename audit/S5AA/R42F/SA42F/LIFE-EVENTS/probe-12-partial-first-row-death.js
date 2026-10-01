const { run, show, codes, basePlan, account, E } = require('./lib.js');
const p = basePlan({ couple: true, age: 70.5, spouseAge: 68.25, endAge: 73, spending: 0, dividendOn: true, dividendYield: 0, rmdOn: true,
  accounts: [account('brk','taxable',100000,{basisPct:100}), account('sira','traditionalIRA',500000,{owner:'spouse'})] });
Object.assign(p.retirement, { ssBenefit: 1000, ssClaim: 70, spouseSS: 3000, spouseClaim: 67, ssCola: 0, survivor: true, spouseLife: 68.5 });
const r = run(p); show(r, ['age','income','rmd','federalAgi','taxes','preTax']); console.log(codes(r).join(','));
const s = (r.issues||[]).find(i=>i.code==='SPOUSAL_ROLLOVER_ASSUMED'); console.log(s && s.message.slice(0,300));
