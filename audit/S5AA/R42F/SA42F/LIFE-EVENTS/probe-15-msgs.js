const { run, basePlan, account } = require('./lib.js');
const p = basePlan({ couple: true, age: 72, spouseAge: 70, endAge: 77, spending: 0, rmdOn: true, pension: 60000, dividendOn: true, dividendYield: 0,
  accounts: [account('ira','traditionalIRA',1000000), account('brk','taxable',100000,{basisPct:100})] });
Object.assign(p.retirement, { selfLife: 73.5, spouseLife: 120 });
const r = run(p, true); for (const i of r.issues) console.log(i.code+': '+i.message+'\n');
