const { run, show, codes, basePlan, account } = require('./lib.js');
const p = basePlan({ couple: true, age: 55, spouseAge: 63, endAge: 70, retireAge: 65, salary: 100000, spending: 50000, healthOn: true,
  dividendOn: true, dividendYield: 0, accounts: [account('brk','taxable',1000000,{basisPct:100})] });
p.employment.contributionStop = 65;
Object.assign(p.retirement, { selfLife: 56.5, spouseLife: 120, ssBenefit: 2500, ssClaim: 67, spouseSS: 1500, spouseClaim: 67, ssCola: 0, survivor: true });
p.advanced.healthCost = 12000;
const r = run(p); show(r, ['age','income','spending','withdrawals','taxes','total']); console.log(codes(r).join(','));
