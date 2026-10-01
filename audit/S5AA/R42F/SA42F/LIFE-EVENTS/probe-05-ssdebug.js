const { run, show, codes, basePlan, account, E } = require('./lib.js');
const p = basePlan({ age: 85, endAge: 87, spending: 0, accounts: [account('brok','taxable',500000,{basisPct:100})], dividendOn:true, dividendYield:0 });
p.retirement.ssBenefit = 2000; p.retirement.ssClaim = 67; p.retirement.ssCola = 0;
const r = run(p); show(r, ['age','income','dividends']);
console.log(E.householdSocialSecurityDetail ? E.householdSocialSecurityDetail(p,85,86,83,0) : Object.keys(E).filter(k=>/ss|Social/i.test(k)));
p.retirement.ssClaim = 85; console.log(E.householdSocialSecurityDetail(p,85,86,83,0));
