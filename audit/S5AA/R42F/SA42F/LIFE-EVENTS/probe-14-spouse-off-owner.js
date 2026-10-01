const { run, show, codes, basePlan, account, h } = require('./lib.js');
function mk(owner, spouseAge) {
  const p = basePlan({ age: 65, endAge: 67, spending: 40000, dividendOn: true, dividendYield: 0,
    accounts: [account('ira','traditionalIRA',500000,{owner})] });
  p.profile.spouseAge = spouseAge; return p;
}
for (const [o,sa] of [['self',50],['spouse',50],['spouse',80]]) {
  const p = mk(o,sa); const v = h.validateScenario(structuredClone(p));
  console.log('--- owner',o,'spouseAge',sa,'spouseOn false; validator',v.valid, JSON.stringify(v.issues.map(i=>i.code)));
  const r = run(p,true); show(r,['age','withdrawals','federalAgi','taxes']); console.log(codes(r).join(','));
}
