const { run, show, codes, basePlan, account } = require('./lib.js');
function mk(owner, who) {
  const p = basePlan({ couple: true, age: 60, spouseAge: 62, endAge: 66, spending: 60000, dividendOn: true, dividendYield: 0,
    accounts: [account('brk','taxable',400000,{ owner, basisPct: 50 })] });
  Object.assign(p.retirement, { selfLife: who==='self'?61:120, spouseLife: who==='spouse'?63:120 });
  return p;
}
for (const [o,w] of [['spouse','spouse'],['self','self'],['joint','spouse'],['joint','self'],['self','spouse']]) {
  console.log('--- owner',o,'dies',w); const r = run(mk(o,w)); show(r,['age','withdrawals','federalAgi','taxes','total']);
}
