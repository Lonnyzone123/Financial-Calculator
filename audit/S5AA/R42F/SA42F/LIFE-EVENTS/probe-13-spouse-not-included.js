const { run, show, codes, basePlan, account, h } = require('./lib.js');
const p = basePlan({ age: 75, endAge: 78, spending: 0, rmdOn: true, dividendOn: true, dividendYield: 0,
  accounts: [account('sira','traditionalIRA',500000,{owner:'spouse'}), account('brk','taxable',1000,{basisPct:100})] });
p.profile.spouseAge = 80;
const v = h.validateScenario(structuredClone(p)); console.log(JSON.stringify(v.issues.map(i=>i.severity+':'+i.code+'@'+i.path)));
const r = run(p, true); console.log(r.status); show(r, ['age','rmd','preTax','taxes']); console.log(codes(r).join(','));
