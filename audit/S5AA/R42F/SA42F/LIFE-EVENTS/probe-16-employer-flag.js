const { run, show, basePlan, account } = require('./lib.js');
const p = basePlan({ couple: true, age: 76, spouseAge: 74, endAge: 79, retireAge: 78, spending: 0, rmdOn: true, dividendOn: true, dividendYield: 0,
  accounts: [account('k_self','traditional401k',400000,{owner:'self',currentEmployerPlan:true}),
             account('k_sp','traditional401k',300000,{owner:'spouse',contribution:1000}), account('brk','taxable',1000,{basisPct:100})] });
p.employment.salary = 0; p.employment.spouseSalary = 80000; p.employment.contributionStop = 80;
Object.assign(p.retirement, { selfLife: 76.5, spouseLife: 120 });
const r = run(p); show(r, ['age','rmd','preTax','federalAgi']);
console.log('hand: self 76 retired? self salary 0 -> self not still working: row 77 self RMD 400000/23.7=' + (400000/23.7).toFixed(2) + '; spouse 74 working, own plan current -> exempt;');
console.log('row 78 (spouse 75, inherited 401k not current employer): RMD on inherited = (400000-16877.64)/24.6=' + ((400000-400000/23.7)/24.6).toFixed(2));
