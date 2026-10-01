const { basePlan, account, h } = require('./lib.js');
for (const [a,e] of [[70,70],[70,69.5],[70.5,70.5],[70.5,70.7]]) {
  const p = basePlan({ age: a, endAge: e, spending: 10000, accounts: [account('brk','taxable',100000,{basisPct:100})] });
  const v = h.validateScenario(structuredClone(p)), r = h.engine.runPlan(structuredClone(p));
  console.log(a,e,'valid',v.valid, JSON.stringify(v.issues.filter(i=>i.severity==='ERROR').map(i=>i.code)), r.status, r.calculationErrorCode||'', r.rows? r.rows.map(x=>x.age+':'+x.spending).join(' '):'', r.successRate);
}
