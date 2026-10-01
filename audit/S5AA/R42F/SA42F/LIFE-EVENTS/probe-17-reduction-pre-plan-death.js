const { run, show, basePlan, account } = require('./lib.js');
const p = basePlan({ couple: true, age: 70, spouseAge: 70, endAge: 72, spending: 50000, dividendOn: true, dividendYield: 0, accounts: [account('brk','taxable',800000,{basisPct:100})] });
Object.assign(p.retirement, { survivor: true, survivorSpendingReduction: 20, spouseLife: 65 });
const r = run(p); show(r, ['age','spending']); console.log((r.issues||[]).map(i=>i.code).join(','));
