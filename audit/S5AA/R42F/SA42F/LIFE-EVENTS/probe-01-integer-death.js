const { run, show, codes, basePlan, account } = require('./lib.js');
// single, 85, SS 2000/mo claimed at 67 (already), spending 30000, life 87 integer; end 95
const p = basePlan({ age: 85, endAge: 95, spending: 30000, accounts: [account('brok','taxable',500000,{basisPct:100})], healthOn: true });
p.retirement.ssBenefit = 2000; p.retirement.ssClaim = 67; p.retirement.ssCola = 0; p.retirement.selfLife = 87;
p.advanced.healthCost = 0;
const r = run(p); show(r, ['age','income','spending','taxes','withdrawals','total']); console.log(codes(r));
console.log(JSON.stringify(r.rows.map(x=>Object.keys(x)).slice(1,2)));
