const { run, show, codes, basePlan, account, E, h } = require('./lib.js');
const p = basePlan({ couple: true, age: 70, spouseAge: 70, endAge: 78, spending: 0, healthOn: true, dividendOn: true, dividendYield: 0,
  accounts: [account('brk','taxable',100000,{basisPct:100})],
  otherIncomes: [{ name:'pen', type:'other', owner:'household', amount:180000, start:0, end:200, growth:0, growthMode:'fixed' }] });
Object.assign(p.retirement, { spouseLife: 73 });
p.advanced.healthCost = 0;
const r = run(p); show(r, ['age','income','spending','federalAgi','irmaaMagi']);
console.log(JSON.stringify(h.RULES.medicare.irmaa.singleThresholds), JSON.stringify(h.RULES.medicare.irmaa.jointThresholds), JSON.stringify(h.RULES.medicare.irmaa.partBMonthly), JSON.stringify(h.RULES.medicare.irmaa.partDMonthlySurcharge));
